-- Módulo: Catálogo de Empleados/Técnicos (PASO 4 de varios)
-- Qué hace este script: crea la tabla "empleados" (todavía vacía) con su
-- seguridad, y al final muestra los nombres distintos que ya existen como
-- "responsable" en las órdenes de trabajo, para revisarlos ANTES de cargar
-- nada como empleado de verdad. Este script no toca ordenes_trabajo.
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 015.

create table empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto_telefono text,
  contacto_email text,
  oficio text not null default 'otro'
    check (oficio in ('instalador', 'electricista', 'ayudante', 'tecnico', 'otro')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table empleados enable row level security;

-- Lectura: los mismos roles que pueden ver Obras/OT (admin, capataz, jefe de
-- obra, administración). Compras queda afuera, no tiene relación con esto.
create policy "empleados_select" on empleados
  for select to authenticated using (puede_ver_obras());

-- Gestión (agregar/editar/borrar): admin y jefe de obra.
create policy "empleados_insert" on empleados
  for insert to authenticated with check (puede_gestionar_obras());

create policy "empleados_update" on empleados
  for update to authenticated using (puede_gestionar_obras()) with check (puede_gestionar_obras());

create policy "empleados_delete" on empleados
  for delete to authenticated using (puede_gestionar_obras());

revoke all on empleados from anon;

-- Diagnóstico: nombres distintos que ya escribiste como "responsable" en
-- OT existentes, y en cuántas OT aparece cada uno. Revisá esta lista buscando
-- variantes del mismo nombre escritas distinto (ej. "Juan Perez" vs
-- "Juan Pérez") — pasámela así como sale, y la corregimos juntos antes del
-- paso 5.
select responsable, count(*) as cantidad_de_ot
from ordenes_trabajo
where responsable is not null and trim(responsable) <> ''
group by responsable
order by responsable;
