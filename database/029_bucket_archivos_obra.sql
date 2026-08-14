-- Módulo: Archivos de obra (PASO 1 de varios)
-- Qué hace este script:
-- 1. Crea el bucket "obras-archivos" en Supabase Storage, marcado como
--    PRIVADO ("public = false") — sin esto no hace falta nada más, ya
--    queda cerrado a cualquiera de internet por defecto. Le pone además un
--    límite de 20 MB por archivo y solo permite PDF e imágenes comunes.
-- 2. Crea puede_gestionar_archivos_obra() — administrador, jefe_obra y
--    capataz (por decisión de Mauro: Capataz suele estar en el sitio y
--    puede querer subir una foto).
-- 3. Crea las políticas de seguridad sobre storage.objects (la tabla
--    interna donde Supabase guarda cada archivo), usando las MISMAS
--    funciones de rol que ya existen en el resto del sistema:
--    - Ver/descargar: puede_ver_obras() (los 4 roles que ven Obras).
--    - Subir: puede_gestionar_archivos_obra(), y además se valida que la
--      carpeta del archivo corresponda a una obra que realmente existe (los
--      archivos se guardan como "<id_de_la_obra>/nombre_archivo").
--    - Borrar: puede_gestionar_archivos_obra().
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 028.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'obras-archivos',
  'obras-archivos',
  false,
  20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create or replace function puede_gestionar_archivos_obra()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'jefe_obra', 'capataz')
  );
$$;

grant execute on function puede_gestionar_archivos_obra() to authenticated;

create policy "obras_archivos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'obras-archivos' and puede_ver_obras());

create policy "obras_archivos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'obras-archivos'
    and puede_gestionar_archivos_obra()
    and exists (
      select 1 from obras o where o.id::text = (storage.foldername(name))[1]
    )
  );

create policy "obras_archivos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'obras-archivos' and puede_gestionar_archivos_obra());

-- Verificación: tiene que devolver una fila mostrando el bucket recién
-- creado, con public = false.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'obras-archivos';
