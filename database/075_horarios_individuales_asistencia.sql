-- Módulo: Horarios individuales por obrero en el Parte de asistencia
-- Qué hace este script (sobre un módulo YA EN PRODUCCIÓN, con datos reales):
-- 1. Agrega "hora_salida_prevista" al encabezado del parte (partes_asistencia)
--    — el horario de salida por defecto de la jornada, definido al ABRIR el
--    parte (junto con hora_inicio), no recién al cerrar como hoy. Así hay un
--    default disponible durante todo el día para pre-cargar a cada obrero.
-- 2. Agrega "hora_entrada" y "hora_salida" a cada fila de detalle
--    (partes_asistencia_detalle) — el horario REAL de cada obrero, editable
--    individualmente. Los tildes "llego_tarde"/"se_fue_antes" NO se tocan,
--    seguyen siendo manuales e independientes del horario (a pedido
--    explícito de Mauro — se puede calcular solo más adelante si hace
--    falta, pero no en esta vuelta).
-- 3. Migra los partes YA CARGADOS sin perder nada: a cada obrero presente de
--    un parte ya cerrado se le completa hora_entrada/hora_salida con el
--    hora_inicio/hora_cierre de ESE parte (en ese momento todos compartían
--    el mismo horario, así que no se inventa nada, se refleja lo que pasó
--    de verdad). Un parte todavía abierto solo recibe hora_entrada (con
--    hora_inicio); hora_salida_prevista le queda vacía — la pantalla se lo
--    va a pedir una sola vez la próxima vez que se abra (ver
--    fijar_horario_previsto más abajo).
-- 4. Reescribe crear_parte_asistencia para pedir también la salida prevista
--    al abrir (firma nueva: agrega p_hora_salida_prevista).
-- 5. Reescribe cerrar_parte_asistencia para VALIDAR antes de cerrar: todo
--    obrero marcado presente tiene que tener hora_entrada y hora_salida
--    cargadas y coherentes (entrada antes que salida) — si no, rechaza el
--    cierre y avisa a quién le falta corregir algo.
-- 6. Función nueva "reabrir_parte_asistencia": exclusiva de administrador +
--    administración (hoy la corrección de un parte cerrado era solo de
--    administrador — se amplía a administración porque así lo pidió Mauro).
-- 7. Función nueva "fijar_horario_previsto": para que capataz/jefe_obra
--    puedan completar o ajustar la salida prevista de la jornada mientras
--    el parte sigue abierto (cubre tanto el caso de partes viejos migrados
--    sin ese dato, como un cambio de planes a mitad de día).
-- 8. El historial de auditoría (partes_asistencia_historial) ANTES solo
--    registraba correcciones hechas a un parte YA CERRADO. Ahora registra
--    TODO cambio, en cualquier momento (quién, qué campo, de qué valor a
--    qué valor, cuándo) — incluye además el estado (abrir/cerrar/reabrir) y
--    los horarios nuevos. Esto genera bastantes más filas que antes (por
--    ejemplo, tildar presente a 15 obreros genera 15 filas), a propósito,
--    porque ahora se pidió auditar también los cambios mientras el parte
--    sigue abierto, no solo las correcciones posteriores al cierre.
--
-- Nada de esto rompe partes ya cargados ni cambia el comportamiento de
-- ningún otro módulo del sistema.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 074.

-- =========================================================================
-- 1. Columnas nuevas (aditivas) + migración de los partes ya cargados
-- =========================================================================

alter table partes_asistencia add column if not exists hora_salida_prevista time;
alter table partes_asistencia_detalle add column if not exists hora_entrada time;
alter table partes_asistencia_detalle add column if not exists hora_salida time;

-- Partes ya cerrados: la salida prevista de ese día fue, de hecho, la hora
-- de cierre que se usó.
update partes_asistencia
set hora_salida_prevista = hora_cierre
where hora_salida_prevista is null and hora_cierre is not null;

-- Cada obrero presente de un parte YA CARGADO compartía el mismo horario de
-- toda la cuadrilla — se refleja eso, no se inventa nada.
update partes_asistencia_detalle d
set hora_entrada = p.hora_inicio
from partes_asistencia p
where d.parte_id = p.id and d.presente = true and d.hora_entrada is null;

update partes_asistencia_detalle d
set hora_salida = p.hora_cierre
from partes_asistencia p
where d.parte_id = p.id and d.presente = true and d.hora_salida is null and p.hora_cierre is not null;

alter table partes_asistencia_detalle drop constraint if exists partes_asistencia_detalle_horario_si_presente;
alter table partes_asistencia_detalle
  add constraint partes_asistencia_detalle_horario_si_presente
  check (presente or (hora_entrada is null and hora_salida is null));

-- =========================================================================
-- 2. Permisos: administración se suma a la corrección de partes cerrados
-- =========================================================================

create or replace function puede_corregir_asistencia_cerrada()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'administracion')
  );
$$;

grant execute on function puede_corregir_asistencia_cerrada() to authenticated;

drop policy if exists "partes_asistencia_update_admin" on partes_asistencia;
drop policy if exists "partes_asistencia_update" on partes_asistencia;
create policy "partes_asistencia_update" on partes_asistencia
  for update to authenticated
  using (puede_corregir_asistencia_cerrada())
  with check (puede_corregir_asistencia_cerrada());

drop policy if exists "partes_asistencia_detalle_update" on partes_asistencia_detalle;
create policy "partes_asistencia_detalle_update" on partes_asistencia_detalle
  for update to authenticated
  using (
    puede_corregir_asistencia_cerrada()
    or (
      puede_registrar_asistencia()
      and exists (
        select 1 from partes_asistencia p
        where p.id = partes_asistencia_detalle.parte_id and p.estado = 'abierto'
      )
    )
  )
  with check (puede_corregir_asistencia_cerrada() or puede_registrar_asistencia());

-- =========================================================================
-- 3. Abrir un parte: ahora también pide la salida prevista de la jornada
-- =========================================================================

drop function if exists crear_parte_asistencia(uuid, date, time);

create or replace function crear_parte_asistencia(
  p_obra_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_hora_salida_prevista time
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_parte_id uuid;
begin
  select role into v_rol from profiles where id = auth.uid();

  if v_rol not in ('administrador', 'capataz', 'jefe_obra') then
    raise exception 'No tenés permiso para abrir un parte de asistencia';
  end if;

  if exists (select 1 from partes_asistencia where obra_id = p_obra_id and fecha = p_fecha) then
    raise exception 'Ya existe un parte de asistencia para esta obra en esa fecha';
  end if;

  insert into partes_asistencia
    (obra_id, fecha, hora_inicio, hora_salida_prevista, creado_por, creado_por_email)
  values (
    p_obra_id,
    p_fecha,
    p_hora_inicio,
    p_hora_salida_prevista,
    auth.uid(),
    (select email from profiles where id = auth.uid())
  )
  returning id into v_parte_id;

  insert into partes_asistencia_detalle (parte_id, obrero_id)
  select v_parte_id, id from obreros where obra_id = p_obra_id and activo = true;

  return v_parte_id;
end;
$$;

grant execute on function crear_parte_asistencia(uuid, date, time, time) to authenticated;
revoke execute on function crear_parte_asistencia(uuid, date, time, time) from anon;

-- =========================================================================
-- 4. Completar/ajustar la salida prevista mientras el parte sigue abierto
--    (cubre los partes viejos migrados sin este dato, y un cambio de plan
--    a mitad de día).
-- =========================================================================

create or replace function fijar_horario_previsto(
  p_parte_id uuid,
  p_hora_salida_prevista time
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
    raise exception 'No tenés permiso para fijar el horario previsto de este parte';
  end if;

  select estado into v_estado_actual from partes_asistencia where id = p_parte_id;

  if not found then
    raise exception 'El parte de asistencia % no existe', p_parte_id;
  end if;

  if v_estado_actual = 'cerrado' then
    raise exception 'Este parte ya está cerrado';
  end if;

  update partes_asistencia
  set hora_salida_prevista = p_hora_salida_prevista
  where id = p_parte_id;
end;
$$;

grant execute on function fijar_horario_previsto(uuid, time) to authenticated;
revoke execute on function fijar_horario_previsto(uuid, time) from anon;

-- =========================================================================
-- 5. Cerrar un parte: ahora valida horarios antes de permitirlo
-- =========================================================================

create or replace function cerrar_parte_asistencia(
  p_parte_id uuid,
  p_hora_cierre time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_estado_actual text;
  v_incompletos text;
begin
  select role into v_rol from profiles where id = auth.uid();

  if v_rol not in ('administrador', 'capataz', 'jefe_obra') then
    raise exception 'No tenés permiso para cerrar un parte de asistencia';
  end if;

  select estado into v_estado_actual from partes_asistencia where id = p_parte_id;

  if not found then
    raise exception 'El parte de asistencia % no existe', p_parte_id;
  end if;

  if v_estado_actual = 'cerrado' then
    raise exception 'Este parte ya está cerrado';
  end if;

  select string_agg(o.nombre, ', ' order by o.nombre)
  into v_incompletos
  from partes_asistencia_detalle d
  join obreros o on o.id = d.obrero_id
  where d.parte_id = p_parte_id
    and d.presente = true
    and (
      d.hora_entrada is null
      or d.hora_salida is null
      or d.hora_entrada >= d.hora_salida
    );

  if v_incompletos is not null then
    raise exception
      'Falta corregir el horario de: %. Cada presente necesita entrada y salida cargadas, con la entrada antes que la salida.',
      v_incompletos;
  end if;

  update partes_asistencia
  set
    estado = 'cerrado',
    hora_cierre = p_hora_cierre,
    cerrado_por = auth.uid(),
    cerrado_por_email = (select email from profiles where id = auth.uid()),
    cerrado_en = now()
  where id = p_parte_id;
end;
$$;

grant execute on function cerrar_parte_asistencia(uuid, time) to authenticated;
revoke execute on function cerrar_parte_asistencia(uuid, time) from anon;

-- =========================================================================
-- 6. Reabrir un parte cerrado: exclusivo de administrador/administración
-- =========================================================================

create or replace function reabrir_parte_asistencia(p_parte_id uuid)
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

  if v_rol not in ('administrador', 'administracion') then
    raise exception 'Solo administración puede reabrir un parte de asistencia cerrado';
  end if;

  select estado into v_estado_actual from partes_asistencia where id = p_parte_id;

  if not found then
    raise exception 'El parte de asistencia % no existe', p_parte_id;
  end if;

  if v_estado_actual = 'abierto' then
    raise exception 'Este parte ya está abierto';
  end if;

  update partes_asistencia set estado = 'abierto' where id = p_parte_id;
end;
$$;

grant execute on function reabrir_parte_asistencia(uuid) to authenticated;
revoke execute on function reabrir_parte_asistencia(uuid) from anon;

-- =========================================================================
-- 7. Auditoría: ahora registra TODO cambio, no solo correcciones post-cierre
-- =========================================================================

create or replace function registrar_historial_asistencia_detalle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_email text;
begin
  v_usuario_email := (select email from profiles where id = auth.uid());

  if new.presente is distinct from old.presente then
    insert into partes_asistencia_historial
      (parte_id, obrero_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.parte_id, new.obrero_id, 'presente', old.presente::text, new.presente::text, auth.uid(), v_usuario_email);
  end if;

  if new.llego_tarde is distinct from old.llego_tarde then
    insert into partes_asistencia_historial
      (parte_id, obrero_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.parte_id, new.obrero_id, 'llego_tarde', old.llego_tarde::text, new.llego_tarde::text, auth.uid(), v_usuario_email);
  end if;

  if new.se_fue_antes is distinct from old.se_fue_antes then
    insert into partes_asistencia_historial
      (parte_id, obrero_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.parte_id, new.obrero_id, 'se_fue_antes', old.se_fue_antes::text, new.se_fue_antes::text, auth.uid(), v_usuario_email);
  end if;

  if new.hora_entrada is distinct from old.hora_entrada then
    insert into partes_asistencia_historial
      (parte_id, obrero_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.parte_id, new.obrero_id, 'hora_entrada', old.hora_entrada::text, new.hora_entrada::text, auth.uid(), v_usuario_email);
  end if;

  if new.hora_salida is distinct from old.hora_salida then
    insert into partes_asistencia_historial
      (parte_id, obrero_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.parte_id, new.obrero_id, 'hora_salida', old.hora_salida::text, new.hora_salida::text, auth.uid(), v_usuario_email);
  end if;

  return new;
end;
$$;

drop trigger if exists partes_asistencia_detalle_historial on partes_asistencia_detalle;
create trigger partes_asistencia_detalle_historial
  after update on partes_asistencia_detalle
  for each row execute function registrar_historial_asistencia_detalle();

create or replace function registrar_historial_asistencia_encabezado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_email text;
begin
  v_usuario_email := (select email from profiles where id = auth.uid());

  if new.estado is distinct from old.estado then
    insert into partes_asistencia_historial
      (parte_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.id, 'estado', old.estado, new.estado, auth.uid(), v_usuario_email);
  end if;

  if new.hora_inicio is distinct from old.hora_inicio then
    insert into partes_asistencia_historial
      (parte_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.id, 'hora_inicio', old.hora_inicio::text, new.hora_inicio::text, auth.uid(), v_usuario_email);
  end if;

  if new.hora_salida_prevista is distinct from old.hora_salida_prevista then
    insert into partes_asistencia_historial
      (parte_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.id, 'hora_salida_prevista', old.hora_salida_prevista::text, new.hora_salida_prevista::text, auth.uid(), v_usuario_email);
  end if;

  if new.hora_cierre is distinct from old.hora_cierre then
    insert into partes_asistencia_historial
      (parte_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.id, 'hora_cierre', old.hora_cierre::text, new.hora_cierre::text, auth.uid(), v_usuario_email);
  end if;

  return new;
end;
$$;

drop trigger if exists partes_asistencia_historial_encabezado on partes_asistencia;
create trigger partes_asistencia_historial_encabezado
  after update on partes_asistencia
  for each row execute function registrar_historial_asistencia_encabezado();

-- Verificación: tiene que devolver filas (los partes que ya tenías), sin
-- error, y las columnas nuevas tienen que estar presentes.
select id, obra_id, fecha, hora_inicio, hora_salida_prevista, hora_cierre, estado
from partes_asistencia
order by fecha desc
limit 20;
