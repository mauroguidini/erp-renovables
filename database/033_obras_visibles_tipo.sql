-- Módulo: Tipo de obra (PASO 2 de varios)
-- Qué hace este script: la vista obras_visibles lista las columnas a mano
-- (para poder ocultar el presupuesto según el rol) — no incluía todavía
-- "tipo_obra_id". La agrega, sin cambiar nada más de cómo funciona la
-- vista.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 032.

drop view if exists obras_visibles;

create view obras_visibles
with (security_invoker = true)
as
select
  id,
  cliente_id,
  tipo_obra_id,
  direccion,
  potencia_kwp,
  fecha_inicio,
  fecha_fin_estimada,
  estado,
  case when puede_comercial() then presupuesto else null end as presupuesto,
  created_at
from obras;

grant select on obras_visibles to authenticated;
revoke all on obras_visibles from anon;

-- Verificación: tiene que aparecer la columna "tipo_obra_id" con datos.
select id, direccion, tipo_obra_id from obras_visibles limit 5;
