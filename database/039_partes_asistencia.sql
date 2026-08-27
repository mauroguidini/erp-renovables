-- Módulo: Parte de asistencia diario por obra (PASO 1 de varios)
-- Qué hace este script:
-- 1. Crea una capacidad nueva "puede_registrar_asistencia()": administrador,
--    capataz y jefe_obra (capataz no está incluido en puede_gestionar_obras(),
--    por eso una función aparte, igual que se hizo para entrega de material).
-- 2. Crea "partes_asistencia" (un parte = una obra + un día) y
--    "partes_asistencia_detalle" (una fila por empleado dentro de ese parte:
--    presente / llegó tarde / se fue antes).
-- 3. Dos funciones para la única forma de abrir y cerrar un parte:
--    - crear_parte_asistencia: crea el encabezado del día y, de una,
--      la fila de TODOS los empleados activos del catálogo (así el capataz
--      solo tilda, no carga de a uno).
--    - cerrar_parte_asistencia: fija la hora de cierre. A partir de ahí,
--      ningún rol de obra puede tocar el parte — solo administrador.
-- 4. "partes_asistencia_historial": registra automáticamente (via trigger)
--    cada corrección que un administrador haga DESPUÉS de que el parte ya
--    estaba cerrado (quién, qué campo, de qué valor a qué valor, cuándo).
--    Los tildes normales del día, mientras el parte sigue abierto, no generan
--    historial — solo las correcciones a un parte ya cerrado.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 038.

-- =========================================================================
-- 1. Capacidad
-- =========================================================================

create or replace function puede_registrar_asistencia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'capataz', 'jefe_obra')
  );
$$;

grant execute on function puede_registrar_asistencia() to authenticated;

-- =========================================================================
-- 2. Tablas
-- =========================================================================

create table partes_asistencia (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  fecha date not null,
  hora_inicio time not null,
  hora_cierre time,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  cerrado_por uuid,
  cerrado_por_email text,
  cerrado_en timestamptz,
  unique (obra_id, fecha)
);

create table partes_asistencia_detalle (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null references partes_asistencia(id) on delete cascade,
  empleado_id uuid not null references empleados(id),
  presente boolean not null default false,
  llego_tarde boolean not null default false,
  se_fue_antes boolean not null default false,
  unique (parte_id, empleado_id),
  check (not llego_tarde or presente),
  check (not se_fue_antes or presente)
);

create table partes_asistencia_historial (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null references partes_asistencia(id) on delete cascade,
  empleado_id uuid references empleados(id),
  campo text not null,
  valor_anterior text,
  valor_nuevo text,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz not null default now()
);

alter table partes_asistencia enable row level security;
alter table partes_asistencia_detalle enable row level security;
alter table partes_asistencia_historial enable row level security;

-- Lectura: los mismos 4 roles que ven Obras/OT.
create policy "partes_asistencia_select" on partes_asistencia
  for select to authenticated using (puede_ver_obras());

create policy "partes_asistencia_detalle_select" on partes_asistencia_detalle
  for select to authenticated using (puede_ver_obras());

create policy "partes_asistencia_historial_select" on partes_asistencia_historial
  for select to authenticated using (puede_ver_obras());

-- El encabezado (fecha/hora_inicio/hora_cierre/estado) no se crea ni se
-- cierra con un update directo — eso lo hacen las dos funciones de abajo.
-- Un update directo solo lo puede hacer administrador, para corregir un
-- parte ya cerrado (por ejemplo, si se tildó mal la hora).
create policy "partes_asistencia_update_admin" on partes_asistencia
  for update to authenticated using (is_admin()) with check (is_admin());

-- El detalle (los tildes de cada empleado) se actualiza directo desde la
-- pantalla: capataz/jefe_obra/administrador mientras el parte está abierto,
-- y solo administrador si ya está cerrado.
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

revoke all on partes_asistencia from anon;
revoke all on partes_asistencia_detalle from anon;
revoke all on partes_asistencia_historial from anon;

-- =========================================================================
-- 3. Abrir y cerrar el parte
-- =========================================================================

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

  insert into partes_asistencia_detalle (parte_id, empleado_id)
  select v_parte_id, id from empleados where activo = true;

  return v_parte_id;
end;
$$;

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

grant execute on function crear_parte_asistencia(uuid, date, time) to authenticated;
grant execute on function cerrar_parte_asistencia(uuid, time) to authenticated;
revoke execute on function crear_parte_asistencia(uuid, date, time) from anon;
revoke execute on function cerrar_parte_asistencia(uuid, time) from anon;

-- =========================================================================
-- 4. Auditoría de correcciones a un parte ya cerrado
-- =========================================================================

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
      (parte_id, empleado_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.parte_id, new.empleado_id, 'presente', old.presente::text, new.presente::text, auth.uid(), v_usuario_email);
  end if;

  if new.llego_tarde is distinct from old.llego_tarde then
    insert into partes_asistencia_historial
      (parte_id, empleado_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.parte_id, new.empleado_id, 'llego_tarde', old.llego_tarde::text, new.llego_tarde::text, auth.uid(), v_usuario_email);
  end if;

  if new.se_fue_antes is distinct from old.se_fue_antes then
    insert into partes_asistencia_historial
      (parte_id, empleado_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.parte_id, new.empleado_id, 'se_fue_antes', old.se_fue_antes::text, new.se_fue_antes::text, auth.uid(), v_usuario_email);
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
  if old.estado <> 'cerrado' then
    return new;
  end if;

  v_usuario_email := (select email from profiles where id = auth.uid());

  if new.hora_inicio is distinct from old.hora_inicio then
    insert into partes_asistencia_historial
      (parte_id, campo, valor_anterior, valor_nuevo, usuario_id, usuario_email)
    values
      (new.id, 'hora_inicio', old.hora_inicio::text, new.hora_inicio::text, auth.uid(), v_usuario_email);
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

-- Verificación: tiene que devolver 0 filas, sin error.
select * from partes_asistencia;
