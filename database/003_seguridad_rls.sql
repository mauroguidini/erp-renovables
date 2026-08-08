-- Módulo: Seguridad (Row Level Security)
-- Qué hace este script: activa RLS en todas las tablas del sistema y agrega
-- políticas para que solo usuarios logueados (rol "authenticated") puedan
-- leer y escribir datos. Sin sesión iniciada (rol "anon"), no se puede ver
-- ni modificar nada.
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New query,
-- y hacer clic en "Run". Requiere haber corrido antes 001 y 002.

-- 1. Activar RLS en cada tabla
alter table productos enable row level security;
alter table depositos enable row level security;
alter table proveedores enable row level security;
alter table compras enable row level security;
alter table compra_items enable row level security;
alter table stock enable row level security;
alter table numeros_serie enable row level security;
alter table movimientos_stock enable row level security;

-- 2. Política: cualquier usuario logueado puede leer y escribir todo.
-- (Es un sistema interno de la empresa, no hace falta filtrar filas por usuario.)
drop policy if exists "authenticated_all" on productos;
create policy "authenticated_all" on productos
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on depositos;
create policy "authenticated_all" on depositos
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on proveedores;
create policy "authenticated_all" on proveedores
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on compras;
create policy "authenticated_all" on compras
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on compra_items;
create policy "authenticated_all" on compra_items
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on stock;
create policy "authenticated_all" on stock
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on numeros_serie;
create policy "authenticated_all" on numeros_serie
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on movimientos_stock;
create policy "authenticated_all" on movimientos_stock
  for all to authenticated using (true) with check (true);

-- 3. Sacarle al rol "anon" (sin login) los permisos de tabla, además del RLS,
-- como capa extra de seguridad.
revoke all on productos, depositos, proveedores, compras, compra_items, stock, numeros_serie, movimientos_stock
  from anon;

-- 4. La función de confirmar compra solo la puede ejecutar gente logueada.
revoke execute on function confirmar_compra(uuid) from anon;
grant execute on function confirmar_compra(uuid) to authenticated;
