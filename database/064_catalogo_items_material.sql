-- Módulo: Catálogo de ítems (autocompletar) para Ingresos/salidas de
-- material y herramientas
-- Lista de sugerencias que se arma sola con el uso — NO es un catálogo
-- obligatorio: no tiene ningún vínculo (FK) con movimientos_material_items,
-- que sigue guardando su propio texto libre exactamente igual que antes
-- (063). Esto es 100% aditivo: si esta tabla no existiera o fallara, la
-- carga a mano de un ítem nuevo sigue funcionando igual, porque el campo
-- de descripción de un movimiento nunca dependió de esta tabla.
--
-- Qué hace este script:
-- 1. "items_material_catalogo": descripción + categoría. La columna
--    "descripcion_normalizada" (generada sola: minúsculas + sin espacios
--    de más) tiene una restricción UNIQUE — así "Taladro Bosch" y
--    "taladro bosch " nunca generan dos filas: cargarlo de nuevo con un
--    upsert "si ya existe, no hagas nada" conserva la categoría que se
--    usó la primera vez.
-- 2. Permisos: se reutilizan puede_ver_movimientos_material() /
--    puede_gestionar_movimientos_material() (063) — mismo público de
--    siempre, sin funciones nuevas. A diferencia de movimientos_material,
--    esta tabla SÍ tiene políticas de insert/update/delete directas (no
--    hace falta una función que valide nada delicado — es solo una lista
--    de sugerencias, no mueve stock ni plata), para poder además
--    renombrar o borrar una entrada a mano desde la pantalla de limpieza.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 063.

create table items_material_catalogo (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null check (length(btrim(descripcion)) > 0),
  descripcion_normalizada text generated always as (lower(btrim(descripcion))) stored,
  categoria text not null check (categoria in ('material', 'herramienta')),
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  unique (descripcion_normalizada)
);

alter table items_material_catalogo enable row level security;
revoke all on items_material_catalogo from anon;

create policy "items_material_catalogo_select" on items_material_catalogo
  for select to authenticated using (puede_ver_movimientos_material());

create policy "items_material_catalogo_insert" on items_material_catalogo
  for insert to authenticated with check (puede_gestionar_movimientos_material());

create policy "items_material_catalogo_update" on items_material_catalogo
  for update to authenticated
  using (puede_gestionar_movimientos_material())
  with check (puede_gestionar_movimientos_material());

create policy "items_material_catalogo_delete" on items_material_catalogo
  for delete to authenticated using (puede_gestionar_movimientos_material());

create or replace function set_autor_item_material_catalogo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.creado_por := auth.uid();
  new.creado_por_email := (select email from profiles where id = auth.uid());
  return new;
end;
$$;

drop trigger if exists items_material_catalogo_autor on items_material_catalogo;
create trigger items_material_catalogo_autor
  before insert on items_material_catalogo
  for each row execute function set_autor_item_material_catalogo();

-- Verificación: tiene que devolver 0 filas sin error.
select * from items_material_catalogo;
