-- Módulo: Eliminar/Archivar obra (PASO 2 de varios)
-- Qué hace este script: obras_visibles lista las columnas a mano — le
-- agrega "deposito_id" y "archivada", que hacen falta para la Zona
-- peligrosa del detalle de obra. No cambia nada más.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 034.

drop view if exists obras_visibles;

create view obras_visibles
with (security_invoker = true)
as
select
  id,
  cliente_id,
  tipo_obra_id,
  deposito_id,
  direccion,
  potencia_kwp,
  fecha_inicio,
  fecha_fin_estimada,
  estado,
  archivada,
  case when puede_comercial() then presupuesto else null end as presupuesto,
  created_at
from obras;

grant select on obras_visibles to authenticated;
revoke all on obras_visibles from anon;

-- Verificación: tienen que aparecer las columnas "deposito_id" y
-- "archivada" (en false para todas, por ahora).
select id, direccion, deposito_id, archivada from obras_visibles limit 5;
