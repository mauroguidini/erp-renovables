-- Módulo: Remitos con firma (PASO 1 de varios)
-- Qué hace este script: crea "remitos" (cabecera: obra, depósito de origen,
-- estado borrador/confirmado, y los datos de la firma) y "remito_items"
-- (líneas: producto + cantidad), igual de estructura que "compras" y
-- "compra_items". Todavía no mueve stock ni permite firmar — eso son los
-- pasos 2 y 3.
--
-- Seguridad:
-- - Ver remitos: los mismos roles que ya ven Obras/OT, más Compras.
-- - Crear un remito / agregar o quitar ítems: administrador, compras,
--   jefe_obra — y solo mientras el remito está en "borrador". Una vez
--   confirmado, los ítems quedan fijos (no se pueden agregar ni quitar).
-- - Nadie puede hacer un "update" directo de remitos por esta vía — pasar a
--   "confirmado" y firmar son acciones que van a tener su propia función
--   (pasos 2 y 3), no un update libre desde la app.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 022.

create table remitos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id),
  deposito_origen_id uuid not null references depositos(id),
  estado text not null default 'borrador' check (estado in ('borrador', 'confirmado')),
  motivo text,
  creado_por text not null default (auth.jwt() ->> 'email'),
  confirmed_at timestamptz,
  firmada boolean not null default false,
  firmante_nombre text,
  firma_imagen text,
  firmada_at timestamptz,
  created_at timestamptz not null default now()
);

create table remito_items (
  id uuid primary key default gen_random_uuid(),
  remito_id uuid not null references remitos(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric not null check (cantidad > 0),
  created_at timestamptz not null default now()
);

alter table remitos enable row level security;
alter table remito_items enable row level security;

create policy "remitos_select" on remitos
  for select to authenticated using (puede_ver_obras() or puede_entregar_material());

create policy "remitos_insert" on remitos
  for insert to authenticated with check (puede_entregar_material());

create policy "remitos_delete_borrador" on remitos
  for delete to authenticated using (puede_entregar_material() and estado = 'borrador');

create policy "remito_items_select" on remito_items
  for select to authenticated using (puede_ver_obras() or puede_entregar_material());

create policy "remito_items_insert" on remito_items
  for insert to authenticated with check (
    puede_entregar_material()
    and exists (
      select 1 from remitos r where r.id = remito_id and r.estado = 'borrador'
    )
  );

create policy "remito_items_delete" on remito_items
  for delete to authenticated using (
    puede_entregar_material()
    and exists (
      select 1 from remitos r where r.id = remito_id and r.estado = 'borrador'
    )
  );

revoke all on remitos, remito_items from anon;

-- Verificación: tiene que devolver una tabla vacía (0 filas), sin error.
select * from remitos;
