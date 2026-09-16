-- Módulo: Rendiciones — registro de gastos por obra (PASO 1 de varios)
-- Qué hace este script:
-- 1. Crea "categorias_gasto": catálogo configurable (Materiales, Flete,
--    Comida, Herramienta, Otro), misma seguridad y mismo patrón que
--    tipos_tarea/tipos_obra — agregar una categoría el día de mañana es
--    una fila nueva acá, no una migración.
-- 2. Crea "gastos": un gasto = una obra + monto + proveedor + fecha +
--    categoría + forma de pago + foto de factura opcional. Por ahora es
--    solo registro, sin circuito de aprobación — si el día de mañana se
--    agrega uno, se hace sumando una columna de estado encima de esto
--    (como se hizo con las OT), sin romper nada de lo que hay acá.
--    "forma_pago" NO es un catálogo (a diferencia de categoría): son 4
--    opciones fijas, por eso va con un check en vez de una tabla aparte.
-- 3. La foto de factura es UNA sola por gasto (a diferencia de las fotos
--    de Trabajo Diario, que son varias) — por eso es una columna
--    ("foto_ruta") en la misma fila del gasto, no una tabla aparte. Se
--    guarda en el MISMO bucket privado que ya usamos para archivos de obra
--    ("obras-archivos"), en <obra_id>/gastos/<gasto_id>/... Como el primer
--    tramo de la ruta sigue siendo el id de la obra, las políticas de
--    Storage de 029 aplican tal cual y no hace falta tocar nada — incluso
--    los roles ya coinciden: puede_gestionar_archivos_obra() (029) es
--    administrador+jefe_obra+capataz, el mismo grupo que carga acá.
-- 4. Igual que en Trabajo Diario, el "id" del gasto lo puede generar el
--    celular (no la base) y "fecha" (el día del gasto) queda separada de
--    "created_at" (cuándo llegó al servidor) — no hace falta hoy, pero
--    deja el camino allanado si el día de mañana se agrega carga sin
--    señal a este módulo también.
--
-- Permisos: se reutiliza puede_registrar_asistencia() (administrador,
-- capataz y jefe_obra) para cargar — es el mismo grupo que ya carga desde
-- la obra en Parte de asistencia y Trabajo Diario. Ver los gastos y el
-- total: puede_ver_obras() (los 5 roles que ven Obras, incluye
-- administración y consulta de solo lectura). Corregir o borrar un gasto:
-- el autor el suyo, administrador cualquiera — sin auditoría, como
-- Trabajo Diario, porque todavía no hay circuito de aprobación.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 043.

-- =========================================================================
-- 1. Catálogo de categorías
-- =========================================================================

create table categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table categorias_gasto enable row level security;

create policy "categorias_gasto_select" on categorias_gasto
  for select to authenticated using (puede_ver_obras());

create policy "categorias_gasto_insert" on categorias_gasto
  for insert to authenticated with check (puede_gestionar_obras());

create policy "categorias_gasto_update" on categorias_gasto
  for update to authenticated using (puede_gestionar_obras()) with check (puede_gestionar_obras());

create policy "categorias_gasto_delete" on categorias_gasto
  for delete to authenticated using (puede_gestionar_obras());

revoke all on categorias_gasto from anon;

insert into categorias_gasto (nombre) values
  ('Materiales'),
  ('Flete'),
  ('Comida'),
  ('Herramienta'),
  ('Otro');

-- =========================================================================
-- 2. Gastos
-- =========================================================================

create table gastos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  monto numeric(12, 2) not null check (monto > 0),
  proveedor text not null check (length(btrim(proveedor)) > 0),
  fecha date not null,
  categoria_id uuid not null references categorias_gasto(id),
  forma_pago text not null
    check (forma_pago in ('efectivo', 'transferencia', 'tarjeta', 'cuenta_corriente')),
  foto_ruta text unique,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now()
);

-- La lista de gastos de una obra siempre se pide igual: de la fecha más
-- nueva a la más vieja. Este índice es exactamente esa consulta.
create index gastos_obra_fecha_idx
  on gastos (obra_id, fecha desc, created_at desc);

alter table gastos enable row level security;

revoke all on gastos from anon;

create policy "gastos_select" on gastos
  for select to authenticated using (puede_ver_obras());

create policy "gastos_insert" on gastos
  for insert to authenticated with check (puede_registrar_asistencia());

create policy "gastos_update" on gastos
  for update to authenticated
  using (is_admin() or (puede_registrar_asistencia() and creado_por = auth.uid()))
  with check (is_admin() or (puede_registrar_asistencia() and creado_por = auth.uid()));

create policy "gastos_delete" on gastos
  for delete to authenticated
  using (is_admin() or (puede_registrar_asistencia() and creado_por = auth.uid()));

-- =========================================================================
-- 3. Quién cargó el gasto — lo pone la base, no el celular
-- =========================================================================

create or replace function set_autor_gasto()
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

drop trigger if exists gastos_autor on gastos;
create trigger gastos_autor
  before insert on gastos
  for each row execute function set_autor_gasto();

-- Verificación: tiene que devolver las 5 categorías cargadas, y la
-- consulta de gastos tiene que devolver 0 filas sin error.
select * from categorias_gasto order by nombre;
select * from gastos;
