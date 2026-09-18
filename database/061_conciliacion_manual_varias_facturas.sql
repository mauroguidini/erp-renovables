-- Módulo: Conciliación bancaria — conciliar VARIAS facturas contra un solo
-- movimiento (para transferencias que pagan más de una factura junta)
-- Hasta acá, conciliar_movimiento_bancario (060) solo aceptaba una factura
-- por movimiento. Esto la reemplaza por una versión que acepta un array de
-- facturas — mismo criterio que confirmar_orden_pago (054): todas tienen
-- que ser del mismo proveedor, todas facturas (no notas de crédito), todas
-- pendientes. Se arma UNA sola Orden de pago con el total de todas.
--
-- "movimientos_bancarios.conciliado_con_factura_id" ya no alcanza para
-- guardar "la" factura cuando son varias — queda en null en ese caso; la
-- lista real de facturas de una conciliación siempre se puede ver desde
-- la Orden de pago (ordenes_pago_facturas), que ya la tenía antes.
--
-- De paso se corrige un bug real de 060: desconciliar_movimiento_bancario
-- solo devolvía a "pendiente" la factura guardada en
-- conciliado_con_factura_id — con una conciliación de varias facturas
-- (que deja esa columna en null) NO devolvía ninguna. Ahora busca las
-- facturas reales a través de la Orden de pago, sirve para uno o para
-- varios por igual.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 060.

drop function if exists conciliar_movimiento_bancario(uuid, uuid);

create or replace function conciliar_movimiento_bancario(
  p_movimiento_id uuid,
  p_factura_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_movimiento record;
  v_factura record;
  v_factura_id uuid;
  v_proveedor_id uuid;
  v_total numeric(12, 2) := 0;
  v_orden_pago_id uuid;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para conciliar movimientos bancarios';
  end if;

  if p_factura_ids is null or array_length(p_factura_ids, 1) is null then
    raise exception 'Elegí al menos una factura para conciliar';
  end if;

  select * into v_movimiento from movimientos_bancarios where id = p_movimiento_id for update;
  if not found then
    raise exception 'El movimiento bancario no existe';
  end if;
  if v_movimiento.estado = 'conciliado' then
    raise exception 'Este movimiento ya está conciliado';
  end if;
  if v_movimiento.debito <= 0 then
    raise exception 'Solo se pueden conciliar movimientos de débito (pagos salientes)';
  end if;

  -- Primera pasada: bloquea y valida cada factura SIN escribir nada
  -- todavía — mismo criterio que confirmar_orden_pago (054).
  foreach v_factura_id in array p_factura_ids loop
    select * into v_factura from facturas_compra where id = v_factura_id for update;

    if not found then
      raise exception 'Una de las facturas elegidas ya no existe';
    end if;
    if v_factura.tipo_documento <> 'factura' then
      raise exception 'Solo se pueden conciliar facturas, no notas de crédito (% n.º %)', v_factura.tipo_factura, v_factura.numero_factura;
    end if;
    if v_factura.estado_pago <> 'pendiente' then
      raise exception 'La factura % n.º % ya está pagada — no se puede conciliar de nuevo', v_factura.tipo_factura, v_factura.numero_factura;
    end if;
    if v_proveedor_id is null then
      v_proveedor_id := v_factura.proveedor_id;
    elsif v_factura.proveedor_id <> v_proveedor_id then
      raise exception 'Todas las facturas de una misma conciliación tienen que ser del mismo proveedor';
    end if;

    v_total := v_total + v_factura.importe_total;
  end loop;

  insert into ordenes_pago (proveedor_id, fecha, total, medio_pago, movimiento_bancario_id)
  values (v_proveedor_id, v_movimiento.fecha, v_total, 'transferencia', p_movimiento_id)
  returning id into v_orden_pago_id;

  insert into ordenes_pago_facturas (orden_pago_id, factura_id, monto)
  select v_orden_pago_id, f.id, f.importe_total
  from facturas_compra f
  where f.id = any(p_factura_ids);

  perform set_config('app.permitir_cambio_estado_pago', 'on', true);
  update facturas_compra set estado_pago = 'pagada' where id = any(p_factura_ids);

  update movimientos_bancarios
  set estado = 'conciliado',
      conciliado_con_factura_id = case when array_length(p_factura_ids, 1) = 1 then p_factura_ids[1] else null end,
      orden_pago_id = v_orden_pago_id,
      conciliado_por = auth.uid(),
      conciliado_por_email = (select email from profiles where id = auth.uid()),
      conciliado_at = now()
  where id = p_movimiento_id;

  return v_orden_pago_id;
end;
$$;

grant execute on function conciliar_movimiento_bancario(uuid, uuid[]) to authenticated;
revoke execute on function conciliar_movimiento_bancario(uuid, uuid[]) from anon;

-- Corrección del bug: buscar las facturas por la Orden de pago, no por la
-- columna conciliado_con_factura_id (que queda en null con varias).
create or replace function desconciliar_movimiento_bancario(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_movimiento record;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para deshacer una conciliación';
  end if;

  select * into v_movimiento from movimientos_bancarios where id = p_movimiento_id for update;
  if not found then
    raise exception 'El movimiento bancario no existe';
  end if;
  if v_movimiento.estado <> 'conciliado' then
    raise exception 'Este movimiento no está conciliado';
  end if;

  perform set_config('app.permitir_cambio_estado_pago', 'on', true);
  update facturas_compra
  set estado_pago = 'pendiente'
  where id in (
    select factura_id from ordenes_pago_facturas where orden_pago_id = v_movimiento.orden_pago_id
  );

  update ordenes_pago
  set estado = 'anulada',
      anulado_por = auth.uid(),
      anulado_por_email = (select email from profiles where id = auth.uid()),
      anulada_at = now()
  where id = v_movimiento.orden_pago_id;

  update movimientos_bancarios
  set estado = 'pendiente',
      conciliado_con_factura_id = null,
      orden_pago_id = null,
      conciliado_por = null,
      conciliado_por_email = null,
      conciliado_at = null
  where id = p_movimiento_id;
end;
$$;

grant execute on function desconciliar_movimiento_bancario(uuid) to authenticated;
revoke execute on function desconciliar_movimiento_bancario(uuid) from anon;
