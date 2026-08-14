-- Módulo: Seguridad — Perfiles y roles (PASO 2 de varios)
-- Qué hace este script: reemplaza la política "cualquier usuario logueado
-- puede todo" por "solo administrador puede algo" en las tablas que Capataz
-- no debe ver de ninguna forma: productos, depósitos, stock, movimientos de
-- stock, proveedores, clientes, compras y sus ítems.
--
-- Como tu usuario ya quedó cargado como "administrador" en el paso 1, para
-- vos esto no debería cambiar nada — es la forma de confirmar que
-- is_admin() funciona bien antes de tocar Obras/OT (más delicadas).
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 009.

drop policy if exists "authenticated_all" on productos;
create policy "solo_admin" on productos
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "authenticated_all" on depositos;
create policy "solo_admin" on depositos
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "authenticated_all" on stock;
create policy "solo_admin" on stock
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "authenticated_all" on movimientos_stock;
create policy "solo_admin" on movimientos_stock
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "authenticated_all" on proveedores;
create policy "solo_admin" on proveedores
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "authenticated_all" on clientes;
create policy "solo_admin" on clientes
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "authenticated_all" on compras;
create policy "solo_admin" on compras
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "authenticated_all" on compra_items;
create policy "solo_admin" on compra_items
  for all to authenticated using (is_admin()) with check (is_admin());

-- Nota: no hace falta tocar los permisos de confirmar_compra ni de
-- transferir_stock. Esas funciones se ejecutan "como" el usuario que las
-- llama (no con permisos elevados), así que si Capataz las llamara, van a
-- fallar solas al intentar tocar "stock"/"compras" sin permiso — ya quedan
-- protegidas por las políticas que acabamos de poner en esas tablas.
