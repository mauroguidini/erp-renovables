-- Módulo: Buscador de Facturas de compra — CUIT del proveedor
-- Qué hace este script: la vista "proveedores_nombre" (048) solo exponía
-- id y nombre. El buscador de Facturas de compra necesita filtrar también
-- por CUIT, así que se agrega esa columna a la vista. No hace falta tocar
-- permisos: administracion ya puede leer "proveedores" completo desde 049
-- (política "proveedores_select"), esta vista solo evita que la pantalla
-- tenga que pedir la tabla completa para el selector/buscador.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 055.

create or replace view proveedores_nombre as
select id, nombre, cuit from proveedores where puede_ver_facturas();

grant select on proveedores_nombre to authenticated;
revoke all on proveedores_nombre from anon;

-- Verificación: tiene que devolver tus proveedores con su CUIT, igual que
-- antes pero con la columna nueva.
select * from proveedores_nombre;
