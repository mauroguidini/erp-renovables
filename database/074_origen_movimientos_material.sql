-- Módulo: Origen del material/herramienta que ingresa a la obra
-- Qué hace este script:
-- 1. Agrega "origen" a movimientos_material (texto libre, opcional) — de
--    dónde viene lo que entra a la obra (ej. "Depósito central", "Comprado
--    a Ferretería Pérez", "Préstamo de la obra de Ruta 11"). Es solo un
--    dato de registro, no afecta el cálculo de stock ni ninguna otra
--    lógica existente.
-- 2. crear_movimiento_material() suma un parámetro nuevo p_origen (al
--    final, con default null) para no romper nada de lo que ya depende de
--    la firma anterior.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 073.

alter table movimientos_material add column if not exists origen text;

drop function if exists crear_movimiento_material(uuid, text, date, jsonb, text);

create or replace function crear_movimiento_material(
  p_obra_id uuid,
  p_tipo text,
  p_fecha date,
  p_items jsonb,
  p_firma_imagen text,
  p_origen text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_movimiento_id uuid;
  v_item jsonb;
  v_descripcion text;
  v_categoria text;
  v_cantidad numeric;
  v_saldo_actual numeric;
begin
  select role into v_rol from profiles where id = auth.uid();
  if v_rol not in ('administrador', 'compras', 'administracion') then
    raise exception 'No tenés permiso para cargar movimientos de materiales/herramientas';
  end if;

  if p_tipo not in ('ingreso', 'salida') then
    raise exception 'Tipo de movimiento inválido';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un ítem';
  end if;

  -- Bloquea la obra ANTES de revisar nada: si hay dos salidas al mismo
  -- tiempo, la segunda espera a que la primera termine (y ya haya
  -- descontado su cantidad) antes de mirar el saldo — así no pueden las
  -- dos creer que hay stock disponible cuando en conjunto no alcanza.
  perform 1 from obras where id = p_obra_id for update;
  if not found then
    raise exception 'La obra no existe';
  end if;

  insert into movimientos_material (obra_id, tipo, fecha, firma_imagen, origen, creado_por, creado_por_email)
  values (
    p_obra_id, p_tipo, p_fecha, p_firma_imagen, p_origen,
    auth.uid(),
    (select email from profiles where id = auth.uid())
  )
  returning id into v_movimiento_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_descripcion := btrim(v_item->>'descripcion');
    v_categoria := v_item->>'categoria';
    v_cantidad := (v_item->>'cantidad')::numeric;

    if v_descripcion is null or v_descripcion = '' then
      raise exception 'Falta la descripción de un ítem';
    end if;
    if v_categoria not in ('material', 'herramienta') then
      raise exception 'Categoría inválida para "%"', v_descripcion;
    end if;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida para "%"', v_descripcion;
    end if;

    if p_tipo = 'salida' then
      select coalesce(saldo, 0) into v_saldo_actual
      from stock_obra
      where obra_id = p_obra_id and descripcion_normalizada = lower(v_descripcion);

      if coalesce(v_saldo_actual, 0) < v_cantidad then
        raise exception 'No hay suficiente stock de "%" en esta obra (disponible: %, pedido: %)',
          v_descripcion, coalesce(v_saldo_actual, 0), v_cantidad;
      end if;
    end if;

    insert into movimientos_material_items (movimiento_id, descripcion, categoria, cantidad)
    values (v_movimiento_id, v_descripcion, v_categoria, v_cantidad);
  end loop;

  return v_movimiento_id;
end;
$$;

grant execute on function crear_movimiento_material(uuid, text, date, jsonb, text, text) to authenticated;
revoke execute on function crear_movimiento_material(uuid, text, date, jsonb, text, text) from anon;

-- Verificación: tiene que devolver 0 filas, sin error.
select id, origen from movimientos_material limit 0;
