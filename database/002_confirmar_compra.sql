-- Módulo: Confirmación de compras
-- Qué hace este script: crea una función que confirma una compra en una sola
-- transacción atómica: suma el stock, genera los movimientos de entrada, y
-- marca la compra como confirmada. Si la compra ya estaba confirmada, no hace
-- nada dos veces (evita duplicar stock si se aprieta el botón "Confirmar" más
-- de una vez, incluso si se hacen clics simultáneos).
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New query,
-- y hacer clic en "Run". Requiere haber corrido antes 001_productos_y_stock.sql.

drop function if exists confirmar_compra(uuid);

create or replace function confirmar_compra(p_compra_id uuid)
returns void
language plpgsql
as $$
declare
  v_estado text;
  v_deposito_destino_id uuid;
  item record;
begin
  -- "for update" bloquea la fila de la compra hasta que termine esta transacción.
  -- Si dos confirmaciones llegan al mismo tiempo, la segunda espera a que
  -- termine la primera y después ve el estado ya actualizado.
  select estado, deposito_destino_id
  into v_estado, v_deposito_destino_id
  from compras
  where id = p_compra_id
  for update;

  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;

  if v_estado = 'confirmada' then
    raise exception 'Esta compra ya estaba confirmada';
  end if;

  for item in
    select producto_id, cantidad
    from compra_items
    where compra_id = p_compra_id
  loop
    insert into stock (producto_id, deposito_id, cantidad)
    values (item.producto_id, v_deposito_destino_id, item.cantidad)
    on conflict (producto_id, deposito_id)
    do update set cantidad = stock.cantidad + excluded.cantidad;

    insert into movimientos_stock
      (producto_id, tipo, deposito_destino_id, cantidad, compra_id, motivo)
    values
      (item.producto_id, 'entrada', v_deposito_destino_id, item.cantidad, p_compra_id, 'Confirmación de compra');
  end loop;

  update compras
  set estado = 'confirmada', confirmed_at = now()
  where id = p_compra_id;
end;
$$;

grant execute on function confirmar_compra(uuid) to anon, authenticated;
