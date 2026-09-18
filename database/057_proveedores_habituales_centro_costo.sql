-- Módulo: Proveedores habituales de un centro de costos (imputación automática)
-- Qué hace este script:
-- 1. "centros_costo_proveedores": tabla puente centro↔proveedor. Un mismo
--    proveedor puede estar en varios centros a la vez (por eso NO hay
--    unique en "proveedor_id" solo) — es justamente lo que usa la regla
--    de abajo para decidir cuándo NO adivinar.
-- 2. "facturas_compra.centro_asignado_por_regla": booleano nuevo, en falso
--    por defecto. Se prende SOLO cuando la imputación la puso la regla
--    automática — nunca cuando la elige una persona a mano — para poder
--    filtrarlas y revisarlas después (se pidió explícitamente).
-- 3. La regla en sí, como DOS triggers en "facturas_compra" (no en el
--    código de la pantalla ni del importador):
--    a) Al INSERTAR: si la fila llega SIN centro_costo_id (osea, nadie lo
--       eligió a mano — ni el formulario de carga individual, ni el
--       importador de ARCA, que tampoco lo completa), se cuentan los
--       centros donde el proveedor de esa factura es "habitual". Si hay
--       EXACTAMENTE uno, se lo asigna y se marca centro_asignado_por_regla
--       = true. Si hay cero o hay varios, se deja sin centro — tal cual
--       se pidió, sin adivinar.
--    b) Al EDITAR: si alguien cambia el centro_costo_id a mano (a otro
--       centro, o a vacío), centro_asignado_por_regla vuelve a false —
--       porque ya no es una imputación automática, es una corrección
--       humana.
--    Como la regla vive en triggers de la tabla, se aplica igual sin
--    importar por dónde entre la factura — no hace falta tocar ni el
--    formulario de "Cargar factura" ni "ImportarComprobantesArca.js"; los
--    dos ya insertan con centro_costo_id en null cuando no se elige uno a
--    mano, que es exactamente la señal que dispara la regla.
--
-- Permisos: se reutilizan puede_ver_centros_costo()/puede_gestionar_centros_costo()
-- (050) para la tabla puente — es la misma administración de siempre.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 056.

-- =========================================================================
-- 1. Tabla puente: proveedores habituales de un centro
-- =========================================================================

create table if not exists centros_costo_proveedores (
  id uuid primary key default gen_random_uuid(),
  centro_costo_id uuid not null references centros_costo(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (centro_costo_id, proveedor_id)
);

create index if not exists centros_costo_proveedores_centro_idx on centros_costo_proveedores (centro_costo_id);
create index if not exists centros_costo_proveedores_proveedor_idx on centros_costo_proveedores (proveedor_id);

alter table centros_costo_proveedores enable row level security;
revoke all on centros_costo_proveedores from anon;

drop policy if exists "centros_costo_proveedores_select" on centros_costo_proveedores;
create policy "centros_costo_proveedores_select" on centros_costo_proveedores
  for select to authenticated using (puede_ver_centros_costo());

drop policy if exists "centros_costo_proveedores_insert" on centros_costo_proveedores;
create policy "centros_costo_proveedores_insert" on centros_costo_proveedores
  for insert to authenticated with check (puede_gestionar_centros_costo());

drop policy if exists "centros_costo_proveedores_delete" on centros_costo_proveedores;
create policy "centros_costo_proveedores_delete" on centros_costo_proveedores
  for delete to authenticated using (puede_gestionar_centros_costo());

-- =========================================================================
-- 2. Marca de "esto lo imputó la regla, no una persona"
-- =========================================================================

alter table facturas_compra
  add column if not exists centro_asignado_por_regla boolean not null default false;

-- =========================================================================
-- 3. La regla: imputación automática al insertar, y se despega al editar
-- =========================================================================

create or replace function aplicar_regla_centro_costo_proveedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_centro_id uuid;
  v_cantidad int;
begin
  -- Si ya viene con centro elegido a mano, no se toca.
  if new.centro_costo_id is not null then
    return new;
  end if;

  select count(*), min(centro_costo_id) into v_cantidad, v_centro_id
  from centros_costo_proveedores
  where proveedor_id = new.proveedor_id;

  if v_cantidad = 1 then
    new.centro_costo_id := v_centro_id;
    new.centro_asignado_por_regla := true;
  end if;

  return new;
end;
$$;

drop trigger if exists facturas_compra_regla_centro_costo on facturas_compra;
create trigger facturas_compra_regla_centro_costo
  before insert on facturas_compra
  for each row execute function aplicar_regla_centro_costo_proveedor();

create or replace function limpiar_regla_centro_costo_en_edicion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.centro_costo_id is distinct from old.centro_costo_id then
    new.centro_asignado_por_regla := false;
  end if;
  return new;
end;
$$;

drop trigger if exists facturas_compra_limpiar_regla_centro_costo on facturas_compra;
create trigger facturas_compra_limpiar_regla_centro_costo
  before update on facturas_compra
  for each row execute function limpiar_regla_centro_costo_en_edicion();

-- Verificación: tiene que devolver 0 filas sin error.
select * from centros_costo_proveedores;
