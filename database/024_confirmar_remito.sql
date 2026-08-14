-- Módulo: Remitos con firma (PASO 2 de varios)
-- Qué hace este script: crea confirmar_remito(remito_id). Busca el depósito
-- propio de la obra del remito (lo crea si es la primera entrega a esa
-- obra), y por cada línea de remito_items llama a transferir_stock — sin
-- modificarla — para mover el stock real. Recién al final marca el remito
-- como "confirmado". Si algo falla en el medio (por ejemplo, stock
-- insuficiente en algún producto), no se confirma nada: al ser una sola
-- transacción, o se mueve todo o no se mueve nada.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 023.

create or replace function confirmar_remito(p_remito_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remito record;
  v_deposito_destino_id uuid;
  item record;
begin
  if not puede_entregar_material() then
    raise exception 'No tenés permiso para confirmar un remito';
  end if;

  select * into v_remito from remitos where id = p_remito_id for update;

  if not found then
    raise exception 'El remito % no existe', p_remito_id;
  end if;

  if v_remito.estado = 'confirmado' then
    raise exception 'Este remito ya estaba confirmado';
  end if;

  -- "for update" bloquea la fila de la obra, para que dos remitos de la
  -- misma obra confirmados al mismo tiempo no terminen creando dos
  -- depósitos distintos para ella.
  select deposito_id into v_deposito_destino_id
  from obras
  where id = v_remito.obra_id
  for update;

  if v_deposito_destino_id is null then
    insert into depositos (nombre, tipo, activo)
    select 'Obra - ' || direccion, 'obra', true
    from obras
    where id = v_remito.obra_id
    returning id into v_deposito_destino_id;

    update obras set deposito_id = v_deposito_destino_id where id = v_remito.obra_id;
  end if;

  for item in select * from remito_items where remito_id = p_remito_id loop
    perform transferir_stock(
      item.producto_id,
      v_remito.deposito_origen_id,
      v_deposito_destino_id,
      item.cantidad,
      v_remito.motivo
    );
  end loop;

  update remitos
  set estado = 'confirmado', confirmed_at = now()
  where id = p_remito_id;
end;
$$;

grant execute on function confirmar_remito(uuid) to authenticated;
revoke execute on function confirmar_remito(uuid) from anon;
