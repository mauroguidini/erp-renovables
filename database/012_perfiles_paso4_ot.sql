-- Módulo: Seguridad — Perfiles y roles (PASO 4 de varios)
-- Qué hace este script: en "ordenes_trabajo", separa LEER (los dos roles) de
-- CREAR/EDITAR TODO/BORRAR (solo administrador). Como Capataz sí necesita
-- poder marcar estado + motivo, se crea una función controlada
-- "marcar_estado_ot" que es la ÚNICA forma de tocar esos dos campos — ni
-- Capataz ni nadie puede editar la descripción, el responsable, la fecha o
-- el tipo de una OT por ese camino, porque no es un "editar libre", es una
-- función que solo sabe hacer esa cosa puntual.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 011.

drop policy if exists "authenticated_all" on ordenes_trabajo;

create policy "ot_select_todos" on ordenes_trabajo
  for select to authenticated using (true);

create policy "ot_insert_admin" on ordenes_trabajo
  for insert to authenticated with check (is_admin());

create policy "ot_update_admin" on ordenes_trabajo
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "ot_delete_admin" on ordenes_trabajo
  for delete to authenticated using (is_admin());

-- "security definer" hace que esta función pueda actualizar la fila aunque
-- quien la llame sea Capataz (que ya no tiene permiso de "update" directo
-- sobre la tabla, según la política de arriba).
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
begin
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

  if not found then
    raise exception 'La orden de trabajo % no existe', p_ot_id;
  end if;
end;
$$;

grant execute on function marcar_estado_ot(uuid, text, text, text) to authenticated;
revoke execute on function marcar_estado_ot(uuid, text, text, text) from anon;
