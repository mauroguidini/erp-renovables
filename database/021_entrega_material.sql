-- Módulo: Entregas de material a obra (PASO 2 de varios)
-- Qué hace este script:
-- 1. Crea puede_entregar_material() — administrador, compras y jefe_obra.
-- 2. Crea 3 vistas chicas, solo con lo necesario para llenar el formulario
--    de entrega, visibles ÚNICAMENTE a quien puede entregar material:
--    - productos_nombre: id, nombre, código, unidad — para que Jefe de obra
--      (que no tiene acceso a Productos) pueda elegir qué se entrega.
--    - depositos_origen: id, nombre de los depósitos que NO son de obra —
--      para que Jefe de obra pueda elegir de dónde sale el material.
--    - obras_para_entrega: id, dirección y cliente de las obras no
--      canceladas — para que Compras (que no tiene acceso a Obras) pueda
--      elegir a qué obra entrega.
-- 3. Crea entregar_material_a_obra(obra, depósito origen, producto,
--    cantidad, motivo): busca el depósito propio de esa obra (lo crea si
--    todavía no existe, si es la primera entrega) y llama a
--    transferir_stock — la función existente, sin modificarla — para mover
--    el stock de verdad, con la misma validación de stock disponible que
--    ya tiene.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 020.

create or replace function puede_entregar_material()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'compras', 'jefe_obra')
  );
$$;

grant execute on function puede_entregar_material() to authenticated;

create view productos_nombre as
select id, nombre, codigo, unidad_medida
from productos
where puede_entregar_material();

create view depositos_origen as
select id, nombre
from depositos
where tipo <> 'obra' and puede_entregar_material();

create view obras_para_entrega as
select o.id, o.direccion, c.nombre as cliente_nombre
from obras o
left join clientes c on c.id = o.cliente_id
where puede_entregar_material() and o.estado <> 'cancelada';

grant select on productos_nombre to authenticated;
grant select on depositos_origen to authenticated;
grant select on obras_para_entrega to authenticated;
revoke all on productos_nombre, depositos_origen, obras_para_entrega from anon;

create or replace function entregar_material_a_obra(
  p_obra_id uuid,
  p_deposito_origen_id uuid,
  p_producto_id uuid,
  p_cantidad numeric,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposito_destino_id uuid;
  v_direccion text;
begin
  if not puede_entregar_material() then
    raise exception 'No tenés permiso para entregar material a una obra';
  end if;

  -- "for update" bloquea la fila de la obra hasta que termine esta
  -- transacción, para que dos entregas a la misma obra al mismo tiempo no
  -- terminen creando dos depósitos distintos para ella.
  select deposito_id, direccion into v_deposito_destino_id, v_direccion
  from obras
  where id = p_obra_id
  for update;

  if not found then
    raise exception 'La obra % no existe', p_obra_id;
  end if;

  if v_deposito_destino_id is null then
    insert into depositos (nombre, tipo, activo)
    values ('Obra - ' || v_direccion, 'obra', true)
    returning id into v_deposito_destino_id;

    update obras set deposito_id = v_deposito_destino_id where id = p_obra_id;
  end if;

  perform transferir_stock(
    p_producto_id,
    p_deposito_origen_id,
    v_deposito_destino_id,
    p_cantidad,
    p_motivo
  );
end;
$$;

grant execute on function entregar_material_a_obra(uuid, uuid, uuid, numeric, text) to authenticated;
revoke execute on function entregar_material_a_obra(uuid, uuid, uuid, numeric, text) from anon;
