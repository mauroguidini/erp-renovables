-- Módulo: Productos y Stock
-- Qué hace este script: crea las tablas necesarias para manejar productos,
-- depósitos/ubicaciones, proveedores, compras y el historial de movimientos de stock.
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New query, y hacer clic en "Run".

-- Borra las tablas si ya existen (para poder re-ejecutar este script sin errores)
drop table if exists movimientos_stock cascade;
drop table if exists numeros_serie cascade;
drop table if exists stock cascade;
drop table if exists compra_items cascade;
drop table if exists compras cascade;
drop table if exists proveedores cascade;
drop table if exists depositos cascade;
drop table if exists productos cascade;

-- 1. Productos: la ficha de cada artículo
create table productos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  descripcion text,
  categoria text not null check (categoria in ('panel', 'inversor', 'bateria', 'estructura', 'cableado', 'otro')),
  unidad_medida text not null default 'unidad',
  requiere_numero_serie boolean not null default false,
  stock_minimo numeric not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Depósitos / Ubicaciones: dónde puede estar el stock físico
create table depositos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('deposito', 'camioneta', 'obra')),
  responsable text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Proveedores: a quién se le compra la mercadería
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto_telefono text,
  contacto_email text,
  direccion text,
  cuit text,
  created_at timestamptz not null default now()
);

-- 4. Compras: cabecera de cada compra a un proveedor
create table compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores(id),
  deposito_destino_id uuid not null references depositos(id),
  fecha date not null default current_date,
  estado text not null default 'borrador' check (estado in ('borrador', 'confirmada')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- 5. Líneas de compra: qué productos y cantidades tiene cada compra
create table compra_items (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric not null check (cantidad > 0),
  precio_costo numeric,
  created_at timestamptz not null default now()
);

-- 6. Stock: cuánto hay de cada producto en cada depósito
create table stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id),
  deposito_id uuid not null references depositos(id),
  cantidad numeric not null default 0,
  unique (producto_id, deposito_id)
);

-- 7. Números de serie: unidades individuales identificadas (se asignan después de la compra)
create table numeros_serie (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id),
  numero_serie text not null unique,
  deposito_id uuid references depositos(id),
  estado text not null default 'en_stock' check (estado in ('en_stock', 'instalado', 'garantia')),
  created_at timestamptz not null default now()
);

-- 8. Movimientos de stock: historial de todo lo que entra, sale o se traslada
create table movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id),
  tipo text not null check (tipo in ('entrada', 'salida', 'transferencia')),
  deposito_origen_id uuid references depositos(id),
  deposito_destino_id uuid references depositos(id),
  cantidad numeric not null check (cantidad > 0),
  compra_id uuid references compras(id),
  motivo text,
  created_at timestamptz not null default now()
);

-- Proveedor genérico para cargar el stock inicial (el que ya tienen hoy en depósito/obras)
insert into proveedores (nombre) values ('Saldo Inicial');
