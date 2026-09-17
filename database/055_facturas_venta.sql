-- Módulo: Facturas de venta
-- Espejo de Facturas de compra (048/052), pero para lo que la empresa
-- factura A SUS clientes, no lo que le facturan los proveedores. Tabla
-- totalmente separada de facturas_compra — no se toca esa tabla ni el
-- catálogo de clientes existente, así que nada de lo ya cargado se rompe.
--
-- Qué hace este script:
-- 1. "facturas_venta": mismos criterios que facturas_compra —
--    "tipo_documento" ('factura'/'nota_credito') en la MISMA tabla en vez
--    de una tabla aparte (una nota de crédito emitida resta, con el mismo
--    signo aplicado del lado de la pantalla, nunca guardado en negativo).
--    Campos opcionales vacíos (neto/IVA/otros impuestos) se toleran igual
--    que en compras. El "no repetido" es cliente + tipo_documento +
--    tipo_factura + numero_factura.
-- 2. "estado_cobro" (pendiente/cobrada) en vez de "estado_pago" — se puede
--    marcar cobrada después de cargarla, igual mecanismo que el toggle de
--    Facturas de compra.
-- 3. "obra_id" y "centro_costo_id": OPCIONALES, sin ninguna lógica detrás
--    todavía (no hay comparación gasto vs. venta en este paso) — quedan
--    preparados para cuando se pida esa comparación más adelante.
-- 4. Comprobante (foto o PDF, opcional): bucket privado nuevo
--    ("facturas-venta"), separado del de compras.
--
-- Permisos: puede_ver_ventas() / puede_gestionar_ventas(), administrador +
-- administracion (mismo público administrativo de siempre). Se
-- editan/borran libremente, igual que Facturas de compra — no hay
-- circuito de caja atado a esto todavía, así que no aplica la
-- inmutabilidad de Caja/Órdenes de pago.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 054.

-- =========================================================================
-- 1. Permisos
-- =========================================================================

create or replace function puede_ver_ventas()
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

create or replace function puede_gestionar_ventas()
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

grant execute on function puede_ver_ventas() to authenticated;
grant execute on function puede_gestionar_ventas() to authenticated;

-- =========================================================================
-- 2. Facturas de venta
-- =========================================================================

create table facturas_venta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  tipo_documento text not null default 'factura' check (tipo_documento in ('factura', 'nota_credito')),
  tipo_factura text not null check (tipo_factura in ('A', 'B', 'C', 'otro')),
  numero_factura text not null check (length(btrim(numero_factura)) > 0),
  fecha date not null,
  importe_neto numeric(12, 2) not null check (importe_neto >= 0),
  iva numeric(12, 2) not null check (iva >= 0),
  otros_impuestos numeric(12, 2) not null default 0 check (otros_impuestos >= 0),
  importe_total numeric(12, 2) not null check (importe_total >= 0),
  estado_cobro text not null default 'pendiente' check (estado_cobro in ('pendiente', 'cobrada')),
  obra_id uuid references obras(id) on delete set null,
  centro_costo_id uuid references centros_costo(id) on delete set null,
  comprobante_ruta text unique,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  unique (cliente_id, tipo_documento, tipo_factura, numero_factura)
);

create index facturas_venta_fecha_idx on facturas_venta (fecha desc, created_at desc);
create index facturas_venta_cliente_idx on facturas_venta (cliente_id);
create index facturas_venta_pendiente_idx on facturas_venta (estado_cobro) where estado_cobro = 'pendiente';
create index facturas_venta_obra_idx on facturas_venta (obra_id);
create index facturas_venta_centro_costo_idx on facturas_venta (centro_costo_id);

alter table facturas_venta enable row level security;
revoke all on facturas_venta from anon;

create policy "facturas_venta_select" on facturas_venta
  for select to authenticated using (puede_ver_ventas());

create policy "facturas_venta_insert" on facturas_venta
  for insert to authenticated with check (puede_gestionar_ventas());

create policy "facturas_venta_update" on facturas_venta
  for update to authenticated using (puede_gestionar_ventas()) with check (puede_gestionar_ventas());

create policy "facturas_venta_delete" on facturas_venta
  for delete to authenticated using (puede_gestionar_ventas());

create or replace function set_autor_factura_venta()
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

drop trigger if exists facturas_venta_autor on facturas_venta;
create trigger facturas_venta_autor
  before insert on facturas_venta
  for each row execute function set_autor_factura_venta();

-- =========================================================================
-- 3. Bucket para el comprobante
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facturas-venta',
  'facturas-venta',
  false,
  20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "facturas_venta_comprobantes_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'facturas-venta' and puede_ver_ventas());

create policy "facturas_venta_comprobantes_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'facturas-venta' and puede_gestionar_ventas());

create policy "facturas_venta_comprobantes_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'facturas-venta' and puede_gestionar_ventas());

-- Verificación: tiene que devolver 0 filas, sin error.
select * from facturas_venta;
