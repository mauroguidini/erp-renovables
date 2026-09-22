-- Módulo: Conciliación bancaria — nuevas clasificaciones automáticas
-- (Sueldos) y emparejamiento de cheques rechazados (060)
-- Qué hace este script:
-- 1. Suma 'sueldos' y 'cheque_rechazado' a los valores posibles de
--    "clasificacion" — mismo mecanismo que ya existía para
--    'impuestos'/'gastos_bancarios' (una etiqueta en el movimiento, NO
--    genera factura ni toca Centros de costos — confirmado con el
--    usuario). Hay que soltar la restricción vieja y poner una nueva
--    porque un CHECK no admite "agregar un valor" suelto.
-- 2. Dos columnas nuevas para emparejar cheques (eCheq que entra y a
--    veces rebota) por número de cheque, NUNCA por monto:
--    "numero_cheque" (el número extraído del concepto, ej. de "Ch:00004051")
--    y "cheque_pareja_id" (a qué otro movimiento quedó emparejado). Las
--    dos son opcionales — solo se completan en movimientos de eCheq.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 064.

alter table movimientos_bancarios drop constraint if exists movimientos_bancarios_clasificacion_check;

alter table movimientos_bancarios
  add constraint movimientos_bancarios_clasificacion_check
  check (clasificacion in ('impuestos', 'gastos_bancarios', 'sueldos', 'cheque_rechazado'));

alter table movimientos_bancarios add column if not exists numero_cheque text;
alter table movimientos_bancarios add column if not exists cheque_pareja_id uuid references movimientos_bancarios(id);

create index if not exists movimientos_bancarios_numero_cheque_idx
  on movimientos_bancarios (banco_id, numero_cheque)
  where numero_cheque is not null;
