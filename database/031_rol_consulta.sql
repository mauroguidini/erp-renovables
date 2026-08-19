-- Módulo: Rol de solo consulta (PASO 1 de varios)
-- Qué hace este script:
-- 1. Amplía el check de profiles.role para permitir un 6to valor:
--    'consulta'. Es el rol más restringido de todos — no se agrega a
--    NINGUNA función de "gestionar" (ni obras, ni stock, ni comercial, ni
--    archivos, ni entregas), así que no puede escribir en absolutamente
--    nada, en ningún módulo.
-- 2. Agrega 'consulta' a puede_ver_obras() — la misma función que ya
--    controla quién puede leer obras, hitos, órdenes de trabajo, remitos
--    y archivos de obra. Con este solo cambio, 'consulta' queda con
--    lectura en las 5 cosas, sin tocar ninguna otra política.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 030.

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
  check (role in ('administrador', 'capataz', 'jefe_obra', 'compras', 'administracion', 'consulta'));

create or replace function puede_ver_obras()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('administrador', 'capataz', 'jefe_obra', 'administracion', 'consulta')
  );
$$;

-- Verificación: tiene que aparecer 'consulta' en la lista de valores
-- permitidos.
select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'profiles'::regclass and contype = 'c';
