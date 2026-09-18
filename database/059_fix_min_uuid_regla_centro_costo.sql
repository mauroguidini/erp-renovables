-- Módulo: Corrige "function min(uuid) does not exist" en la regla de
-- proveedor habitual (057 y 058)
-- Postgres no tiene un agregado min()/max() para el tipo uuid (sí para
-- int, text, fechas, etc.) — las dos funciones de 057 y 058 lo usaban
-- para quedarse con "el" centro_costo_id cuando había exactamente uno.
-- Como en los dos casos solo hace falta ESE valor único (no realmente el
-- mínimo — el orden no importa si ya se sabe que hay uno solo), se
-- reemplaza por array_agg(...)[1], que funciona con cualquier tipo.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 058.

create or replace function aplicar_regla_centro_costo_proveedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_centro_id uuid;
  v_cantidad int;
begin
  if new.centro_costo_id is not null then
    return new;
  end if;

  select count(*), (array_agg(centro_costo_id))[1] into v_cantidad, v_centro_id
  from centros_costo_proveedores
  where proveedor_id = new.proveedor_id;

  if v_cantidad = 1 then
    new.centro_costo_id := v_centro_id;
    new.centro_asignado_por_regla := true;
  end if;

  return new;
end;
$$;

create or replace function aplicar_regla_centro_costo_historico()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_afectadas integer;
begin
  if not puede_gestionar_centros_costo() then
    raise exception 'No tenés permiso para aplicar esta regla';
  end if;

  with candidatos as (
    select f.id as factura_id, (array_agg(h.centro_costo_id))[1] as centro_id
    from facturas_compra f
    join centros_costo_proveedores h on h.proveedor_id = f.proveedor_id
    where f.centro_costo_id is null
    group by f.id
    having count(*) = 1
  )
  update facturas_compra f
  set centro_costo_id = c.centro_id,
      centro_asignado_por_regla = true
  from candidatos c
  where f.id = c.factura_id;

  get diagnostics v_afectadas = row_count;
  return v_afectadas;
end;
$$;
