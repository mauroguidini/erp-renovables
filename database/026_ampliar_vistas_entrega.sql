-- Módulo: Remitos con firma (PASO extra — corrección)
-- Qué hace este script: las vistas productos_nombre, depositos_origen y
-- obras_para_entrega (creadas en el paso 2 de "Entregas de material a
-- obra") solo eran visibles para quien puede ENTREGAR material
-- (administrador, compras, jefe_obra). Pero también hacen falta para
-- simplemente VER un remito ya cargado — por ejemplo, el nombre de cada
-- producto en la lista de remitos de una obra. Sin este cambio, Capataz y
-- Administración iban a ver esos remitos con el nombre del producto vacío,
-- porque no tienen acceso a la tabla "productos" en general.
--
-- Se amplía la condición de las 3 vistas para que también las vea quien
-- puede VER Obras (capataz, jefe_obra, administracion, administrador) —
-- son datos de bajo riesgo (nombres, no precios ni stock), y hace falta
-- para que la lista de remitos se vea completa para esos roles.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 025.

create or replace view productos_nombre as
select id, nombre, codigo, unidad_medida
from productos
where puede_entregar_material() or puede_ver_obras();

create or replace view depositos_origen as
select id, nombre
from depositos
where tipo <> 'obra' and (puede_entregar_material() or puede_ver_obras());

create or replace view obras_para_entrega as
select o.id, o.direccion, c.nombre as cliente_nombre
from obras o
left join clientes c on c.id = o.cliente_id
where (puede_entregar_material() or puede_ver_obras()) and o.estado <> 'cancelada';

-- Verificación: tiene que devolver tus productos, igual que antes (sos
-- administrador, así que ya los veías).
select * from productos_nombre limit 5;
