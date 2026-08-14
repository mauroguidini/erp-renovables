-- Módulo: Clientes y Obras
-- Qué hace este script: crea la tabla de clientes (igual de simple que
-- proveedores) y la tabla de obras/proyectos, asociada a un cliente. También
-- activa RLS en ambas para que solo usuarios logueados puedan usarlas.
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New query,
-- y hacer clic en "Run". Requiere haber corrido antes 001, 002, 003 y 004.

drop table if exists obras cascade;
drop table if exists clientes cascade;

-- 1. Clientes
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto_telefono text,
  contacto_email text,
  direccion text,
  cuit text,
  created_at timestamptz not null default now()
);

-- 2. Obras: cada proyecto de instalación, asociado a un cliente
create table obras (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  direccion text not null,
  potencia_kwp numeric not null check (potencia_kwp > 0),
  fecha_inicio date,
  fecha_fin_estimada date,
  estado text not null default 'presupuestada'
    check (estado in ('presupuestada', 'aprobada', 'en_curso', 'finalizada', 'cancelada')),
  presupuesto numeric,
  created_at timestamptz not null default now()
);

-- 3. Seguridad: RLS, mismo esquema que el resto del sistema
alter table clientes enable row level security;
alter table obras enable row level security;

drop policy if exists "authenticated_all" on clientes;
create policy "authenticated_all" on clientes
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on obras;
create policy "authenticated_all" on obras
  for all to authenticated using (true) with check (true);

revoke all on clientes, obras from anon;
