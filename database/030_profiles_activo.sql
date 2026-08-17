-- Módulo: Administración de usuarios (PASO 1 de varios)
-- Qué hace este script: agrega "activo" a profiles (default true, igual
-- criterio que ya usamos en empleados/depositos/tipos_tarea). Esto es solo
-- para que la pantalla de usuarios muestre quién está desactivado — el
-- bloqueo real del login lo hace Supabase Auth (ban), no esta columna; la
-- ruta de servidor que viene en el próximo paso actualiza las dos cosas
-- juntas.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 029.

alter table profiles
  add column activo boolean not null default true;

-- Verificación: tiene que aparecer la columna nueva "activo", en true para
-- todos los usuarios que ya existen.
select id, email, role, activo from profiles;
