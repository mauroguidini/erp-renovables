-- Módulo: Obreros por obra (PASO 2 de Parte de asistencia)
-- Qué hace este script:
-- 1. Crea "obreros": una lista propia de cada obra (no el catálogo de
--    "empleados" que ya existe para las OT — son personas distintas, sin
--    relación con el sistema). Capataz/jefe_obra/administrador pueden
--    agregar obreros y desactivarlos; no hay borrado físico porque quedan
--    referenciados por partes de asistencia ya cerrados.
-- 2. Reconstruye "partes_asistencia_detalle" y "partes_asistencia_historial"
--    para que apunten a "obreros" en vez de a "empleados". Esto BORRA
--    cualquier parte de asistencia de prueba que hayas cargado hasta ahora
--    (no hay datos reales todavía, según lo último que probaste). El
--    encabezado "partes_asistencia" no cambia de forma, pero queda vacío.
-- 3. crear_parte_asistencia ahora arma el detalle con los obreros ACTIVOS
--    de esa obra puntual (antes usaba el catálogo global de empleados
--    activos).
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 039.

-- =========================================================================
-- 1. Obreros
-- =========================================================================

create table obreros (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table obreros enable row level security;

create policy "obreros_select" on obreros
  for select to authenticated using (puede_ver_obras());

create policy "obreros_insert" on obreros
  for insert to authenticated with check (puede_registrar_asistencia());

create policy "obreros_update" on obreros
  for update to authenticated using (puede_registrar_asistencia()) with check (puede_registrar_asistencia());

revoke all on obreros from anon;

-- =========================================================================
-- 2. Reconstruir detalle e historial apuntando a obreros
-- =========================================================================

drop table if exists partes_asistencia_historial cascade;
drop table if exists partes_asistencia_detalle cascade;
drop function if exists crear_parte_asistencia(uuid, date, time);
drop function if exists registrar_historial_asistencia_detalle();

create table partes_asistencia_detalle (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null references partes_asistencia(id) on delete cascade,
  obrero_id uuid not null references obreros(id),
  presente boolean not null default false,
  llego_tarde boolean not null default false,
  se_fue_antes boolean not null default false,
  unique (parte_id, obrero_id),
  check (not llego_tarde or presente),
  check (not se_fue_antes or presente)
);

create table partes_asistencia_historial (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null references partes_asistencia(id) on delete cascade,
  obrero_id uuid references obreros(id),
  campo text not null,
  valor_anterior text,
  valor_nuevo text,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz not null default now()
);

alter table partes_asistencia_detalle enable row level security;
alter table partes_asistencia_historial enable row level security;

create policy "partes_asistencia_detalle_select" on partes_asistencia_detalle
  for select to authenticated using (puede_ver_obras());

create policy "partes_asistencia_historial_select" on partes_asistencia_historial
  for select to authenticated using (puede_ver_obras());

create policy "partes_asistencia_detalle_update" on partes_asistencia_detalle
  for update to authenticated
  using (
    is_admin()
    or (
      puede_registrar_asistencia()
      and exists (
        select 1 from partes_asistencia p
        where p.id = partes_asistencia_detalle.parte_id and p.estado = 'abierto'
      )
    )
  )
  with check (is_admin() or puede_registrar_asistencia());

revoke all on partes_asistencia_detalle from anon;
revoke all on partes_asistencia_historial from anon;

create or replace function crear_parte_asistencia(
  p_obra_id uuid,
  p_fecha date,
  p_hora_inicio time
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

  insert into partes_asistencia (obra_id, fecha, hora_inicio, creado_por, creado_por_email)
  values (
    p_obra_id,
    p_fecha,
    p_hora_inicio,
    auth.uid(),
    (select email from profiles where id = auth.uid())
  )
  returning id into v_parte_id;

  insert into partes_asistencia_detalle (parte_id, obrero_id)
  select v_parte_id, id from obreros where obra_id = p_obra_id and activo = true;

  return v_parte_id;
end;
$$;

grant execute on function crear_parte_asistencia(uuid, date, time) to authenticated;
revoke execute on function crear_parte_asistencia(uuid, date, time) from anon;

create or replace function registrar_historial_asistencia_detalle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cerrado boolean;
  v_usuario_email text;
begin
  select (estado = 'cerrado') into v_cerrado from partes_asistencia where id = new.parte_id;

  if not v_cerrado then
    return new;
  end if;

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

  return new;
end;
$$;

drop trigger if exists partes_asistencia_detalle_historial on partes_asistencia_detalle;
create trigger partes_asistencia_detalle_historial
  after update on partes_asistencia_detalle
  for each row execute function registrar_historial_asistencia_detalle();

-- Verificación: tiene que devolver 0 filas, sin error.
select * from obreros;
