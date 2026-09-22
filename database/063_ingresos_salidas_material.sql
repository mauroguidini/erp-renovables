-- Módulo: Ingresos y salidas de material y herramientas por obra
-- Registro propio de cada obra, AUTÓNOMO — no toca ni depende del stock
-- global (productos/stock/movimientos_stock) ni del módulo de Remitos.
--
-- Qué hace este script:
-- 1. puede_ver_movimientos_material() / puede_gestionar_movimientos_material():
--    ver = administrador, compras, administracion, capataz, jefe_obra
--    ("producción" — no existe ese rol en el sistema, se mapea a
--    capataz+jefe_obra, confirmado). Cargar = administrador, compras,
--    administracion — capataz/jefe_obra solo consultan y controlan, no
--    cargan (tal cual se pidió).
-- 2. "movimientos_material" (encabezado: obra, tipo ingreso/salida, fecha,
--    firma) y "movimientos_material_items" (detalle: descripción libre,
--    sin catálogo, cantidad, categoría material/herramienta). Igual que
--    Caja de efectivo: los movimientos NO se editan ni se borran (no hay
--    política de update/delete para nadie) — un error se corrige con un
--    movimiento nuevo que compensa, nunca tocando el original. Tampoco
--    hay política de INSERT directa: la única forma de crear un
--    movimiento es la función del punto 4, que valida todo antes de
--    escribir una fila.
-- 3. "stock_obra": vista que calcula el saldo (ingresos menos salidas) por
--    obra y por ítem, SIN guardarlo en ninguna tabla — mismo criterio que
--    el saldo de Caja de efectivo, para que nunca se desincronice de la
--    realidad. Agrupa por descripción normalizada (sin mayúsculas ni
--    espacios de más) para que "Taladro" y "taladro " cuenten como el
--    mismo ítem aunque no haya catálogo. "security_invoker" para que
--    respete el RLS de las tablas de abajo en vez de tener su propio
--    filtro — quien puede ver los movimientos, puede ver el stock.
-- 4. crear_movimiento_material(obra, tipo, fecha, items[], firma): TODO en
--    una sola función/transacción. Si es una salida, bloquea la fila de
--    la obra (for update) antes de revisar nada — así dos salidas
--    simultáneas no puedan las dos creer que hay stock disponible cuando
--    en conjunto se pasan — y por cada ítem exige que el saldo actual en
--    stock_obra alcance la cantidad pedida. Si no alcanza, no escribe
--    nada (raise exception revierte toda la transacción).
--
-- A propósito NO incluye ningún circuito de "objeción" ni plazos — se
-- pidió dejarlo para una etapa siguiente. El diseño no lo bloquea: el día
-- de mañana alcanza con agregar columnas nuevas y opcionales a
-- "movimientos_material" (ej: objetado_por, objetado_en, motivo), sin
-- tocar nada de lo que se crea acá.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 062.

-- =========================================================================
-- 1. Permisos
-- =========================================================================

create or replace function puede_ver_movimientos_material()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('administrador', 'compras', 'administracion', 'capataz', 'jefe_obra')
  );
$$;

create or replace function puede_gestionar_movimientos_material()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'compras', 'administracion')
  );
$$;

grant execute on function puede_ver_movimientos_material() to authenticated;
grant execute on function puede_gestionar_movimientos_material() to authenticated;

-- =========================================================================
-- 2. Movimientos (encabezado + detalle)
-- =========================================================================

create table movimientos_material (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id),
  tipo text not null check (tipo in ('ingreso', 'salida')),
  fecha date not null,
  firma_imagen text,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now()
);

create index movimientos_material_obra_fecha_idx on movimientos_material (obra_id, fecha desc);

alter table movimientos_material enable row level security;
revoke all on movimientos_material from anon;

create policy "movimientos_material_select" on movimientos_material
  for select to authenticated using (puede_ver_movimientos_material());

-- A propósito NO hay política de insert/update/delete: se crean SOLO a
-- través de crear_movimiento_material() (punto 4), y no se editan ni se
-- borran nunca (mismo criterio que caja_movimientos).

create table movimientos_material_items (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references movimientos_material(id) on delete cascade,
  descripcion text not null check (length(btrim(descripcion)) > 0),
  categoria text not null check (categoria in ('material', 'herramienta')),
  cantidad numeric(12, 2) not null check (cantidad > 0)
);

create index movimientos_material_items_movimiento_idx on movimientos_material_items (movimiento_id);

alter table movimientos_material_items enable row level security;
revoke all on movimientos_material_items from anon;

create policy "movimientos_material_items_select" on movimientos_material_items
  for select to authenticated using (puede_ver_movimientos_material());

-- Tampoco acá hay política de insert/update/delete directa — mismo motivo.

-- =========================================================================
-- 3. Stock por obra: se calcula al leer, nunca se guarda aparte
-- =========================================================================

create view stock_obra
with (security_invoker = true) as
select
  m.obra_id,
  lower(btrim(i.descripcion)) as descripcion_normalizada,
  (array_agg(i.descripcion order by m.created_at desc))[1] as descripcion,
  (array_agg(i.categoria order by m.created_at desc))[1] as categoria,
  sum(case when m.tipo = 'ingreso' then i.cantidad else -i.cantidad end) as saldo
from movimientos_material m
join movimientos_material_items i on i.movimiento_id = m.id
group by m.obra_id, lower(btrim(i.descripcion));

-- =========================================================================
-- 4. Crear un movimiento (todo o nada)
-- =========================================================================

create or replace function crear_movimiento_material(
  p_obra_id uuid,
  p_tipo text,
  p_fecha date,
  p_items jsonb,
  p_firma_imagen text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_movimiento_id uuid;
  v_item jsonb;
  v_descripcion text;
  v_categoria text;
  v_cantidad numeric;
  v_saldo_actual numeric;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'compras', 'administracion') then
    raise exception 'No tenés permiso para cargar movimientos de materiales/herramientas';
  end if;

  if p_tipo not in ('ingreso', 'salida') then
    raise exception 'Tipo de movimiento inválido';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un ítem';
  end if;

  -- Bloquea la obra ANTES de revisar nada: si hay dos salidas al mismo
  -- tiempo, la segunda espera a que la primera termine (y ya haya
  -- descontado su cantidad) antes de mirar el saldo — así no pueden las
  -- dos creer que hay stock disponible cuando en conjunto no alcanza.
  perform 1 from obras where id = p_obra_id for update;
  if not found then
    raise exception 'La obra no existe';
  end if;

  insert into movimientos_material (obra_id, tipo, fecha, firma_imagen, creado_por, creado_por_email)
  values (
    p_obra_id, p_tipo, p_fecha, p_firma_imagen,
    auth.uid(),
    (select email from profiles where id = auth.uid())
  )
  returning id into v_movimiento_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_descripcion := btrim(v_item->>'descripcion');
    v_categoria := v_item->>'categoria';
    v_cantidad := (v_item->>'cantidad')::numeric;

    if v_descripcion is null or v_descripcion = '' then
      raise exception 'Falta la descripción de un ítem';
    end if;
    if v_categoria not in ('material', 'herramienta') then
      raise exception 'Categoría inválida para "%"', v_descripcion;
    end if;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida para "%"', v_descripcion;
    end if;

    if p_tipo = 'salida' then
      select coalesce(saldo, 0) into v_saldo_actual
      from stock_obra
      where obra_id = p_obra_id and descripcion_normalizada = lower(v_descripcion);

      if coalesce(v_saldo_actual, 0) < v_cantidad then
        raise exception 'No hay suficiente stock de "%" en esta obra (disponible: %, pedido: %)',
          v_descripcion, coalesce(v_saldo_actual, 0), v_cantidad;
      end if;
    end if;

    insert into movimientos_material_items (movimiento_id, descripcion, categoria, cantidad)
    values (v_movimiento_id, v_descripcion, v_categoria, v_cantidad);
  end loop;

  return v_movimiento_id;
end;
$$;

grant execute on function crear_movimiento_material(uuid, text, date, jsonb, text) to authenticated;
revoke execute on function crear_movimiento_material(uuid, text, date, jsonb, text) from anon;

-- Verificación: las tres primeras tienen que devolver 0 filas sin error.
select * from movimientos_material;
select * from movimientos_material_items;
select * from stock_obra;
