-- Módulo: Seguridad — Perfiles y roles (PASO 3 de varios)
-- Qué hace este script: en "obras", separa el permiso de LEER (los dos
-- roles) del permiso de CREAR/EDITAR/BORRAR (solo administrador). Además
-- crea una vista "obras_visibles" que oculta el campo "presupuesto" cuando
-- quien consulta no es administrador.
--
-- Nota importante sobre el presupuesto: las reglas de seguridad (RLS)
-- trabajan por FILA completa, no pueden esconder una sola columna dentro de
-- una fila permitida. La vista es la forma correcta de resolverlo, pero
-- protege el precio dentro de esta aplicación (que va a consultar la vista,
-- no la tabla). Alguien con conocimientos técnicos que use su propia sesión
-- para pedirle a Supabase la tabla "obras" directamente (no a través de la
-- app) todavía podría llegar al dato — es una limitación real de este
-- modelo de seguridad, no un descuido. Si en algún momento querés cerrar
-- también esa puerta, se puede reforzar más adelante con permisos por
-- columna a nivel de base; por ahora esto cubre el uso normal de la app.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 010.

drop policy if exists "authenticated_all" on obras;

create policy "obras_select_todos" on obras
  for select to authenticated using (true);

create policy "obras_insert_admin" on obras
  for insert to authenticated with check (is_admin());

create policy "obras_update_admin" on obras
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "obras_delete_admin" on obras
  for delete to authenticated using (is_admin());

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
  case when is_admin() then presupuesto else null end as presupuesto,
  created_at
from obras;

grant select on obras_visibles to authenticated;
revoke all on obras_visibles from anon;
