-- Módulo: OT cumplida bloqueada (PASO 2 de varios)
-- Qué hace este script:
-- 1. marcar_estado_ot: si la OT ya está "cumplida" y quien llama no es
--    administrador, rechaza el cambio con un mensaje claro. Administrador
--    puede seguir cambiando el estado de cualquier OT, incluidas las
--    cumplidas (reabrirlas).
-- 2. Política de "update" de ordenes_trabajo: hoy Jefe de obra puede
--    actualizar cualquier campo de una OT con un update directo (por
--    ejemplo, al reasignar responsable o hito) — ese camino no pasa por
--    marcar_estado_ot, así que había que cerrarlo también ahí. A partir de
--    ahora, si la OT está "cumplida", Jefe de obra no la puede tocar por
--    ningún campo — solo administrador.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 036.

create or replace function marcar_estado_ot(
  p_ot_id uuid,
  p_estado text,
  p_motivo_incumplimiento text default null,
  p_motivo_detalle text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_estado_actual text;
begin
  select role into v_rol from profiles where id = auth.uid();

  if v_rol not in ('administrador', 'capataz', 'jefe_obra') then
    raise exception 'No tenés permiso para cambiar el estado de una orden de trabajo';
  end if;

  select estado into v_estado_actual from ordenes_trabajo where id = p_ot_id;

  if not found then
    raise exception 'La orden de trabajo % no existe', p_ot_id;
  end if;

  if v_estado_actual = 'cumplida' and v_rol <> 'administrador' then
    raise exception 'Esta OT ya está cumplida y cerrada. Solo un administrador puede reabrirla o cambiar su estado — pedíselo por fuera del sistema.';
  end if;

  update ordenes_trabajo
  set
    estado = p_estado,
    motivo_incumplimiento = case
      when p_estado = 'no_cumplida' then p_motivo_incumplimiento
      else null
    end,
    motivo_detalle = case
      when p_estado = 'no_cumplida' and p_motivo_incumplimiento = 'otro' then p_motivo_detalle
      else null
    end
  where id = p_ot_id;
end;
$$;

drop policy if exists "ot_update" on ordenes_trabajo;
create policy "ot_update" on ordenes_trabajo
  for update to authenticated
  using (is_admin() or (puede_gestionar_obras() and estado <> 'cumplida'))
  with check (is_admin() or puede_gestionar_obras());
