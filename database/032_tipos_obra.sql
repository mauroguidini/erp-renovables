-- Módulo: Tipo de obra (PASO 1 de varios)
-- Qué hace este script:
-- 1. Crea "tipos_obra" (catálogo: codigo, nombre, activo) — misma
--    seguridad que tipos_tarea: la ven los 4 roles que ven Obras, la
--    gestionan administrador y jefe_obra. Agregar un tipo nuevo el día de
--    mañana es una fila nueva acá, no una migración.
-- 2. Carga los 2 tipos que ya existen hoy: Solar y Arquitectura.
-- 3. Agrega "tipo_obra_id" a obras, apuntando a ese catálogo. Todas las
--    obras que ya existen se cargan como "Solar" (para que ninguna quede
--    sin tipo), y recién después se pone la columna como obligatoria.
-- 4. "potencia_kwp" deja de ser obligatoria — pasa a ser opcional, porque
--    Arquitectura no la usa. El check que ya tenía (que si hay un valor,
--    tiene que ser mayor a 0) sigue funcionando igual para Solar.
-- 5. Agrega "detalles" (jsonb, vacío por defecto) — para el día de mañana,
--    si un tipo nuevo necesita campos propios que hoy no existen, se
--    pueden guardar ahí sin agregar una columna nueva a la tabla cada vez.
--    Por ahora queda sin usar.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 031.

create table tipos_obra (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table tipos_obra enable row level security;

create policy "tipos_obra_select" on tipos_obra
  for select to authenticated using (puede_ver_obras());

create policy "tipos_obra_insert" on tipos_obra
  for insert to authenticated with check (puede_gestionar_obras());

create policy "tipos_obra_update" on tipos_obra
  for update to authenticated using (puede_gestionar_obras()) with check (puede_gestionar_obras());

create policy "tipos_obra_delete" on tipos_obra
  for delete to authenticated using (puede_gestionar_obras());

revoke all on tipos_obra from anon;

insert into tipos_obra (codigo, nombre) values
  ('solar', 'Solar'),
  ('arquitectura', 'Arquitectura');

alter table obras
  add column tipo_obra_id uuid references tipos_obra(id);

update obras
set tipo_obra_id = (select id from tipos_obra where codigo = 'solar')
where tipo_obra_id is null;

alter table obras
  alter column tipo_obra_id set not null;

alter table obras
  alter column potencia_kwp drop not null;

alter table obras
  add column detalles jsonb not null default '{}'::jsonb;

-- Verificación: tiene que aparecer cada obra con su tipo ("Solar" en
-- todas las que ya existían), y los 2 tipos cargados en tipos_obra.
select o.id, o.direccion, t.nombre as tipo
from obras o
join tipos_obra t on t.id = o.tipo_obra_id;

select * from tipos_obra;
