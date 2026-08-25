-- Módulo: Eliminar/Archivar obra (PASO 1 de varios)
-- Qué hace este script:
-- 1. Agrega "archivada" a obras (default false) — la alternativa segura y
--    reversible al borrado permanente.
-- 2. Endurece la política de borrado de "obras": hoy permitía también a
--    jefe_obra (aunque nunca hubo botón para usarla). Pasa a ser
--    exclusiva de administrador, para que el borrado permanente esté
--    cerrado también a nivel de base de datos, no solo oculto en la
--    pantalla.
-- 3. Crea eliminar_obra_definitivamente(obra_id): la única forma de borrar
--    una obra de verdad. Chequea que quien llama sea administrador, y
--    borra en orden: remitos de esa obra (sus ítems se van solos por
--    cascade), movimientos de stock y stock del depósito propio de la
--    obra, la obra en sí (esto arrastra solas sus OT y sus hitos, que ya
--    tenían "on delete cascade"), y por último ese depósito propio.
--    No toca los archivos del Storage — esos los borra el frontend
--    después, y si algo falla ahí, hay que avisar bien claro qué quedó
--    sin borrar (eso lo resuelve el código de la pantalla, no esta
--    función).
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 033.

alter table obras
  add column if not exists archivada boolean not null default false;

drop policy if exists "obras_delete" on obras;
create policy "obras_delete" on obras
  for delete to authenticated using (is_admin());

create or replace function eliminar_obra_definitivamente(p_obra_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposito_id uuid;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede eliminar una obra de forma permanente';
  end if;

  select deposito_id into v_deposito_id from obras where id = p_obra_id;

  if not found then
    raise exception 'La obra % no existe', p_obra_id;
  end if;

  delete from remitos where obra_id = p_obra_id;

  if v_deposito_id is not null then
    delete from movimientos_stock
    where deposito_origen_id = v_deposito_id or deposito_destino_id = v_deposito_id;

    delete from stock where deposito_id = v_deposito_id;
  end if;

  delete from obras where id = p_obra_id;

  if v_deposito_id is not null then
    delete from depositos where id = v_deposito_id;
  end if;
end;
$$;

grant execute on function eliminar_obra_definitivamente(uuid) to authenticated;
revoke execute on function eliminar_obra_definitivamente(uuid) from anon;
