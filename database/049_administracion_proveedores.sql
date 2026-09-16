-- Módulo: Administración puede cargar proveedores
-- Qué hace este script: hasta ahora "proveedores" tenía una única política
-- ("gestion_stock", compartida con productos/stock/compras/etc.) que solo
-- dejaba pasar a administrador y compras. Esto separa "proveedores" en sus
-- propias políticas para no tocar el resto de Depósito/Stock, y le suma el
-- rol administracion — que ya necesitaba elegir un proveedor al cargar una
-- factura de compra (048), y ahora también puede darlos de alta.
-- Ver y cargar: administrador, compras y administracion.
-- Editar y borrar: se deja como estaba (administrador y compras), porque
-- no se pidió ampliar eso — solo "cargar".
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 048.

drop policy "gestion_stock" on proveedores;

create policy "proveedores_select" on proveedores
  for select to authenticated using (puede_stock() or puede_gestionar_facturas());

create policy "proveedores_insert" on proveedores
  for insert to authenticated with check (puede_stock() or puede_gestionar_facturas());

create policy "proveedores_update" on proveedores
  for update to authenticated using (puede_stock()) with check (puede_stock());

create policy "proveedores_delete" on proveedores
  for delete to authenticated using (puede_stock());

-- Verificación: tiene que devolver tus proveedores existentes, sin error.
select * from proveedores;
