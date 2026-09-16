-- Módulo: Facturas de compra (PASO 1 de varios)
-- Registro interno de la empresa para no perder facturas y tener el dato a
-- mano — sin fines fiscales, contables ni de AFIP. Es independiente: por
-- ahora no se conecta con Compras, Stock, Obras ni con Caja de efectivo.
--
-- Qué hace este script:
-- 1. "proveedores_nombre": una vista chica (igual que "clientes_nombre" del
--    script 019) que muestra solo id y nombre de cada proveedor. Hace
--    falta porque la tabla "proveedores" completa está restringida a
--    administrador/compras (puede_stock(), desde 014) — administracion no
--    puede leerla directo, pero necesita elegir un proveedor al cargar una
--    factura. Por eso, igual que en 019, esta vista NO usa
--    "security_invoker": tiene su propio filtro (puede_ver_facturas())
--    adentro y necesita poder leer "proveedores" aunque quien pregunta no
--    tenga permiso directo sobre esa tabla.
-- 2. "categorias_factura": catálogo configurable (Materiales, Servicios,
--    Otro), mismo patrón que categorias_gasto de Rendiciones.
-- 3. "facturas_compra": una fila por factura. A diferencia de Caja de
--    efectivo, ACÁ SÍ se puede editar una factura ya cargada (lo pediste
--    explícitamente) — no hay problema de inmutabilidad como en la Caja,
--    porque esto no es un movimiento de plata que ya circuló, es un dato
--    administrativo (la factura existe, se puede corregir un typo o
--    actualizar el estado de pago). Un mismo proveedor+tipo+número de
--    factura no puede cargarse dos veces (unique), para no duplicar el
--    registro por error.
-- 4. Comprobante (foto o PDF, opcional): UNA sola por factura, misma idea
--    que en Rendiciones y Caja — una columna, no una tabla aparte. Va a un
--    bucket privado NUEVO ("facturas-compra"), separado de los otros dos,
--    porque este registro es autónomo tal como pediste.
-- 5. Los totales (registrado y pendiente de pago) NO se guardan en ningún
--    lado — se piden con un select filtrado desde la pantalla, igual que
--    se hace en Rendiciones. No hace falta una vista ni una función nueva
--    para esto.
--
-- Permisos: puede_ver_facturas() / puede_gestionar_facturas(), las dos
-- administrador + administracion (el rol "administrativo" del pedido). Se
-- separan en dos funciones por el mismo motivo de siempre: hoy son el
-- mismo conjunto de roles, pero el día de mañana se puede abrir una que
-- solo mire sin tocar las políticas ya escritas.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 047.

-- =========================================================================
-- 1. Permisos
-- =========================================================================

create or replace function puede_ver_facturas()
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

create or replace function puede_gestionar_facturas()
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

grant execute on function puede_ver_facturas() to authenticated;
grant execute on function puede_gestionar_facturas() to authenticated;

-- =========================================================================
-- 2. Vista chica de proveedores (para el selector del formulario)
-- =========================================================================

create view proveedores_nombre as
select id, nombre from proveedores where puede_ver_facturas();

grant select on proveedores_nombre to authenticated;
revoke all on proveedores_nombre from anon;

-- =========================================================================
-- 3. Catálogo de categorías
-- =========================================================================

create table categorias_factura (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table categorias_factura enable row level security;

create policy "categorias_factura_select" on categorias_factura
  for select to authenticated using (puede_ver_facturas());

create policy "categorias_factura_insert" on categorias_factura
  for insert to authenticated with check (puede_gestionar_facturas());

create policy "categorias_factura_update" on categorias_factura
  for update to authenticated using (puede_gestionar_facturas()) with check (puede_gestionar_facturas());

create policy "categorias_factura_delete" on categorias_factura
  for delete to authenticated using (puede_gestionar_facturas());

revoke all on categorias_factura from anon;

insert into categorias_factura (nombre) values
  ('Materiales'),
  ('Servicios'),
  ('Otro');

-- =========================================================================
-- 4. Facturas
-- =========================================================================

create table facturas_compra (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores(id),
  tipo_factura text not null check (tipo_factura in ('A', 'B', 'C', 'otro')),
  numero_factura text not null check (length(btrim(numero_factura)) > 0),
  fecha date not null,
  importe_neto numeric(12, 2) not null check (importe_neto >= 0),
  iva numeric(12, 2) not null check (iva >= 0),
  importe_total numeric(12, 2) not null check (importe_total >= 0),
  categoria_id uuid not null references categorias_factura(id),
  estado_pago text not null default 'pendiente' check (estado_pago in ('pendiente', 'pagada')),
  comprobante_ruta text unique,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  unique (proveedor_id, tipo_factura, numero_factura)
);

-- El listado siempre se pide igual: de la fecha más nueva a la más vieja,
-- filtrando a veces por proveedor y por estado de pago.
create index facturas_compra_fecha_idx on facturas_compra (fecha desc, created_at desc);
create index facturas_compra_proveedor_idx on facturas_compra (proveedor_id);
create index facturas_compra_pendiente_idx on facturas_compra (estado_pago) where estado_pago = 'pendiente';

alter table facturas_compra enable row level security;

revoke all on facturas_compra from anon;

create policy "facturas_compra_select" on facturas_compra
  for select to authenticated using (puede_ver_facturas());

create policy "facturas_compra_insert" on facturas_compra
  for insert to authenticated with check (puede_gestionar_facturas());

-- A diferencia de Caja de efectivo, acá SÍ se puede editar y borrar una
-- factura ya cargada (para corregir un dato mal tipeado, o cambiar el
-- estado de pago) — es un dato administrativo, no un movimiento de plata
-- que ya circuló.
create policy "facturas_compra_update" on facturas_compra
  for update to authenticated using (puede_gestionar_facturas()) with check (puede_gestionar_facturas());

create policy "facturas_compra_delete" on facturas_compra
  for delete to authenticated using (puede_gestionar_facturas());

-- Quién cargó la factura — lo pone la base, no el celular. Solo se
-- completa al CREARLA (no se pisa en cada edición posterior).
create or replace function set_autor_factura_compra()
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

drop trigger if exists facturas_compra_autor on facturas_compra;
create trigger facturas_compra_autor
  before insert on facturas_compra
  for each row execute function set_autor_factura_compra();

-- =========================================================================
-- 5. Bucket para el comprobante (foto o PDF de la factura)
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facturas-compra',
  'facturas-compra',
  false,
  20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "facturas_compra_comprobantes_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'facturas-compra' and puede_ver_facturas());

create policy "facturas_compra_comprobantes_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'facturas-compra' and puede_gestionar_facturas());

create policy "facturas_compra_comprobantes_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'facturas-compra' and puede_gestionar_facturas());

-- Verificación: la primera consulta tiene que devolver tus proveedores
-- existentes (id y nombre). La segunda, las 3 categorías. La tercera,
-- vacía, sin error.
select * from proveedores_nombre;
select * from categorias_factura order by nombre;
select * from facturas_compra;
