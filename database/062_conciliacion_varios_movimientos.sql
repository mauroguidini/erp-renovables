-- Módulo: Conciliación bancaria — agrupar VARIOS movimientos bancarios
-- contra VARIAS facturas en un solo pago (ej: dos transferencias que
-- juntas pagan tres facturas de un mismo proveedor).
--
-- Reemplaza conciliar_movimiento_bancario(movimiento, facturas[]) por
-- conciliar_movimientos_bancarios(movimientos[], facturas[]) — mismas
-- validaciones de siempre (facturas del mismo proveedor, pendientes, no
-- notas de crédito; movimientos de débito, no conciliados) pero ahora
-- sobre un array de movimientos también. Se arma UNA sola Orden de pago;
-- "ordenes_pago.movimiento_bancario_id" deja de completarse (ya no
-- alcanza para guardar "el" movimiento cuando son varios) — la relación
-- real vive del lado de movimientos_bancarios.orden_pago_id, que ya
-- soportaba que más de un movimiento apunte a la misma orden.
--
-- Se corrige también desconciliar_movimiento_bancario: antes solo
-- reponía a "pendiente" el movimiento que se le pasaba — si la
-- conciliación agrupaba varios, los demás quedaban conciliados
-- "colgados" de una Orden de pago ya anulada. Ahora, a partir de
-- cualquiera de los movimientos del grupo, encuentra la Orden de pago y
-- repone TODOS los movimientos que compartían esa orden.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 061.

drop function if exists conciliar_movimiento_bancario(uuid, uuid[]);

create or replace function conciliar_movimientos_bancarios(
  p_movimiento_ids uuid[],
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
  v_movimiento_id uuid;
  v_factura record;
  v_factura_id uuid;
  v_proveedor_id uuid;
  v_total_facturas numeric(12, 2) := 0;
  v_orden_pago_id uuid;
  v_fecha date;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para conciliar movimientos bancarios';
  end if;

  if p_movimiento_ids is null or array_length(p_movimiento_ids, 1) is null then
    raise exception 'Elegí al menos un movimiento bancario';
  end if;
  if p_factura_ids is null or array_length(p_factura_ids, 1) is null then
    raise exception 'Elegí al menos una factura para conciliar';
  end if;

  -- Bloquea y valida cada movimiento SIN escribir nada todavía.
  foreach v_movimiento_id in array p_movimiento_ids loop
    select * into v_movimiento from movimientos_bancarios where id = v_movimiento_id for update;

    if not found then
      raise exception 'Uno de los movimientos bancarios elegidos ya no existe';
    end if;
    if v_movimiento.estado = 'conciliado' then
      raise exception 'El movimiento del % ya está conciliado', v_movimiento.fecha;
    end if;
    if v_movimiento.debito <= 0 then
      raise exception 'Solo se pueden conciliar movimientos de débito (pagos salientes)';
    end if;
    if v_fecha is null or v_movimiento.fecha > v_fecha then
      v_fecha := v_movimiento.fecha;
    end if;
  end loop;

  -- Bloquea y valida cada factura — mismo criterio que confirmar_orden_pago (054).
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

    v_total_facturas := v_total_facturas + v_factura.importe_total;
  end loop;

  insert into ordenes_pago (proveedor_id, fecha, total, medio_pago)
  values (v_proveedor_id, v_fecha, v_total_facturas, 'transferencia')
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
  where id = any(p_movimiento_ids);

  return v_orden_pago_id;
end;
$$;

grant execute on function conciliar_movimientos_bancarios(uuid[], uuid[]) to authenticated;
revoke execute on function conciliar_movimientos_bancarios(uuid[], uuid[]) from anon;

-- Corrección: repone TODOS los movimientos que compartían la Orden de
-- pago, no solo el que se pasó como parámetro.
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

  -- Todos los movimientos que compartían esta Orden de pago vuelven a
  -- quedar pendientes, no solo el que se pasó como parámetro.
  update movimientos_bancarios
  set estado = 'pendiente',
      conciliado_con_factura_id = null,
      orden_pago_id = null,
      conciliado_por = null,
      conciliado_por_email = null,
      conciliado_at = null
  where orden_pago_id = v_movimiento.orden_pago_id;
end;
$$;

grant execute on function desconciliar_movimiento_bancario(uuid) to authenticated;
revoke execute on function desconciliar_movimiento_bancario(uuid) from anon;
