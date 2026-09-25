-- Módulo: Certificaciones de obra (CAPA 1: circuito, sin comparación de
-- desvíos todavía)
-- Qué hace este script:
-- 1. "certificaciones": un certificado de avance por obra, numerado en
--    correlativo DENTRO de cada obra (igual que ordenes_trabajo.numero).
--    Campos por monto, % de avance, avance acumulado, período y hito son
--    todos opcionales salvo el monto — cada obra certifica a su manera.
--    Circuito de estado: cargado -> facturado -> cobrado.
-- 2. "certificaciones_historial_estados": igual patrón que
--    ot_historial_estados — una fila por cada cambio de estado real, quién y
--    cuándo. Nadie inserta ahí a mano, solo el trigger. Quién CARGÓ el
--    certificado queda aparte, en creado_por/creado_por_email de la fila
--    misma (iguel que facturas_venta).
-- 3. Permisos: puede_ver_certificaciones() (administrador + jefe_obra,
--    deliberadamente más chico que puede_ver_obras() porque acá se ve
--    plata certificada/facturada/cobrada). Cargar y editar (mientras el
--    certificado siga "cargado") es de administrador + jefe_obra, vía la
--    función que ya existe puede_gestionar_obras(). Cambiar de estado
--    (marcar facturado/cobrado, y revertir un estado por error) es
--    EXCLUSIVO de administrador, y pasa siempre por una función — nunca por
--    un update directo del campo "estado".
-- 4. Dos adjuntos en momentos distintos, cada uno con su propia columna (no
--    carpeta con listado libre, como Archivos de obra): certificado_ruta
--    (el documento de avance, lo sube jefe_obra al cargar) y factura_ruta
--    (el PDF de la factura emitida, lo sube administración al marcar
--    facturado). Van a un bucket PROPIO ("certificaciones-archivos"),
--    separado de "obras-archivos", porque ahí solo pueden escribir
--    administrador/jefe_obra (obras-archivos también deja subir a capataz,
--    que acá no debería poder tocar esto).
-- 5. IMPORTANTE: esto NO se conecta con facturas_venta ni con ningún otro
--    registro de ARCA — las obras se facturan desde distintas sociedades, así
--    que la factura queda solo como PDF adjunto acá, nunca como fila
--    vinculada. Tampoco se toca ordenes_trabajo, hitos, ni el módulo de
--    materiales/movimientos de obra.
-- 6. NO incluye todavía la comparación de desvíos (real vs. previsto) — eso
--    necesita el presupuesto cargado y es una etapa aparte. Lo que sí queda
--    preparado: obras.presupuesto ya existe, y avance_acumulado/hito_id acá
--    alcanzan para esa comparación futura sin tocar este esquema.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 070.

-- =========================================================================
-- 1. Permisos
-- =========================================================================

create or replace function puede_ver_certificaciones()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'jefe_obra')
  );
$$;

grant execute on function puede_ver_certificaciones() to authenticated;

-- =========================================================================
-- 2. Tabla certificaciones
-- =========================================================================

create table certificaciones (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  numero integer not null,
  periodo_desde date,
  periodo_hasta date,
  monto_certificado numeric(12, 2) not null check (monto_certificado > 0),
  porcentaje_avance numeric(5, 2) check (porcentaje_avance between 0 and 100),
  avance_acumulado numeric(5, 2) check (avance_acumulado between 0 and 100),
  hito_id uuid references hitos(id) on delete set null,
  descripcion text,
  estado text not null default 'cargado' check (estado in ('cargado', 'facturado', 'cobrado')),
  certificado_ruta text unique,
  factura_ruta text unique,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  unique (obra_id, numero)
);

create index certificaciones_obra_idx on certificaciones (obra_id, numero);
create index certificaciones_estado_idx on certificaciones (obra_id, estado);

alter table certificaciones enable row level security;
revoke all on certificaciones from anon;

create policy "certificaciones_select" on certificaciones
  for select to authenticated using (puede_ver_certificaciones());

create policy "certificaciones_insert" on certificaciones
  for insert to authenticated with check (puede_gestionar_obras());

-- Mientras el certificado sigue "cargado", administrador o jefe_obra lo
-- pueden editar/borrar. Una vez que administración lo marca "facturado" (o
-- más allá), solo administrador puede tocarlo — mismo criterio que usa OT
-- con "cumplida".
create policy "certificaciones_update" on certificaciones
  for update to authenticated
  using (is_admin() or (puede_gestionar_obras() and estado = 'cargado'))
  with check (is_admin() or puede_gestionar_obras());

create policy "certificaciones_delete" on certificaciones
  for delete to authenticated
  using (is_admin() or (puede_gestionar_obras() and estado = 'cargado'));

-- Correlativo por obra, igual que ordenes_trabajo.numero.
create or replace function asignar_numero_certificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero
    from certificaciones
    where obra_id = new.obra_id;
  end if;
  return new;
end;
$$;

create trigger certificaciones_asignar_numero
  before insert on certificaciones
  for each row execute function asignar_numero_certificacion();

-- Quién cargó el certificado y cuándo (created_at ya lo tiene por default).
create or replace function set_autor_certificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.creado_por := auth.uid();
  new.creado_por_email := (select email from profiles where id = auth.uid());
  return new;
end;
$$;

create trigger certificaciones_autor
  before insert on certificaciones
  for each row execute function set_autor_certificacion();

-- Reusa la misma función que ya valida hito_id/obra_id en ordenes_trabajo
-- (database/027_hitos.sql) — es genérica, no hace falta duplicarla.
create trigger certificaciones_valida_hito
  before insert or update of hito_id, obra_id on certificaciones
  for each row execute function validar_hito_de_obra();

-- =========================================================================
-- 3. Historial de estados (auditoría)
-- =========================================================================

create table certificaciones_historial_estados (
  id uuid primary key default gen_random_uuid(),
  certificacion_id uuid not null references certificaciones(id) on delete cascade,
  estado text not null,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz not null default now()
);

alter table certificaciones_historial_estados enable row level security;
revoke all on certificaciones_historial_estados from anon;

create policy "certificaciones_historial_select" on certificaciones_historial_estados
  for select to authenticated using (puede_ver_certificaciones());
-- Sin política de insert para usuarios: solo el trigger de abajo escribe acá.

create or replace function registrar_historial_estado_certificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into certificaciones_historial_estados (certificacion_id, estado, usuario_id, usuario_email)
    values (new.id, new.estado, auth.uid(), (select email from profiles where id = auth.uid()));
  end if;
  return new;
end;
$$;

create trigger certificaciones_historial_estado
  after update of estado on certificaciones
  for each row execute function registrar_historial_estado_certificacion();

-- =========================================================================
-- 4. Circuito de estados: solo administración, solo hacia adelante (o
--    revertido un paso si hubo un error de carga)
-- =========================================================================

create or replace function marcar_certificado_facturado(
  p_certificacion_id uuid,
  p_factura_ruta text default null
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

  if v_rol <> 'administrador' then
    raise exception 'Solo administración puede marcar un certificado como facturado';
  end if;

  select estado into v_estado_actual from certificaciones where id = p_certificacion_id;

  if not found then
    raise exception 'El certificado % no existe', p_certificacion_id;
  end if;

  if v_estado_actual <> 'cargado' then
    raise exception 'Este certificado está "%", no se puede marcar facturado desde ese estado', v_estado_actual;
  end if;

  update certificaciones
  set
    estado = 'facturado',
    factura_ruta = coalesce(p_factura_ruta, factura_ruta)
  where id = p_certificacion_id;
end;
$$;

create or replace function marcar_certificado_cobrado(p_certificacion_id uuid)
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

  if v_rol <> 'administrador' then
    raise exception 'Solo administración puede marcar un certificado como cobrado';
  end if;

  select estado into v_estado_actual from certificaciones where id = p_certificacion_id;

  if not found then
    raise exception 'El certificado % no existe', p_certificacion_id;
  end if;

  if v_estado_actual <> 'facturado' then
    raise exception 'Este certificado está "%", tiene que estar facturado antes de marcarlo cobrado', v_estado_actual;
  end if;

  update certificaciones set estado = 'cobrado' where id = p_certificacion_id;
end;
$$;

-- Para corregir un estado puesto por error (ej. se marcó "facturado" antes
-- de tiempo). Solo retrocede UN paso. Al volver de "facturado" a "cargado"
-- también limpia factura_ruta, porque ese adjunto correspondía al paso que
-- se está deshaciendo (el archivo en Storage queda huérfano, no se borra
-- solo — es un caso excepcional, no un flujo normal).
create or replace function revertir_estado_certificado(p_certificacion_id uuid)
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

  if v_rol <> 'administrador' then
    raise exception 'Solo administración puede revertir el estado de un certificado';
  end if;

  select estado into v_estado_actual from certificaciones where id = p_certificacion_id;

  if not found then
    raise exception 'El certificado % no existe', p_certificacion_id;
  end if;

  if v_estado_actual = 'cobrado' then
    update certificaciones set estado = 'facturado' where id = p_certificacion_id;
  elsif v_estado_actual = 'facturado' then
    update certificaciones set estado = 'cargado', factura_ruta = null where id = p_certificacion_id;
  else
    raise exception 'Este certificado ya está "cargado", no hay nada para revertir';
  end if;
end;
$$;

grant execute on function marcar_certificado_facturado(uuid, text) to authenticated;
grant execute on function marcar_certificado_cobrado(uuid) to authenticated;
grant execute on function revertir_estado_certificado(uuid) to authenticated;
revoke execute on function marcar_certificado_facturado(uuid, text) from anon;
revoke execute on function marcar_certificado_cobrado(uuid) from anon;
revoke execute on function revertir_estado_certificado(uuid) from anon;

-- =========================================================================
-- 5. Bucket para los dos adjuntos (certificado + factura)
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificaciones-archivos',
  'certificaciones-archivos',
  false,
  20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "certificaciones_archivos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'certificaciones-archivos' and puede_ver_certificaciones());

create policy "certificaciones_archivos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificaciones-archivos'
    and puede_gestionar_obras()
    and exists (
      select 1 from obras o where o.id::text = (storage.foldername(name))[1]
    )
  );

create policy "certificaciones_archivos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'certificaciones-archivos' and puede_gestionar_obras());

-- Verificación: tiene que devolver 0 filas, sin error.
select * from certificaciones;
