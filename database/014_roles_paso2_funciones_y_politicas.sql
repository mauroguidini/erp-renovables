-- Módulo: Roles ampliados (PASO 2 de varios)
-- Qué hace este script:
-- 1. Crea 4 funciones de "capacidad" (además de is_admin(), que ya existía y
--    sigue usándose para profiles y para el presupuesto de obras): cada una
--    dice si el usuario logueado puede hacer cierta cosa, sin importar cuál
--    de los 5 roles tenga exactamente.
-- 2. Reescribe las políticas de Depósito/Stock (productos, depositos, stock,
--    movimientos_stock, proveedores, compras, compra_items, numeros_serie)
--    para que las pueda usar "administrador" o "compras" (antes solo admin).
--    De paso, numeros_serie -que hasta hoy no tenía ninguna restricción real,
--    aunque el frontend todavía no la usa- queda protegida igual que el
--    resto de Stock.
-- 3. Reescribe la política de clientes para "administrador" o "administracion"
--    (antes solo admin).
-- 4. Reescribe las políticas de obras y ordenes_trabajo: antes cualquier
--    usuario logueado podía LEER ambas tablas; eso dejaba a Compras (que no
--    debe ver Obras) con acceso de lectura directa. Ahora la lectura queda
--    limitada a administrador/capataz/jefe_obra/administracion, y la
--    creación/edición/borrado a administrador/jefe_obra.
-- 5. Le agrega a marcar_estado_ot (la función que usa Capataz) una
--    validación de rol interna, porque al ser "security definer" ignora el
--    RLS de la tabla — hasta ahora no importaba porque solo admin/capataz
--    existían, pero Compras o Administración podrían haberla llamado
--    directamente para cambiar el estado de cualquier OT sin este chequeo.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 013.

-- =========================================================================
-- 1. Funciones de capacidad
-- =========================================================================

create or replace function puede_stock()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'compras')
  );
$$;

create or replace function puede_comercial()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'administracion')
  );
$$;

create or replace function puede_gestionar_obras()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'jefe_obra')
  );
$$;

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
      and role in ('administrador', 'capataz', 'jefe_obra', 'administracion')
  );
$$;

grant execute on function puede_stock() to authenticated;
grant execute on function puede_comercial() to authenticated;
grant execute on function puede_gestionar_obras() to authenticated;
grant execute on function puede_ver_obras() to authenticated;

-- =========================================================================
-- 2. Depósito/Stock: productos, depositos, stock, movimientos_stock,
--    proveedores, compras, compra_items, numeros_serie
-- =========================================================================

drop policy if exists "solo_admin" on productos;
create policy "gestion_stock" on productos
  for all to authenticated using (puede_stock()) with check (puede_stock());

drop policy if exists "solo_admin" on depositos;
create policy "gestion_stock" on depositos
  for all to authenticated using (puede_stock()) with check (puede_stock());

drop policy if exists "solo_admin" on stock;
create policy "gestion_stock" on stock
  for all to authenticated using (puede_stock()) with check (puede_stock());

drop policy if exists "solo_admin" on movimientos_stock;
create policy "gestion_stock" on movimientos_stock
  for all to authenticated using (puede_stock()) with check (puede_stock());

drop policy if exists "solo_admin" on proveedores;
create policy "gestion_stock" on proveedores
  for all to authenticated using (puede_stock()) with check (puede_stock());

drop policy if exists "solo_admin" on compras;
create policy "gestion_stock" on compras
  for all to authenticated using (puede_stock()) with check (puede_stock());

drop policy if exists "solo_admin" on compra_items;
create policy "gestion_stock" on compra_items
  for all to authenticated using (puede_stock()) with check (puede_stock());

drop policy if exists "authenticated_all" on numeros_serie;
create policy "gestion_stock" on numeros_serie
  for all to authenticated using (puede_stock()) with check (puede_stock());

-- =========================================================================
-- 3. Comercial: clientes
-- =========================================================================

drop policy if exists "solo_admin" on clientes;
create policy "gestion_comercial" on clientes
  for all to authenticated using (puede_comercial()) with check (puede_comercial());

-- =========================================================================
-- 4. Obras
-- =========================================================================

drop policy if exists "obras_select_todos" on obras;
create policy "obras_select" on obras
  for select to authenticated using (puede_ver_obras());

drop policy if exists "obras_insert_admin" on obras;
create policy "obras_insert" on obras
  for insert to authenticated with check (puede_gestionar_obras());

drop policy if exists "obras_update_admin" on obras;
create policy "obras_update" on obras
  for update to authenticated using (puede_gestionar_obras()) with check (puede_gestionar_obras());

drop policy if exists "obras_delete_admin" on obras;
create policy "obras_delete" on obras
  for delete to authenticated using (puede_gestionar_obras());

-- =========================================================================
-- 5. Órdenes de trabajo
-- =========================================================================

drop policy if exists "ot_select_todos" on ordenes_trabajo;
create policy "ot_select" on ordenes_trabajo
  for select to authenticated using (puede_ver_obras());

drop policy if exists "ot_insert_admin" on ordenes_trabajo;
create policy "ot_insert" on ordenes_trabajo
  for insert to authenticated with check (puede_gestionar_obras());

drop policy if exists "ot_update_admin" on ordenes_trabajo;
create policy "ot_update" on ordenes_trabajo
  for update to authenticated using (puede_gestionar_obras()) with check (puede_gestionar_obras());

drop policy if exists "ot_delete_admin" on ordenes_trabajo;
create policy "ot_delete" on ordenes_trabajo
  for delete to authenticated using (puede_gestionar_obras());

-- marcar_estado_ot queda igual por fuera, pero ahora chequea el rol de quien
-- la llama antes de hacer nada — antes, al ser "security definer", cualquier
-- autenticado podía usarla sin que el RLS de la tabla lo frenara.
create or replace function marcar_estado_ot(
  p_ot_id uuid,
  p_estado text,
  p_motivo_incumplimiento text default null,
  p_motivo_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'capataz', 'jefe_obra')
  ) then
    raise exception 'No tenés permiso para cambiar el estado de una orden de trabajo';
  end if;

  update ordenes_trabajo
  set
    estado = p_estado,
    motivo_incumplimiento = case
      when p_estado = 'no_cumplida' then p_motivo_incumplimiento
      else null
    end,
    motivo_detalle = case
      when p_estado = 'no_cumplida' and p_motivo_incumplimiento = 'otro' then p_motivo_detalle
      else null
    end
  where id = p_ot_id;

  if not found then
    raise exception 'La orden de trabajo % no existe', p_ot_id;
  end if;
end;
$$;

-- =========================================================================
-- Verificación: como tu usuario es administrador, las 4 tienen que dar
-- "true". Si alguna da "false", avisame antes de seguir.
-- =========================================================================
select
  puede_stock() as puede_stock,
  puede_comercial() as puede_comercial,
  puede_gestionar_obras() as puede_gestionar_obras,
  puede_ver_obras() as puede_ver_obras;
