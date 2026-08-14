-- Módulo: Roles ampliados (PASO 3 de varios)
-- Qué hace este script: la vista obras_visibles ocultaba el presupuesto a
-- todos menos administrador. Ahora también lo muestra a Administración
-- (decisión confirmada). Capataz, Jefe de obra y Compras siguen sin verlo
-- (Compras además ni siquiera puede leer obras, por la política que
-- pusimos en el paso 2).
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 014.

drop view if exists obras_visibles;

create view obras_visibles
with (security_invoker = true)
as
select
  id,
  cliente_id,
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

-- Verificación: como sos administrador, esto tiene que devolver tus obras
-- con la columna "presupuesto" completa (no en null).
select id, direccion, presupuesto from obras_visibles limit 5;
