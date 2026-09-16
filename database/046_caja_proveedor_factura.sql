-- Módulo: Caja de efectivo — proveedor y número de factura (PASO 2)
-- Qué hace este script: agrega a "caja_movimientos" dos columnas opcionales:
-- - "proveedor": nombre o número del proveedor al que se le pagó.
-- - "numero_factura": texto libre (no numérico), justamente para poder
--   escribir algo como "Sin aplicación" o "S/A" en los pagos que no tienen
--   factura, en vez de forzar un número que no existe.
-- Las dos quedan vacías en todos los movimientos que ya existen — no hay
-- nada que migrar, es un dato nuevo hacia adelante.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 045.

alter table caja_movimientos add column proveedor text
  check (proveedor is null or btrim(proveedor) <> '');

alter table caja_movimientos add column numero_factura text
  check (numero_factura is null or btrim(numero_factura) <> '');

-- Verificación: tiene que aparecer la columna "proveedor" y "numero_factura",
-- vacías en todos los movimientos que ya existan.
select id, fecha, concepto, proveedor, numero_factura from caja_movimientos limit 5;
