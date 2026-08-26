-- Módulo: OT vencida + reprogramación (PASO 1 de varios)
-- Qué hace este script:
-- 1. Crea "ot_historial_fechas": una fila por cada vez que la fecha límite
--    de una OT cambia de verdad (a qué OT, la fecha que tenía antes, la
--    fecha nueva, quién lo hizo, cuándo). La ven los 4 roles que ven
--    Obras/OT. Nadie puede insertar ahí directamente, solo el trigger.
-- 2. Un trigger en ordenes_trabajo que graba una fila ahí cada vez que
--    "fecha_limite" cambia de verdad. La fecha límite ORIGINAL no se
--    guarda en ninguna columna aparte: es el valor "anterior" de la
--    primera fila de este historial para esa OT (si nunca se reprogramó,
--    la original es simplemente la fecha_limite actual de la OT).
--
-- No hace falta tocar ninguna política de seguridad para poder cambiar la
-- fecha límite — la que ya existe (jefe_obra/admin pueden editar una OT
-- que no esté "cumplida") ya permite exactamente esto.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 037.

create table ot_historial_fechas (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references ordenes_trabajo(id) on delete cascade,
  fecha_limite_anterior date,
  fecha_limite_nueva date not null,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz not null default now()
);

alter table ot_historial_fechas enable row level security;

create policy "ot_historial_fechas_select" on ot_historial_fechas
  for select to authenticated using (puede_ver_obras());

revoke all on ot_historial_fechas from anon;

create or replace function registrar_historial_fecha_ot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fecha_limite is distinct from old.fecha_limite then
    insert into ot_historial_fechas (ot_id, fecha_limite_anterior, fecha_limite_nueva, usuario_id, usuario_email)
    values (
      new.id,
      old.fecha_limite,
      new.fecha_limite,
      auth.uid(),
      (select email from profiles where id = auth.uid())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists ordenes_trabajo_historial_fecha on ordenes_trabajo;
create trigger ordenes_trabajo_historial_fecha
  after update of fecha_limite on ordenes_trabajo
  for each row execute function registrar_historial_fecha_ot();

-- Verificación: tiene que devolver una tabla vacía (0 filas), sin error.
select * from ot_historial_fechas;
