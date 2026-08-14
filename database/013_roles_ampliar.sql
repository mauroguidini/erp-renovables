-- Módulo: Roles ampliados (PASO 1 de varios)
-- Qué hace este script: permite que profiles.role tenga 3 valores nuevos
-- además de los que ya existían ('administrador', 'capataz'):
-- 'jefe_obra', 'compras', 'administracion'.
--
-- No toca ninguna fila existente — los usuarios que ya son 'administrador'
-- o 'capataz' quedan exactamente igual. Todavía no le da ningún permiso
-- nuevo a nadie: eso viene en los pasos siguientes, cuando reescribamos
-- las políticas de cada tabla.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 012.

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'profiles'::regclass and contype = 'c'
  loop
    execute format('alter table profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table profiles
  add constraint profiles_role_check
  check (role in ('administrador', 'capataz', 'jefe_obra', 'compras', 'administracion'));

-- Verificación: esto tiene que devolver la lista de valores permitidos,
-- con los 5 roles nuevos incluidos.
select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'profiles'::regclass and contype = 'c';
