-- Módulo: Conciliación bancaria — emparejar cheques rechazados cuando el
-- extracto NO trae ningún número de cheque (caso real: "Acreditacion
-- Valores Camara/C.Interno" / "Cheque Rechazado Camara/C.Interno" no
-- traen ningún número en concepto ni en N.º de comprobante).
--
-- Por qué hace falta: 065/066 asumían que siempre hay un número de
-- cheque para emparejar por él. Sin ese dato, la única señal disponible
-- es el monto (exacto, no "parecido") + que el ingreso sea anterior o
-- del mismo día que el rechazo. Como esto es una excepción a "nunca por
-- monto", NUNCA se empareja solo: page.js muestra los candidatos y el
-- usuario tiene que confirmar cada pareja a mano con el botón
-- "Confirmar pareja" (usa esta función) — ninguna importación ni carga
-- automática llama a esto.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 066.

alter table movimientos_bancarios add column if not exists cheque_pareja_confirmado_por uuid;
alter table movimientos_bancarios add column if not exists cheque_pareja_confirmado_por_email text;
alter table movimientos_bancarios add column if not exists cheque_pareja_confirmado_at timestamptz;

create or replace function confirmar_pareja_cheque(p_ingreso_id uuid, p_rechazo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_ingreso record;
  v_rechazo record;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para emparejar cheques';
  end if;

  if p_ingreso_id = p_rechazo_id then
    raise exception 'Elegí dos movimientos distintos';
  end if;

  -- Bloquea los dos en un orden fijo (por id) para no generar deadlocks
  -- si dos personas confirman parejas cruzadas al mismo tiempo.
  if p_ingreso_id < p_rechazo_id then
    select * into v_ingreso from movimientos_bancarios where id = p_ingreso_id for update;
    select * into v_rechazo from movimientos_bancarios where id = p_rechazo_id for update;
  else
    select * into v_rechazo from movimientos_bancarios where id = p_rechazo_id for update;
    select * into v_ingreso from movimientos_bancarios where id = p_ingreso_id for update;
  end if;

  if v_ingreso.id is null or v_rechazo.id is null then
    raise exception 'Uno de los dos movimientos ya no existe';
  end if;
  if v_ingreso.credito <= 0 then
    raise exception 'El primer movimiento tiene que ser un ingreso (crédito)';
  end if;
  if v_rechazo.debito <= 0 then
    raise exception 'El segundo movimiento tiene que ser un rechazo (débito)';
  end if;
  if v_ingreso.banco_id <> v_rechazo.banco_id then
    raise exception 'Los dos movimientos tienen que ser del mismo banco';
  end if;
  if v_ingreso.credito <> v_rechazo.debito then
    raise exception 'Los montos no coinciden exactamente — no se puede confirmar esta pareja';
  end if;
  if v_ingreso.estado = 'conciliado' or v_rechazo.estado = 'conciliado' then
    raise exception 'Uno de los dos movimientos ya está conciliado';
  end if;
  if v_ingreso.cheque_pareja_id is not null or v_rechazo.cheque_pareja_id is not null then
    raise exception 'Uno de los dos movimientos ya tiene una pareja asignada';
  end if;

  update movimientos_bancarios
  set cheque_pareja_id = v_rechazo.id,
      cheque_pareja_confirmado_por = auth.uid(),
      cheque_pareja_confirmado_por_email = (select email from profiles where id = auth.uid()),
      cheque_pareja_confirmado_at = now()
  where id = v_ingreso.id;

  update movimientos_bancarios
  set cheque_pareja_id = v_ingreso.id,
      clasificacion = 'cheque_rechazado',
      estado = 'clasificado',
      cuit_detectado = null,
      cheque_pareja_confirmado_por = auth.uid(),
      cheque_pareja_confirmado_por_email = (select email from profiles where id = auth.uid()),
      cheque_pareja_confirmado_at = now()
  where id = v_rechazo.id;
end;
$$;

grant execute on function confirmar_pareja_cheque(uuid, uuid) to authenticated;
revoke execute on function confirmar_pareja_cheque(uuid, uuid) from anon;

create or replace function deshacer_pareja_cheque(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_movimiento record;
  v_pareja_id uuid;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para deshacer un emparejamiento de cheques';
  end if;

  select * into v_movimiento from movimientos_bancarios where id = p_movimiento_id for update;
  if not found then
    raise exception 'El movimiento bancario no existe';
  end if;
  if v_movimiento.cheque_pareja_id is null then
    raise exception 'Este movimiento no tiene una pareja de cheque asignada';
  end if;

  v_pareja_id := v_movimiento.cheque_pareja_id;

  update movimientos_bancarios
  set cheque_pareja_id = null,
      cheque_pareja_confirmado_por = null,
      cheque_pareja_confirmado_por_email = null,
      cheque_pareja_confirmado_at = null,
      clasificacion = case when clasificacion = 'cheque_rechazado' then null else clasificacion end,
      estado = case when clasificacion = 'cheque_rechazado' then 'pendiente' else estado end
  where id in (p_movimiento_id, v_pareja_id);
end;
$$;

grant execute on function deshacer_pareja_cheque(uuid) to authenticated;
revoke execute on function deshacer_pareja_cheque(uuid) from anon;
