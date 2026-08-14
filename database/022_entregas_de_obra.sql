-- Módulo: Entregas de material a obra (PASO 3 de varios)
-- Qué hace este script: crea entregas_de_obra(obra_id), que devuelve el
-- historial de entregas hacia el depósito propio de esa obra: producto,
-- cantidad, fecha, de qué depósito salió, y motivo. La pueden llamar los
-- mismos 4 roles que ya pueden ver el resto de la obra (administrador,
-- capataz, jefe_obra, administracion) — Compras no, porque esto se muestra
-- en el detalle de la obra, que Compras no puede ver.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 021.

create or replace function entregas_de_obra(p_obra_id uuid)
returns table (
  id uuid,
  producto_nombre text,
  cantidad numeric,
  fecha timestamptz,
  deposito_origen_nombre text,
  motivo text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_ver_obras() then
    raise exception 'No tenés permiso para ver las entregas de esta obra';
  end if;

  return query
  select
    m.id,
    p.nombre as producto_nombre,
    m.cantidad,
    m.created_at as fecha,
    d.nombre as deposito_origen_nombre,
    m.motivo
  from movimientos_stock m
  join productos p on p.id = m.producto_id
  join obras o on o.deposito_id = m.deposito_destino_id
  left join depositos d on d.id = m.deposito_origen_id
  where o.id = p_obra_id and m.tipo = 'transferencia'
  order by m.created_at desc;
end;
$$;

grant execute on function entregas_de_obra(uuid) to authenticated;
revoke execute on function entregas_de_obra(uuid) from anon;
