-- Módulo: Cheques emitidos (nuevo) — importados desde el listado de
-- e-cheques de Banco Credicoop, y vinculados a mano a la factura que
-- pagan.
--
-- Qué hace este script:
-- 1. "cheques_emitidos": número (único por banco — dos bancos distintos
--    pueden reusar el mismo número de libreta), fecha de pago, monto,
--    proveedor (beneficiario, resuelto por CUIT en la importación),
--    estado (pendiente/en_proceso/cobrado/rechazado, mapeado desde
--    ACTIVO/PRESENTADO/PAGADO/REPUDIADO-RECHAZADO del banco), y
--    "factura_id" opcional — el Excel no trae a qué factura corresponde
--    cada cheque, así que se importan sin vincular y se vinculan a mano
--    después (pantalla /cheques).
-- 2. Permisos: se reutilizan puede_ver_facturas()/puede_gestionar_facturas()
--    (mismo público que ya gestiona facturas de compra y conciliación
--    bancaria — administrador/administracion), sin funciones nuevas.
-- 3. vincular_cheque_factura(cheque, factura): dos validaciones clave —
--    un cheque "rechazado" NUNCA puede vincularse (ni aunque alguien
--    llame el RPC directo, no es solo un botón oculto en la UI), y la
--    factura tiene que ser del mismo proveedor que el cheque. Al
--    vincular, marca la factura "pagada" (mismo mecanismo de escape que
--    ya usan confirmar_orden_pago/conciliar_movimientos_bancarios).
-- 4. desvincular_cheque_factura(cheque): deshace, repone la factura a
--    "pendiente" — mismo criterio que "Deshacer" en conciliación.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 068.

create table if not exists cheques_emitidos (
  id uuid primary key default gen_random_uuid(),
  numero_cheque text not null check (length(btrim(numero_cheque)) > 0),
  banco_id uuid not null references bancos(id),
  fecha_pago date not null,
  monto numeric(12, 2) not null check (monto > 0),
  proveedor_id uuid not null references proveedores(id),
  estado text not null check (estado in ('pendiente', 'en_proceso', 'cobrado', 'rechazado')),
  factura_id uuid references facturas_compra(id),
  vinculado_por uuid,
  vinculado_por_email text,
  vinculado_at timestamptz,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  unique (banco_id, numero_cheque)
);

create index if not exists cheques_emitidos_proveedor_idx on cheques_emitidos (proveedor_id);
create index if not exists cheques_emitidos_factura_idx on cheques_emitidos (factura_id);
create index if not exists cheques_emitidos_estado_idx on cheques_emitidos (estado);

alter table cheques_emitidos enable row level security;
revoke all on cheques_emitidos from anon;

drop policy if exists "cheques_emitidos_select" on cheques_emitidos;
create policy "cheques_emitidos_select" on cheques_emitidos
  for select to authenticated using (puede_ver_facturas());

drop policy if exists "cheques_emitidos_insert" on cheques_emitidos;
create policy "cheques_emitidos_insert" on cheques_emitidos
  for insert to authenticated with check (puede_gestionar_facturas());

create or replace function set_autor_cheque_emitido()
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

drop trigger if exists cheques_emitidos_autor on cheques_emitidos;
create trigger cheques_emitidos_autor
  before insert on cheques_emitidos
  for each row execute function set_autor_cheque_emitido();

create or replace function vincular_cheque_factura(p_cheque_id uuid, p_factura_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_cheque record;
  v_factura record;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para vincular cheques a facturas';
  end if;

  select * into v_cheque from cheques_emitidos where id = p_cheque_id for update;
  if not found then
    raise exception 'El cheque no existe';
  end if;
  if v_cheque.estado = 'rechazado' then
    raise exception 'Un cheque rechazado no se puede vincular a ninguna factura';
  end if;
  if v_cheque.factura_id is not null then
    raise exception 'Este cheque ya está vinculado a una factura — desvinculalo primero';
  end if;

  select * into v_factura from facturas_compra where id = p_factura_id for update;
  if not found then
    raise exception 'La factura no existe';
  end if;
  if v_factura.tipo_documento <> 'factura' then
    raise exception 'Solo se pueden vincular facturas, no notas de crédito';
  end if;
  if v_factura.estado_pago <> 'pendiente' then
    raise exception 'La factura % n.º % ya está pagada', v_factura.tipo_factura, v_factura.numero_factura;
  end if;
  if v_factura.proveedor_id <> v_cheque.proveedor_id then
    raise exception 'La factura tiene que ser del mismo proveedor que el cheque';
  end if;

  perform set_config('app.permitir_cambio_estado_pago', 'on', true);
  update facturas_compra set estado_pago = 'pagada' where id = p_factura_id;

  update cheques_emitidos
  set factura_id = p_factura_id,
      vinculado_por = auth.uid(),
      vinculado_por_email = (select email from profiles where id = auth.uid()),
      vinculado_at = now()
  where id = p_cheque_id;
end;
$$;

grant execute on function vincular_cheque_factura(uuid, uuid) to authenticated;
revoke execute on function vincular_cheque_factura(uuid, uuid) from anon;

create or replace function desvincular_cheque_factura(p_cheque_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_cheque record;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para desvincular cheques';
  end if;

  select * into v_cheque from cheques_emitidos where id = p_cheque_id for update;
  if not found then
    raise exception 'El cheque no existe';
  end if;
  if v_cheque.factura_id is null then
    raise exception 'Este cheque no está vinculado a ninguna factura';
  end if;

  perform set_config('app.permitir_cambio_estado_pago', 'on', true);
  update facturas_compra set estado_pago = 'pendiente' where id = v_cheque.factura_id;

  update cheques_emitidos
  set factura_id = null,
      vinculado_por = null,
      vinculado_por_email = null,
      vinculado_at = null
  where id = p_cheque_id;
end;
$$;

grant execute on function desvincular_cheque_factura(uuid) to authenticated;
revoke execute on function desvincular_cheque_factura(uuid) from anon;

-- Verificación: tiene que devolver 0 filas sin error.
select * from cheques_emitidos;
