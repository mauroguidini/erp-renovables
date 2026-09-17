-- Módulo: Centros de costos (Nivel 1 — sin presupuesto todavía)
-- Registro interno para saber cuánto se gasta en cada cosa. Por ahora solo
-- se conecta con Facturas de compra; está preparado para que el día de
-- mañana Caja de efectivo y Rendiciones impute contra el mismo catálogo
-- (una columna "centro_costo_id" nueva en esas tablas, igual que acá) sin
-- rediseñar nada de lo que se crea en este script.
--
-- Qué hace este script:
-- 1. "centros_costo": nombre + tipo ('obra' o 'general') + obra vinculada.
--    "obra_id" es SIEMPRE opcional, no solo "al crear" — un centro de tipo
--    'obra' puede existir sin ninguna obra vinculada indefinidamente
--    (por ejemplo, "Obra Cangallo" antes de que esa obra se cargue
--    formalmente en el sistema) y vincularse después con una edición
--    común. El único candado es al revés: un centro 'general' NO puede
--    tener obra vinculada (no tendría sentido — "Vehículos" no es una
--    obra). Si más adelante se borra la obra vinculada, el centro NO se
--    borra ni queda roto: "obra_id" simplemente vuelve a quedar vacío
--    (on delete set null).
-- 2. Se puede crear y editar un centro, pero A PROPÓSITO no hay política
--    de DELETE: si alguna factura ya quedó imputada a un centro y se
--    pudiera borrar, esas facturas se quedarían con la imputación rota o
--    silenciosamente vacía. Para sacar un centro de circulación sin
--    perder el historial existe "activo" (se puede desactivar).
-- 3. Se agrega "centro_costo_id" a "facturas_compra": columna NUEVA,
--    opcional (NULL por defecto, sin "not null"). Todas las facturas que
--    ya existen quedan con centro vacío automáticamente — no hay nada que
--    migrar ni corregir, y la pantalla de Facturas sigue funcionando
--    igual para las que no se imputen.
--
-- Permisos: puede_ver_centros_costo() / puede_gestionar_centros_costo(),
-- las dos administrador + administracion (el rol "administrativo" de
-- siempre en este sistema). Imputar una factura a un centro no necesita
-- una política nueva: ya es un campo más dentro de la fila, y
-- facturas_compra_update (script 048) ya deja editar cualquier campo de
-- una factura a ese mismo grupo de roles.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 049.

-- =========================================================================
-- 1. Permisos
-- =========================================================================

create or replace function puede_ver_centros_costo()
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

create or replace function puede_gestionar_centros_costo()
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

grant execute on function puede_ver_centros_costo() to authenticated;
grant execute on function puede_gestionar_centros_costo() to authenticated;

-- =========================================================================
-- 2. Centros de costos
-- =========================================================================

create table centros_costo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null check (tipo in ('obra', 'general')),
  obra_id uuid references obras(id) on delete set null,
  activo boolean not null default true,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  check (tipo = 'obra' or obra_id is null)
);

-- Un centro 'obra' puede estar sin vincular durante un tiempo, pero dos
-- centros no pueden apuntar a la MISMA obra a la vez (evita partir el
-- gasto de una obra en dos centros por error).
create unique index centros_costo_obra_unique on centros_costo (obra_id) where obra_id is not null;

alter table centros_costo enable row level security;

revoke all on centros_costo from anon;

create policy "centros_costo_select" on centros_costo
  for select to authenticated using (puede_ver_centros_costo());

create policy "centros_costo_insert" on centros_costo
  for insert to authenticated with check (puede_gestionar_centros_costo());

create policy "centros_costo_update" on centros_costo
  for update to authenticated using (puede_gestionar_centros_costo()) with check (puede_gestionar_centros_costo());

-- A propósito NO hay política de delete (ver comentario arriba) — un
-- centro se desactiva, no se borra.

create or replace function set_autor_centro_costo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.creado_por := auth.uid();
  new.creado_por_email := (select email from profiles where id = auth.uid());
  return new;
end;
$$;

drop trigger if exists centros_costo_autor on centros_costo;
create trigger centros_costo_autor
  before insert on centros_costo
  for each row execute function set_autor_centro_costo();

-- =========================================================================
-- 3. Imputación: una columna nueva en facturas_compra
-- =========================================================================

alter table facturas_compra add column centro_costo_id uuid references centros_costo(id) on delete set null;

-- Para pedir "las facturas del centro X en tal período" y para agrupar por
-- centro dentro de un rango de fechas.
create index facturas_compra_centro_fecha_idx on facturas_compra (centro_costo_id, fecha desc);

-- Verificación: la primera consulta tiene que devolver 0 filas sin error.
-- La segunda tiene que mostrar tus facturas ya cargadas con
-- "centro_costo_id" en NULL — es exactamente lo esperado, nada se rompió.
select * from centros_costo;
select id, fecha, proveedor_id, importe_total, centro_costo_id from facturas_compra limit 5;
