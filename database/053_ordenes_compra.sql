-- Módulo: Circuito de compras — Órdenes de compra (PASO 1 de 2)
-- Documento para mandarle al proveedor: qué se pide, cantidades y
-- precios. Es administrativo (vive junto a Facturas/Caja/Centros de
-- costos), NO tiene nada que ver con el módulo de "Compras" de Depósito/
-- Stock (ese mueve stock físico a un depósito; esto es un papel).
--
-- Qué hace este script:
-- 1. "ordenes_compra": encabezado (proveedor, fecha, número). El número es
--    correlativo automático (lo asigna un trigger, igual mecanismo que el
--    número de OT) — nadie lo elige a mano.
-- 2. "ordenes_compra_items": los ítems (descripción libre, cantidad,
--    precio unitario). El subtotal de cada ítem es una columna
--    GENERATED (cantidad * precio_unitario, la calcula Postgres solo,
--    nunca puede desincronizarse). El TOTAL de la orden no se guarda en
--    ningún lado: se calcula sumando los ítems, igual criterio que en
--    Rendiciones/Facturas/Centros de costos.
-- 3. Se puede editar y borrar una orden de compra libremente
--    (administrador/administracion) — a diferencia de la Orden de pago,
--    esto no mueve plata ni caja, es solo un papel.
-- 4. Agrega "orden_compra_id" a facturas_compra: el vínculo OPCIONAL de
--    una factura a la orden de compra que la originó. Si se borra la
--    orden de compra, la factura NO se rompe, solo queda sin ese vínculo
--    (on delete set null) — mismo criterio que ya usás en todos lados.
--
-- Permisos: se reutilizan puede_ver_facturas()/puede_gestionar_facturas()
-- (administrador + administracion) en vez de crear funciones nuevas — es
-- exactamente el mismo público y el mismo módulo administrativo que ya
-- gestiona Facturas de compra.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 052.

-- =========================================================================
-- 1. Encabezado
-- =========================================================================

create table ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  proveedor_id uuid not null references proveedores(id),
  fecha date not null,
  notas text,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now()
);

create or replace function asignar_numero_orden_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero from ordenes_compra;
  end if;
  return new;
end;
$$;

drop trigger if exists ordenes_compra_asignar_numero on ordenes_compra;
create trigger ordenes_compra_asignar_numero
  before insert on ordenes_compra
  for each row execute function asignar_numero_orden_compra();

create or replace function set_autor_orden_compra()
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

drop trigger if exists ordenes_compra_autor on ordenes_compra;
create trigger ordenes_compra_autor
  before insert on ordenes_compra
  for each row execute function set_autor_orden_compra();

alter table ordenes_compra enable row level security;
revoke all on ordenes_compra from anon;

create policy "ordenes_compra_select" on ordenes_compra
  for select to authenticated using (puede_ver_facturas());

create policy "ordenes_compra_insert" on ordenes_compra
  for insert to authenticated with check (puede_gestionar_facturas());

create policy "ordenes_compra_update" on ordenes_compra
  for update to authenticated using (puede_gestionar_facturas()) with check (puede_gestionar_facturas());

create policy "ordenes_compra_delete" on ordenes_compra
  for delete to authenticated using (puede_gestionar_facturas());

-- =========================================================================
-- 2. Ítems
-- =========================================================================

create table ordenes_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_compra_id uuid not null references ordenes_compra(id) on delete cascade,
  descripcion text not null check (length(btrim(descripcion)) > 0),
  cantidad numeric(12, 2) not null check (cantidad > 0),
  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0),
  subtotal numeric(12, 2) generated always as (cantidad * precio_unitario) stored,
  created_at timestamptz not null default now()
);

create index ordenes_compra_items_orden_idx on ordenes_compra_items (orden_compra_id);

alter table ordenes_compra_items enable row level security;
revoke all on ordenes_compra_items from anon;

create policy "ordenes_compra_items_select" on ordenes_compra_items
  for select to authenticated using (puede_ver_facturas());

create policy "ordenes_compra_items_insert" on ordenes_compra_items
  for insert to authenticated with check (puede_gestionar_facturas());

create policy "ordenes_compra_items_update" on ordenes_compra_items
  for update to authenticated using (puede_gestionar_facturas()) with check (puede_gestionar_facturas());

create policy "ordenes_compra_items_delete" on ordenes_compra_items
  for delete to authenticated using (puede_gestionar_facturas());

-- =========================================================================
-- 3. Vínculo opcional desde una factura
-- =========================================================================

alter table facturas_compra
  add column orden_compra_id uuid references ordenes_compra(id) on delete set null;

create index facturas_compra_orden_compra_idx on facturas_compra (orden_compra_id);

-- Verificación: las tres consultas tienen que andar sin error, todas vacías
-- (o la tercera con tus facturas ya cargadas y orden_compra_id en NULL).
select * from ordenes_compra;
select * from ordenes_compra_items;
select id, orden_compra_id from facturas_compra limit 5;
