-- Módulo: Aplicar la regla de proveedor habitual a facturas YA cargadas
-- El trigger de 057 solo actúa al INSERTAR una factura nueva — nunca
-- reprocesa lo que ya estaba en la base antes de asignar un proveedor
-- habitual a un centro. Este script agrega un botón de "pasada única"
-- para eso: imputa las facturas sin centro cuyo proveedor sea habitual de
-- un solo centro, exactamente el mismo criterio que el trigger.
--
-- Qué hace este script:
-- 1. Ajusta limpiar_regla_centro_costo_en_edicion() (057): antes, CUALQUIER
--    cambio de centro_costo_id apagaba centro_asignado_por_regla, sin
--    distinguir "lo cambió una persona a mano" de "lo está poniendo la
--    función de abajo, a propósito, en true". Ahora: si quien actualiza
--    ya puso centro_asignado_por_regla en un valor explícito (distinto al
--    que tenía antes), se respeta ese valor tal cual; si no lo tocó, sigue
--    apagándose como antes (edición manual de toda la vida).
-- 2. "aplicar_regla_centro_costo_historico()": función que corre la regla
--    una vez sobre TODAS las facturas con centro_costo_id en null, en un
--    solo UPDATE (no fila por fila) — junta cada factura sin centro con
--    los centros donde su proveedor es habitual, y solo la actualiza si
--    hay EXACTAMENTE uno (mismo "no adivinar" del trigger). Devuelve
--    cuántas facturas tocó, para mostrarlo en la pantalla.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 057.
-- Se puede volver a correr sin problema si hace falta (por ejemplo, cada
-- vez que se agrega un proveedor habitual nuevo a un centro).

create or replace function limpiar_regla_centro_costo_en_edicion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.centro_costo_id is distinct from old.centro_costo_id then
    -- Si quien actualiza ya decidió el valor de la marca a propósito (es
    -- distinto del que tenía antes), se respeta — es el caso de
    -- aplicar_regla_centro_costo_historico() marcando en true. Si no lo
    -- tocó, es una edición manual de toda la vida: se apaga.
    if new.centro_asignado_por_regla is not distinct from old.centro_asignado_por_regla then
      new.centro_asignado_por_regla := false;
    end if;
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
    select f.id as factura_id, min(h.centro_costo_id) as centro_id
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

grant execute on function aplicar_regla_centro_costo_historico() to authenticated;
