-- Módulo: Pedidos de material desde una OT, visibles para Compras (PASO 1)
-- Qué hace este script:
-- 1. Crea "pedidos_material" (cabecera: de qué OT/obra, quién lo pidió,
--    estado pendiente/atendido) y "pedidos_material_items" (una fila por
--    producto pedido, con cantidad).
-- 2. El campo "obra_id" de un pedido NUNCA lo pone el cliente: un trigger lo
--    completa solo, leyéndolo de la OT (ot_id) — así nunca puede quedar un
--    pedido con una obra que no coincide con la de su OT.
-- 3. Capacidad nueva "puede_pedir_material()": administrador, capataz y
--    jefe_obra — el mismo grupo que ya maneja el día a día de las OT.
-- 4. Le agrega a "productos" una política de LECTURA para
--    puede_ver_obras() (administrador/capataz/jefe_obra/administración).
--    Hoy esa tabla es zona exclusiva de Depósito/Stock (solo
--    administrador/compras pueden verla y tocarla) — esto SUMA una política
--    de solo lectura, no le da a Obras ningún permiso de escritura sobre el
--    catálogo. El catálogo no tiene precios ni costos (eso vive en
--    compra_items, que no se toca), así que no se expone nada sensible.
-- 5. Compras (administrador/compras, vía puede_stock()) puede ver todos los
--    pedidos de todas las obras y marcarlos como "atendido". Por ahora esto
--    es solo una cola para gestionar a mano — todavía NO genera una compra
--    automática ni hace seguimiento de si ya se entregó.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 041.

create or replace function puede_pedir_material()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'capataz', 'jefe_obra')
  );
$$;

grant execute on function puede_pedir_material() to authenticated;

create table pedidos_material (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  ot_id uuid not null references ordenes_trabajo(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'atendido')),
  nota text,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  atendido_por uuid,
  atendido_por_email text,
  atendido_en timestamptz
);

create table pedidos_material_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_material(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric not null check (cantidad > 0)
);

-- El obra_id de un pedido se deriva SIEMPRE de su OT, nunca de lo que mande
-- el cliente — así nunca puede haber un pedido con una obra que no
-- corresponde a su OT. De paso, "quién lo pidió" tampoco se confía al
-- cliente: se completa acá con el usuario real de la sesión.
create or replace function fijar_obra_pedido_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select obra_id into new.obra_id from ordenes_trabajo where id = new.ot_id;

  if new.obra_id is null then
    raise exception 'La OT % no existe', new.ot_id;
  end if;

  new.creado_por := auth.uid();
  new.creado_por_email := (select email from profiles where id = auth.uid());

  return new;
end;
$$;

drop trigger if exists pedidos_material_fijar_obra on pedidos_material;
create trigger pedidos_material_fijar_obra
  before insert on pedidos_material
  for each row execute function fijar_obra_pedido_material();

alter table pedidos_material enable row level security;
alter table pedidos_material_items enable row level security;

create policy "pedidos_material_select" on pedidos_material
  for select to authenticated using (puede_ver_obras() or puede_stock());

create policy "pedidos_material_insert" on pedidos_material
  for insert to authenticated with check (puede_pedir_material());

create policy "pedidos_material_update" on pedidos_material
  for update to authenticated using (puede_stock()) with check (puede_stock());

create policy "pedidos_material_items_select" on pedidos_material_items
  for select to authenticated using (puede_ver_obras() or puede_stock());

create policy "pedidos_material_items_insert" on pedidos_material_items
  for insert to authenticated with check (puede_pedir_material());

revoke all on pedidos_material from anon;
revoke all on pedidos_material_items from anon;

-- Función que usa Compras para marcar un pedido como atendido — así queda
-- registrado quién y cuándo, sin depender de que el frontend mande bien
-- esos dos campos.
create or replace function marcar_pedido_material_atendido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_stock() then
    raise exception 'No tenés permiso para marcar un pedido de material como atendido';
  end if;

  update pedidos_material
  set
    estado = 'atendido',
    atendido_por = auth.uid(),
    atendido_por_email = (select email from profiles where id = auth.uid()),
    atendido_en = now()
  where id = p_pedido_id;
end;
$$;

grant execute on function marcar_pedido_material_atendido(uuid) to authenticated;
revoke execute on function marcar_pedido_material_atendido(uuid) from anon;

-- Productos: suma lectura para Obras (sin tocar el permiso de gestión que
-- ya tiene Depósito/Stock).
create policy "productos_select_obras" on productos
  for select to authenticated using (puede_ver_obras());

-- Verificación: tiene que devolver 0 filas, sin error.
select * from pedidos_material;
