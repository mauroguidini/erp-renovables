-- Módulo: Seguridad — Perfiles y roles (PASO 1 de varios)
-- Qué hace este script: crea la tabla "profiles" (el rol de cada usuario),
-- la función is_admin() para chequear el rol del usuario logueado, un
-- disparador para que todo usuario NUEVO arranque con el rol más
-- restrictivo ("capataz"), y carga tu perfil actual como "administrador".
--
-- IMPORTANTE: este script todavía NO cambia ningún permiso de las tablas
-- existentes (productos, obras, ordenes_trabajo, etc.). Después de correrlo,
-- la app tiene que seguir funcionando EXACTAMENTE igual que hoy — es la forma
-- de confirmar que este primer paso no rompió nada antes de restringir nada.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 008.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'capataz' check (role in ('administrador', 'capataz')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Función que dice si el usuario logueado es administrador.
-- "security definer" hace que se ejecute con permisos elevados por dentro,
-- para que no se trabe consultándose a sí misma a través de la política de
-- seguridad de "profiles" (si no, sería una referencia circular).
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'administrador'
  );
$$;

grant execute on function is_admin() to authenticated;

-- Políticas de "profiles": cada usuario puede ver su propio perfil (para que
-- la app sepa su propio rol); el administrador puede ver y modificar todos.
create policy "ver_propio_perfil_o_admin" on profiles
  for select to authenticated
  using (id = auth.uid() or is_admin());

create policy "admin_modifica_perfiles" on profiles
  for update to authenticated
  using (is_admin())
  with check (is_admin());

create policy "admin_inserta_perfiles" on profiles
  for insert to authenticated
  with check (is_admin());

revoke all on profiles from anon;

-- Disparador: cuando se crea un usuario nuevo en Supabase Auth (los seguís
-- creando en el Dashboard, como siempre), se le crea solo un perfil con rol
-- "capataz" — el más restrictivo por defecto, nunca "administrador" solo.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'capataz');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Paso manual crítico: cargamos TU usuario actual como administrador.
-- Sin esto, en el próximo paso (cuando restrinjamos las tablas) quedarías
-- con rol "capataz" y perderías acceso a tu propio sistema.
insert into profiles (id, email, role)
select id, email, 'administrador'
from auth.users
where email = 'mauroguidini@fabricasrl.com.ar'
on conflict (id) do update set role = 'administrador';

-- Verificación: esto tiene que devolver una fila con tu email y
-- role = 'administrador'. Si no devuelve nada o el email está mal, avisame
-- antes de seguir.
select id, email, role from profiles;
