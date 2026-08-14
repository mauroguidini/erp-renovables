-- Módulo: Catálogo de Tipos de tarea (PASO 6 de varios)
-- Qué hace este script: crea la tabla "tipos_tarea" (vacía) con la misma
-- seguridad que empleados, y agrega la columna "tipo_tarea_id" a
-- ordenes_trabajo (opcional, vacía en todas las OT que ya existen — es un
-- campo nuevo, no hay nada que migrar).
--
-- Importante: esto es DISTINTO de la columna "tipo" que ya existe en
-- ordenes_trabajo (programada/puntual, el "modo" en que se generó la OT).
-- "tipo_tarea" es el tipo de trabajo en sí (relevamiento, montaje,
-- instalación, etc.) — dos cosas separadas, que van a convivir en el mismo
-- formulario de OT.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 017.

create table tipos_tarea (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table tipos_tarea enable row level security;

create policy "tipos_tarea_select" on tipos_tarea
  for select to authenticated using (puede_ver_obras());

create policy "tipos_tarea_insert" on tipos_tarea
  for insert to authenticated with check (puede_gestionar_obras());

create policy "tipos_tarea_update" on tipos_tarea
  for update to authenticated using (puede_gestionar_obras()) with check (puede_gestionar_obras());

create policy "tipos_tarea_delete" on tipos_tarea
  for delete to authenticated using (puede_gestionar_obras());

revoke all on tipos_tarea from anon;

alter table ordenes_trabajo
  add column tipo_tarea_id uuid references tipos_tarea(id);

-- Verificación: tiene que aparecer la columna nueva "tipo_tarea_id", vacía
-- en todas las filas.
select id, tipo, tipo_tarea_id from ordenes_trabajo limit 5;
