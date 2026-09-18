-- Módulo: Conciliación bancaria (versión simple, solo pagos salientes)
-- Registro de los extractos bancarios y su cruce contra Facturas de compra
-- pagadas por transferencia. NO reemplaza ni toca el circuito de Caja de
-- efectivo (048/054) — son dos medios de pago separados a propósito.
--
-- Qué hace este script:
-- 1. "bancos": catálogo chico (hoy solo Banco Credicoop, pensado para sumar
--    otros más adelante). Mismo patrón que centros_costo/categorias_factura.
-- 2. "movimientos_bancarios": una fila por línea del extracto importado
--    (fecha, concepto, número de comprobante, débito, crédito, saldo). Se
--    guardan TODOS los movimientos, no solo los débitos — para que el
--    extracto quede completo — pero solo los débitos pasan por
--    clasificación/conciliación; los créditos quedan en estado
--    'no_aplica' (los cobros son un paso futuro, no de este script).
--    "clasificacion" es la etiqueta automática de lo obvio (impuestos /
--    gastos_bancarios) — NO tiene relación con categorias_factura, porque
--    estos movimientos clasificados no generan una factura ni una OP,
--    quedan así nomás. El import es un insert directo desde la pantalla
--    (igual que ImportarComprobantesArca con facturas_compra) — por eso
--    esta tabla SÍ tiene política de insert, a diferencia de ordenes_pago.
--    Los cambios de estado hacia "conciliado" o de vuelta a "pendiente"
--    SOLO pasan por las funciones del punto 4 — por eso no hay política de
--    update: nadie puede tildar un movimiento como conciliado a mano.
-- 3. "ordenes_pago" recibe DOS columnas nuevas y opcionales:
--    "medio_pago" ('caja' por default — así ninguna OP vieja cambia — o
--    'transferencia') y "movimiento_bancario_id" (el comprobante del pago:
--    de qué línea del extracto salió esa plata). Ninguna función ni
--    política existente de 054 se modifica.
-- 4. Dos funciones nuevas, hermanas de confirmar_orden_pago/anular_orden_pago
--    (054) pero SIN tocar caja_movimientos en ningún momento:
--    a) conciliar_movimiento_bancario(movimiento, factura): valida (con
--       "for update", mismo criterio que 054) que el movimiento no esté ya
--       conciliado, que sea un débito, que la factura sea una factura (no
--       nota de crédito) y que esté PENDIENTE — evita el pago doble. Crea
--       la Orden de pago (medio_pago='transferencia'), marca la factura
--       pagada (usa la misma bandera de sesión que ya respeta el candado
--       de 054, así ese trigger no la bloquea) y marca el movimiento como
--       conciliado con quién y cuándo.
--    b) desconciliar_movimiento_bancario(movimiento): anula la Orden de
--       pago, devuelve la factura a pendiente, y el movimiento vuelve a
--       'pendiente' — el movimiento en sí NUNCA se borra.
--
-- Permisos: se reutilizan puede_ver_facturas()/puede_gestionar_facturas()
-- (048) — mismo público administrativo de siempre, sin funciones nuevas.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 059.

-- =========================================================================
-- 1. Catálogo de bancos
-- =========================================================================

create table bancos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into bancos (nombre) values ('Banco Credicoop');

alter table bancos enable row level security;
revoke all on bancos from anon;

create policy "bancos_select" on bancos
  for select to authenticated using (puede_ver_facturas());

create policy "bancos_insert" on bancos
  for insert to authenticated with check (puede_gestionar_facturas());

-- =========================================================================
-- 2. Movimientos bancarios (extracto importado)
-- =========================================================================

create table movimientos_bancarios (
  id uuid primary key default gen_random_uuid(),
  banco_id uuid not null references bancos(id),
  fecha date not null,
  concepto text not null,
  numero_comprobante text,
  debito numeric(12, 2) not null default 0 check (debito >= 0),
  credito numeric(12, 2) not null default 0 check (credito >= 0),
  saldo numeric(12, 2),
  cuit_detectado text,
  clasificacion text check (clasificacion in ('impuestos', 'gastos_bancarios')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'clasificado', 'conciliado', 'no_aplica')),
  conciliado_con_factura_id uuid references facturas_compra(id),
  orden_pago_id uuid,
  conciliado_por uuid,
  conciliado_por_email text,
  conciliado_at timestamptz,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  unique (banco_id, fecha, numero_comprobante, debito, credito, saldo)
);

create index movimientos_bancarios_banco_fecha_idx on movimientos_bancarios (banco_id, fecha desc);
create index movimientos_bancarios_estado_idx on movimientos_bancarios (estado);
create index movimientos_bancarios_factura_idx on movimientos_bancarios (conciliado_con_factura_id);

alter table movimientos_bancarios enable row level security;
revoke all on movimientos_bancarios from anon;

create policy "movimientos_bancarios_select" on movimientos_bancarios
  for select to authenticated using (puede_ver_facturas());

create policy "movimientos_bancarios_insert" on movimientos_bancarios
  for insert to authenticated with check (puede_gestionar_facturas());

-- A propósito NO hay política de update/delete: pasar a "conciliado" o
-- volver a "pendiente" SOLO ocurre a través de las funciones del punto 4.

create or replace function set_autor_movimiento_bancario()
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

drop trigger if exists movimientos_bancarios_autor on movimientos_bancarios;
create trigger movimientos_bancarios_autor
  before insert on movimientos_bancarios
  for each row execute function set_autor_movimiento_bancario();

-- =========================================================================
-- 3. Dos columnas nuevas en ordenes_pago (054) — no se toca nada existente
-- =========================================================================

alter table ordenes_pago
  add column medio_pago text not null default 'caja' check (medio_pago in ('caja', 'transferencia'));

alter table ordenes_pago
  add column movimiento_bancario_id uuid references movimientos_bancarios(id);

alter table movimientos_bancarios
  add constraint movimientos_bancarios_orden_pago_fk
  foreign key (orden_pago_id) references ordenes_pago(id);

create index ordenes_pago_movimiento_bancario_idx on ordenes_pago (movimiento_bancario_id);

-- =========================================================================
-- 4. Conciliar / deshacer — hermanas de confirmar_orden_pago/anular_orden_pago
--    (054), pero SIN tocar caja_movimientos en ningún momento.
-- =========================================================================

create or replace function conciliar_movimiento_bancario(
  p_movimiento_id uuid,
  p_factura_id uuid
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
  v_orden_pago_id uuid;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para conciliar movimientos bancarios';
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

  select * into v_factura from facturas_compra where id = p_factura_id for update;
  if not found then
    raise exception 'La factura no existe';
  end if;
  if v_factura.tipo_documento <> 'factura' then
    raise exception 'Solo se pueden conciliar facturas, no notas de crédito';
  end if;
  if v_factura.estado_pago <> 'pendiente' then
    raise exception 'Esta factura ya está pagada — no se puede conciliar de nuevo';
  end if;

  insert into ordenes_pago (proveedor_id, fecha, total, medio_pago, movimiento_bancario_id)
  values (v_factura.proveedor_id, v_movimiento.fecha, v_factura.importe_total, 'transferencia', p_movimiento_id)
  returning id into v_orden_pago_id;

  insert into ordenes_pago_facturas (orden_pago_id, factura_id, monto)
  values (v_orden_pago_id, p_factura_id, v_factura.importe_total);

  perform set_config('app.permitir_cambio_estado_pago', 'on', true);
  update facturas_compra set estado_pago = 'pagada' where id = p_factura_id;

  update movimientos_bancarios
  set estado = 'conciliado',
      conciliado_con_factura_id = p_factura_id,
      orden_pago_id = v_orden_pago_id,
      conciliado_por = auth.uid(),
      conciliado_por_email = (select email from profiles where id = auth.uid()),
      conciliado_at = now()
  where id = p_movimiento_id;

  return v_orden_pago_id;
end;
$$;

grant execute on function conciliar_movimiento_bancario(uuid, uuid) to authenticated;
revoke execute on function conciliar_movimiento_bancario(uuid, uuid) from anon;

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
  update facturas_compra set estado_pago = 'pendiente' where id = v_movimiento.conciliado_con_factura_id;

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

-- Verificación: las dos primeras tienen que devolver filas sin error (la
-- de bancos, el Credicoop precargado); la tercera, 0 filas sin error.
select * from bancos;
select numero, medio_pago, movimiento_bancario_id from ordenes_pago limit 5;
select * from movimientos_bancarios;
