-- Módulo: Número de OT, reemplazo entre OT y evidencia fotográfica (PASO 1)
-- Qué hace este script:
-- 1. Agrega "numero" a ordenes_trabajo: un correlativo único DENTRO de cada
--    obra (no global). Un trigger lo asigna solo al crear una OT nueva. A
--    las OT que ya existen les asigna número según el orden en que se
--    cargaron — no cambia nada más de ellas.
-- 2. Agrega "reemplaza_a_id" y el estado nuevo "reemplazada" (además de los
--    4 que ya existían: pendiente/cumplida/no_cumplida/parcial). Una función
--    "reemplazar_ot" es la única forma de setear esto: valida que las dos OT
--    sean de la MISMA obra, que la OT vieja no esté ya cumplida ni
--    reemplazada, y que no la haya reemplazado ya otra. El historial de
--    quién y cuándo lo hizo queda en "ot_historial_estados", la misma
--    tabla que ya registra los cambios de estado de siempre — no hace falta
--    una tabla de auditoría nueva.
--    Una OT reemplazada queda bloqueada para roles de obra, igual que una
--    cumplida (no se toca a mano vía marcar_estado_ot).
--    OJO: esto NO incluye manejo de monto (economías/demasías) todavía —
--    eso queda para una etapa aparte. Cuando se agregue, es una columna
--    nueva colgada de esta misma relación, sin tocar nada de lo de acá.
-- 3. Evidencia fotográfica: se guarda en el MISMO bucket privado que ya
--    usamos para archivos de obra ("obras-archivos"), en una subcarpeta por
--    OT (<obra_id>/ot-evidencias/<ot_id>/...). No hace falta una tabla ni
--    políticas nuevas de Storage: las que ya existen alcanzan porque el
--    primer tramo de la ruta sigue siendo el id de la obra.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 040.

-- =========================================================================
-- 1. Número de OT por obra
-- =========================================================================

alter table ordenes_trabajo add column numero integer;

with numerado as (
  select id, row_number() over (partition by obra_id order by created_at, id) as rn
  from ordenes_trabajo
)
update ordenes_trabajo o
set numero = n.rn
from numerado n
where o.id = n.id;

alter table ordenes_trabajo alter column numero set not null;
alter table ordenes_trabajo add constraint ordenes_trabajo_obra_numero_unique unique (obra_id, numero);

create or replace function asignar_numero_ot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero
    from ordenes_trabajo
    where obra_id = new.obra_id;
  end if;
  return new;
end;
$$;

drop trigger if exists ordenes_trabajo_asignar_numero on ordenes_trabajo;
create trigger ordenes_trabajo_asignar_numero
  before insert on ordenes_trabajo
  for each row execute function asignar_numero_ot();

-- =========================================================================
-- 2. Reemplazo entre OT
-- =========================================================================

alter table ordenes_trabajo add column reemplaza_a_id uuid references ordenes_trabajo(id);
alter table ordenes_trabajo add constraint ordenes_trabajo_no_autoreemplazo check (reemplaza_a_id is distinct from id);
alter table ordenes_trabajo add constraint ordenes_trabajo_reemplaza_a_unique unique (reemplaza_a_id);

-- Amplía el check de "estado" para sumar 'reemplazada' sin tocar los otros
-- checks de la tabla (tipo, motivo_incumplimiento) — busca puntualmente el
-- que aplica solo a la columna "estado".
do $$
declare
  v_attnum smallint;
  c record;
begin
  select attnum into v_attnum from pg_attribute
    where attrelid = 'ordenes_trabajo'::regclass and attname = 'estado';

  for c in
    select conname from pg_constraint
    where conrelid = 'ordenes_trabajo'::regclass
      and contype = 'c'
      and conkey = array[v_attnum]
  loop
    execute format('alter table ordenes_trabajo drop constraint %I', c.conname);
  end loop;
end $$;

alter table ordenes_trabajo
  add constraint ordenes_trabajo_estado_check
  check (estado in ('pendiente', 'cumplida', 'no_cumplida', 'parcial', 'reemplazada'));

-- Una OT reemplazada queda bloqueada para roles de obra, igual que cumplida.
drop policy if exists "ot_update" on ordenes_trabajo;
create policy "ot_update" on ordenes_trabajo
  for update to authenticated
  using (is_admin() or (puede_gestionar_obras() and estado not in ('cumplida', 'reemplazada')))
  with check (is_admin() or puede_gestionar_obras());

-- marcar_estado_ot: no deja setear 'reemplazada' a mano (solo la asigna
-- reemplazar_ot), y extiende el bloqueo de "ya está cerrada" para incluir
-- también una OT ya reemplazada.
create or replace function marcar_estado_ot(
  p_ot_id uuid,
  p_estado text,
  p_motivo_incumplimiento text default null,
  p_motivo_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_estado_actual text;
begin
  select role into v_rol from profiles where id = auth.uid();

  if v_rol not in ('administrador', 'capataz', 'jefe_obra') then
    raise exception 'No tenés permiso para cambiar el estado de una orden de trabajo';
  end if;

  if p_estado = 'reemplazada' then
    raise exception 'Este estado se asigna automáticamente al reemplazar una OT, no se puede elegir directamente';
  end if;

  select estado into v_estado_actual from ordenes_trabajo where id = p_ot_id;

  if not found then
    raise exception 'La orden de trabajo % no existe', p_ot_id;
  end if;

  if v_estado_actual in ('cumplida', 'reemplazada') and v_rol <> 'administrador' then
    raise exception 'Esta OT ya está % y está cerrada. Solo un administrador puede modificarla — pedíselo por fuera del sistema.', v_estado_actual;
  end if;

  update ordenes_trabajo
  set
    estado = p_estado,
    motivo_incumplimiento = case
      when p_estado = 'no_cumplida' then p_motivo_incumplimiento
      else null
    end,
    motivo_detalle = case
      when p_estado = 'no_cumplida' and p_motivo_incumplimiento = 'otro' then p_motivo_detalle
      else null
    end
  where id = p_ot_id;
end;
$$;

create or replace function reemplazar_ot(
  p_ot_anterior_id uuid,
  p_ot_nueva_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_obra_anterior uuid;
  v_obra_nueva uuid;
  v_estado_anterior text;
  v_reemplazo_previo uuid;
begin
  select role into v_rol from profiles where id = auth.uid();

  if v_rol not in ('administrador', 'capataz', 'jefe_obra') then
    raise exception 'No tenés permiso para marcar el reemplazo de una orden de trabajo';
  end if;

  if p_ot_anterior_id = p_ot_nueva_id then
    raise exception 'Una OT no puede reemplazarse a sí misma';
  end if;

  select obra_id, estado into v_obra_anterior, v_estado_anterior
  from ordenes_trabajo where id = p_ot_anterior_id;

  if not found then
    raise exception 'La OT a reemplazar no existe';
  end if;

  select obra_id into v_obra_nueva from ordenes_trabajo where id = p_ot_nueva_id;

  if not found then
    raise exception 'La OT nueva no existe';
  end if;

  if v_obra_anterior <> v_obra_nueva then
    raise exception 'Las dos OT tienen que ser de la misma obra';
  end if;

  if v_estado_anterior in ('cumplida', 'reemplazada') then
    raise exception 'Esta OT ya está % y no se puede reemplazar', v_estado_anterior;
  end if;

  select reemplaza_a_id into v_reemplazo_previo from ordenes_trabajo where id = p_ot_nueva_id;

  if v_reemplazo_previo is not null then
    raise exception 'La OT nueva ya tiene un reemplazo registrado';
  end if;

  update ordenes_trabajo set reemplaza_a_id = p_ot_anterior_id where id = p_ot_nueva_id;
  update ordenes_trabajo set estado = 'reemplazada' where id = p_ot_anterior_id;
end;
$$;

grant execute on function reemplazar_ot(uuid, uuid) to authenticated;
revoke execute on function reemplazar_ot(uuid, uuid) from anon;

-- Verificación: tiene que devolver la lista de OT con su número nuevo,
-- ordenadas por obra — revisá que no haya ningún "numero" repetido dentro
-- de la misma obra.
select obra_id, numero, descripcion, estado from ordenes_trabajo order by obra_id, numero;
