-- Módulo: Circuito de compras — Órdenes de pago (PASO 2 de 2)
-- Documento que paga una o varias facturas de un mismo proveedor: al
-- confirmarse, descuenta la Caja de efectivo y marca esas facturas como
-- pagadas. Es la parte más delicada de todo el circuito, por eso casi
-- todo pasa por dos funciones (no por inserts directos desde la pantalla).
--
-- Qué hace este script:
-- 1. "ordenes_pago": encabezado. El "total" SÍ se guarda (a diferencia de
--    la Orden de compra) — es un hecho histórico congelado en el momento
--    del pago. Una factura se puede editar después (otro importe, otro
--    centro de costos); si el total de la OP se recalculara en vivo, un
--    pago ya sacado de la caja podría "cambiar" solo, sin que nadie tocó
--    la OP. Mismo criterio que el saldo esperado de un cierre de caja.
--    NO hay política de insert/update/delete para esta tabla — la única
--    forma de crearla o anularla son las dos funciones de abajo, que
--    hacen todas las validaciones antes de escribir nada.
-- 2. "ordenes_pago_facturas": qué facturas entraron en cada OP y por qué
--    monto (también congelado al momento del pago, mismo motivo).
-- 3. Se agrega "orden_pago_id" a caja_movimientos, para que el movimiento
--    de salida (y el de entrada si se anula) quede vinculado a la OP que
--    lo generó.
-- 4. confirmar_orden_pago(proveedor, fecha, facturas[]): TODO en una sola
--    función, o sea una sola transacción — si cualquier validación falla
--    en el medio, Postgres deshace automáticamente todo lo que esa
--    función ya había escrito, sin dejar nada a mitad de camino. Antes de
--    escribir una sola fila, recorre y BLOQUEA cada factura (select ...
--    for update) y valida: que exista, que sea una factura (no una nota
--    de crédito), que sea del proveedor correcto, y que esté PENDIENTE.
--    Como el pasaje a "pagada" ocurre en el mismo paso atómico que
--    descuenta la caja, es imposible que dos Órdenes de pago tomen la
--    misma factura al mismo tiempo.
-- 5. anular_orden_pago(orden_pago_id): repone el monto a la caja (un
--    movimiento de ENTRADA nuevo — nunca se borra el de salida, queda el
--    rastro completo), devuelve cada factura a 'pendiente', y marca la OP
--    como anulada con quién y cuándo. No se borra nada.
-- 6. Candado extra (no pedido, pero necesario para que lo de arriba sea
--    real): ya existe un botón en Facturas para marcar "pagada/pendiente"
--    a mano. Sin nada más, alguien podría destildar a mano una factura
--    pagada por una OP confirmada, dejándola disponible para colarse en
--    una segunda OP — exactamente lo que se pidió evitar. Un trigger
--    bloquea el cambio manual de estado_pago mientras la factura esté
--    bajo una OP confirmada; solo anulando la OP se libera. Las propias
--    funciones de este script marcan una "bandera" de sesión
--    (app.permitir_cambio_estado_pago) antes de tocar estado_pago, así el
--    trigger sabe que ese cambio puntual viene por el camino autorizado.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 053.

-- =========================================================================
-- 1. Encabezado de la Orden de pago
-- =========================================================================

create table ordenes_pago (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  proveedor_id uuid not null references proveedores(id),
  fecha date not null,
  total numeric(12, 2) not null check (total > 0),
  estado text not null default 'confirmada' check (estado in ('confirmada', 'anulada')),
  caja_movimiento_id uuid references caja_movimientos(id),
  caja_movimiento_reversion_id uuid references caja_movimientos(id),
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  anulado_por uuid,
  anulado_por_email text,
  anulada_at timestamptz
);

create or replace function asignar_numero_orden_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero from ordenes_pago;
  end if;
  return new;
end;
$$;

drop trigger if exists ordenes_pago_asignar_numero on ordenes_pago;
create trigger ordenes_pago_asignar_numero
  before insert on ordenes_pago
  for each row execute function asignar_numero_orden_pago();

create or replace function set_autor_orden_pago()
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

drop trigger if exists ordenes_pago_autor on ordenes_pago;
create trigger ordenes_pago_autor
  before insert on ordenes_pago
  for each row execute function set_autor_orden_pago();

alter table ordenes_pago enable row level security;
revoke all on ordenes_pago from anon;

create policy "ordenes_pago_select" on ordenes_pago
  for select to authenticated using (puede_ver_facturas());

-- A propósito NO hay política de insert/update/delete: la única forma de
-- crear o anular una Orden de pago son las funciones de más abajo.

-- =========================================================================
-- 2. Detalle: qué facturas paga cada Orden de pago
-- =========================================================================

create table ordenes_pago_facturas (
  id uuid primary key default gen_random_uuid(),
  orden_pago_id uuid not null references ordenes_pago(id) on delete cascade,
  factura_id uuid not null references facturas_compra(id),
  monto numeric(12, 2) not null check (monto > 0),
  unique (orden_pago_id, factura_id)
);

create index ordenes_pago_facturas_orden_idx on ordenes_pago_facturas (orden_pago_id);
create index ordenes_pago_facturas_factura_idx on ordenes_pago_facturas (factura_id);

alter table ordenes_pago_facturas enable row level security;
revoke all on ordenes_pago_facturas from anon;

create policy "ordenes_pago_facturas_select" on ordenes_pago_facturas
  for select to authenticated using (puede_ver_facturas());

-- A propósito, tampoco acá hay política de insert/update/delete directa.

-- =========================================================================
-- 3. Vínculo desde Caja: qué movimiento generó (o repuso) cada OP
-- =========================================================================

alter table caja_movimientos
  add column orden_pago_id uuid references ordenes_pago(id) on delete set null;

create index caja_movimientos_orden_pago_idx on caja_movimientos (orden_pago_id);

-- =========================================================================
-- 4. Candado: no se puede tildar/destildar "pagada" a mano si la factura
--    está bajo una Orden de pago confirmada
-- =========================================================================

create or replace function validar_estado_pago_bajo_op()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bajo_op boolean;
begin
  if new.estado_pago is distinct from old.estado_pago
     and coalesce(current_setting('app.permitir_cambio_estado_pago', true), '') <> 'on'
  then
    select exists (
      select 1
      from ordenes_pago_facturas opf
      join ordenes_pago op on op.id = opf.orden_pago_id
      where opf.factura_id = new.id and op.estado = 'confirmada'
    ) into v_bajo_op;

    if v_bajo_op then
      raise exception 'Esta factura está pagada por una Orden de pago confirmada. Para revertirlo, anulá la Orden de pago en vez de cambiar el estado a mano.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists facturas_compra_validar_estado_pago on facturas_compra;
create trigger facturas_compra_validar_estado_pago
  before update on facturas_compra
  for each row execute function validar_estado_pago_bajo_op();

-- =========================================================================
-- 5. Confirmar una Orden de pago (todo o nada)
-- =========================================================================

create or replace function confirmar_orden_pago(
  p_proveedor_id uuid,
  p_fecha date,
  p_factura_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_total numeric(12, 2) := 0;
  v_max_hasta date;
  v_orden_pago_id uuid;
  v_numero integer;
  v_caja_movimiento_id uuid;
  v_factura_id uuid;
  v_factura record;
  v_concepto text;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para generar una orden de pago';
  end if;

  if p_factura_ids is null or array_length(p_factura_ids, 1) is null then
    raise exception 'Elegí al menos una factura para pagar';
  end if;

  select max(fecha_hasta) into v_max_hasta from caja_cierres;
  if v_max_hasta is not null and p_fecha <= v_max_hasta then
    raise exception 'La fecha elegida cae dentro de un período de caja ya cerrado (hasta el %)', v_max_hasta;
  end if;

  -- Primera pasada: bloquea y valida cada factura SIN escribir nada
  -- todavía. Si cualquiera falla, no se llegó a tocar ni la caja ni
  -- ninguna otra factura.
  foreach v_factura_id in array p_factura_ids loop
    select * into v_factura from facturas_compra where id = v_factura_id for update;

    if not found then
      raise exception 'Una de las facturas elegidas ya no existe';
    end if;

    if v_factura.tipo_documento <> 'factura' then
      raise exception 'Solo se pueden pagar facturas, no notas de crédito (% n.º %)', v_factura.tipo_factura, v_factura.numero_factura;
    end if;

    if v_factura.proveedor_id <> p_proveedor_id then
      raise exception 'La factura % n.º % no es de este proveedor', v_factura.tipo_factura, v_factura.numero_factura;
    end if;

    if v_factura.estado_pago <> 'pendiente' then
      raise exception 'La factura % n.º % ya está pagada — no se puede incluir en otra orden de pago', v_factura.tipo_factura, v_factura.numero_factura;
    end if;

    v_total := v_total + v_factura.importe_total;
  end loop;

  select string_agg(tipo_factura || ' n.º ' || numero_factura, ', ' order by numero_factura)
    into v_concepto
    from facturas_compra where id = any(p_factura_ids);

  insert into ordenes_pago (proveedor_id, fecha, total)
  values (p_proveedor_id, p_fecha, v_total)
  returning id, numero into v_orden_pago_id, v_numero;

  insert into ordenes_pago_facturas (orden_pago_id, factura_id, monto)
  select v_orden_pago_id, f.id, f.importe_total
  from facturas_compra f
  where f.id = any(p_factura_ids);

  perform set_config('app.permitir_cambio_estado_pago', 'on', true);
  update facturas_compra set estado_pago = 'pagada' where id = any(p_factura_ids);

  insert into caja_movimientos (fecha, tipo, monto, concepto, orden_pago_id)
  values (
    p_fecha, 'salida', v_total,
    'Orden de pago n.º ' || v_numero || ' — Facturas: ' || v_concepto,
    v_orden_pago_id
  )
  returning id into v_caja_movimiento_id;

  update ordenes_pago set caja_movimiento_id = v_caja_movimiento_id where id = v_orden_pago_id;

  return v_orden_pago_id;
end;
$$;

grant execute on function confirmar_orden_pago(uuid, date, uuid[]) to authenticated;
revoke execute on function confirmar_orden_pago(uuid, date, uuid[]) from anon;

-- =========================================================================
-- 6. Anular una Orden de pago (todo o nada)
-- =========================================================================

create or replace function anular_orden_pago(p_orden_pago_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_orden record;
  v_max_hasta date;
  v_fecha_reversion date := current_date;
  v_caja_movimiento_reversion_id uuid;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para anular una orden de pago';
  end if;

  select * into v_orden from ordenes_pago where id = p_orden_pago_id for update;

  if not found then
    raise exception 'La orden de pago no existe';
  end if;

  if v_orden.estado = 'anulada' then
    raise exception 'Esta orden de pago ya está anulada';
  end if;

  select max(fecha_hasta) into v_max_hasta from caja_cierres;
  if v_max_hasta is not null and v_fecha_reversion <= v_max_hasta then
    raise exception 'No se puede anular hoy: el período de caja está cerrado hasta el %', v_max_hasta;
  end if;

  insert into caja_movimientos (fecha, tipo, monto, concepto, orden_pago_id)
  values (
    v_fecha_reversion, 'entrada', v_orden.total,
    'Anulación de Orden de pago n.º ' || v_orden.numero,
    p_orden_pago_id
  )
  returning id into v_caja_movimiento_reversion_id;

  perform set_config('app.permitir_cambio_estado_pago', 'on', true);
  update facturas_compra
  set estado_pago = 'pendiente'
  where id in (select factura_id from ordenes_pago_facturas where orden_pago_id = p_orden_pago_id);

  update ordenes_pago
  set estado = 'anulada',
      caja_movimiento_reversion_id = v_caja_movimiento_reversion_id,
      anulado_por = auth.uid(),
      anulado_por_email = (select email from profiles where id = auth.uid()),
      anulada_at = now()
  where id = p_orden_pago_id;
end;
$$;

grant execute on function anular_orden_pago(uuid) to authenticated;
revoke execute on function anular_orden_pago(uuid) from anon;

-- Verificación: tiene que devolver 0 filas, sin error.
select * from ordenes_pago;
select * from ordenes_pago_facturas;
