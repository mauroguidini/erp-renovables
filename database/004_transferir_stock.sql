-- Módulo: Transferencias de stock entre depósitos
-- Qué hace este script: crea una función que mueve una cantidad de un producto
-- de un depósito origen a un depósito destino, en una sola transacción
-- atómica. Valida que haya stock suficiente en el origen antes de mover nada,
-- y genera el movimiento correspondiente en el historial.
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New query,
-- y hacer clic en "Run". Requiere haber corrido antes 001, 002 y 003.

drop function if exists transferir_stock(uuid, uuid, uuid, numeric, text);

create or replace function transferir_stock(
  p_producto_id uuid,
  p_deposito_origen_id uuid,
  p_deposito_destino_id uuid,
  p_cantidad numeric,
  p_motivo text default null
)
returns void
language plpgsql
as $$
declare
  v_cantidad_origen numeric;
begin
  if p_deposito_origen_id = p_deposito_destino_id then
    raise exception 'El depósito origen y el destino no pueden ser el mismo';
  end if;

  if p_cantidad <= 0 then
    raise exception 'La cantidad a transferir debe ser mayor a cero';
  end if;

  -- "for update" bloquea la fila de stock del origen hasta que termine esta
  -- transacción, para que dos transferencias simultáneas no lean el mismo
  -- stock disponible y terminen restando de más.
  select cantidad into v_cantidad_origen
  from stock
  where producto_id = p_producto_id and deposito_id = p_deposito_origen_id
  for update;

  if not found then
    v_cantidad_origen := 0;
  end if;

  if v_cantidad_origen < p_cantidad then
    raise exception 'Stock insuficiente: hay % unidades disponibles en el depósito origen y se pidieron transferir %',
      v_cantidad_origen, p_cantidad;
  end if;

  update stock
  set cantidad = cantidad - p_cantidad
  where producto_id = p_producto_id and deposito_id = p_deposito_origen_id;

  insert into stock (producto_id, deposito_id, cantidad)
  values (p_producto_id, p_deposito_destino_id, p_cantidad)
  on conflict (producto_id, deposito_id)
  do update set cantidad = stock.cantidad + excluded.cantidad;

  insert into movimientos_stock
    (producto_id, tipo, deposito_origen_id, deposito_destino_id, cantidad, motivo)
  values
    (p_producto_id, 'transferencia', p_deposito_origen_id, p_deposito_destino_id, p_cantidad, p_motivo);
end;
$$;

revoke execute on function transferir_stock(uuid, uuid, uuid, numeric, text) from anon;
grant execute on function transferir_stock(uuid, uuid, uuid, numeric, text) to authenticated;
