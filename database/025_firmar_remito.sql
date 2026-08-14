-- Módulo: Remitos con firma (PASO 3 de varios)
-- Qué hace este script: crea firmar_remito(remito_id, nombre de quien
-- firma, imagen de la firma). A diferencia de crear/confirmar un remito
-- (que son cosas de administrador/compras/jefe_obra), firmar también lo
-- puede hacer Capataz — por eso esta función tiene su propio chequeo de rol
-- adentro, en vez de reusar puede_entregar_material(). Exige que el remito
-- ya esté "confirmado": no tiene sentido firmar un borrador que todavía
-- podría cambiar.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 024.

create or replace function firmar_remito(
  p_remito_id uuid,
  p_firmante_nombre text,
  p_firma_imagen text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('administrador', 'compras', 'jefe_obra', 'capataz')
  ) then
    raise exception 'No tenés permiso para firmar un remito';
  end if;

  update remitos
  set
    firmada = true,
    firmante_nombre = p_firmante_nombre,
    firma_imagen = p_firma_imagen,
    firmada_at = now()
  where id = p_remito_id and estado = 'confirmado';

  if not found then
    raise exception 'El remito no existe o todavía no está confirmado';
  end if;
end;
$$;

grant execute on function firmar_remito(uuid, text, text) to authenticated;
revoke execute on function firmar_remito(uuid, text, text) from anon;
