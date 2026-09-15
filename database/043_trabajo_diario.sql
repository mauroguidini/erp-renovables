-- Módulo: Trabajo Diario (bitácora de obra)
-- Qué hace este script:
-- 1. Crea "trabajo_diario": una fila por ENTRADA (no por día). A diferencia
--    del parte de asistencia, que tiene un único parte por obra y fecha,
--    acá el capataz puede cargar tres entradas el mismo día y el jefe de
--    obra una cuarta — por eso NO hay unique (obra_id, fecha).
--    Es un registro libre: no tiene estados, ni vencimiento, ni cierre.
-- 2. Crea "trabajo_diario_fotos": la lista de fotos de cada entrada. Los
--    archivos en sí van al MISMO bucket privado que ya usamos
--    ("obras-archivos"), en <obra_id>/trabajo-diario/<entrada_id>/... Como
--    el primer tramo de la ruta sigue siendo el id de la obra, las
--    políticas de Storage de 029 aplican tal cual y no hay que tocar nada.
--    La tabla existe para poder traer TODAS las fotos de la bitácora en una
--    sola consulta: sin ella habría que preguntarle a Storage una vez por
--    cada entrada de la lista, y con cientos de entradas eso se arrastra.
--    (En la evidencia de OT no hizo falta porque se mira una OT por vez.)
-- 3. Un trigger completa solo quién cargó la entrada (creado_por /
--    creado_por_email), para que no dependa de lo que mande el celular.
--
-- Dos detalles pensados para la carga sin señal, que va a venir después.
-- No hacen falta hoy, pero evitan tener que rehacer la tabla más adelante:
--   - "fecha" (el día que se hizo el trabajo, lo elige quien carga) y
--     "created_at" (cuándo llegó al servidor) son columnas DISTINTAS. El
--     capataz carga el martes en la obra y sincroniza el jueves: la entrada
--     se sigue leyendo en el martes, que es donde va.
--   - El "id" lo puede generar el celular en vez de la base. Si el teléfono
--     sincroniza, se corta a la mitad y reintenta, manda la misma entrada
--     con el mismo id y la base la reconoce en lugar de duplicarla.
--
-- Permisos: se reutiliza puede_registrar_asistencia() (administrador,
-- capataz y jefe_obra), que ya existe desde el script 039 — es exactamente
-- el grupo que tiene que poder cargar la bitácora, así que no hace falta
-- una función nueva. Corregir o borrar una entrada: el autor la suya, el
-- administrador cualquiera. Sin historial de auditoría, porque es un
-- registro libre y no un documento controlado como el parte o una OT.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 042.

-- =========================================================================
-- 1. Tablas
-- =========================================================================

create table trabajo_diario (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  fecha date not null,
  descripcion text not null check (length(btrim(descripcion)) > 0),
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now()
);

-- La bitácora siempre se lee igual: una obra, de la fecha más nueva a la
-- más vieja. Este índice es exactamente esa consulta.
create index trabajo_diario_obra_fecha_idx
  on trabajo_diario (obra_id, fecha desc, created_at desc);

create table trabajo_diario_fotos (
  id uuid primary key default gen_random_uuid(),
  entrada_id uuid not null references trabajo_diario(id) on delete cascade,
  ruta text not null unique,
  created_at timestamptz not null default now()
);

create index trabajo_diario_fotos_entrada_idx on trabajo_diario_fotos (entrada_id);

alter table trabajo_diario enable row level security;
alter table trabajo_diario_fotos enable row level security;

revoke all on trabajo_diario from anon;
revoke all on trabajo_diario_fotos from anon;

-- =========================================================================
-- 2. Quién cargó la entrada — lo pone la base, no el celular
-- =========================================================================

create or replace function set_autor_trabajo_diario()
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

drop trigger if exists trabajo_diario_autor on trabajo_diario;
create trigger trabajo_diario_autor
  before insert on trabajo_diario
  for each row execute function set_autor_trabajo_diario();

-- =========================================================================
-- 3. Permisos
-- =========================================================================

-- Ver: los mismos roles que ven el resto de la obra (incluye consulta,
-- que es de solo lectura).
create policy "trabajo_diario_select" on trabajo_diario
  for select to authenticated using (puede_ver_obras());

create policy "trabajo_diario_insert" on trabajo_diario
  for insert to authenticated with check (puede_registrar_asistencia());

-- Corregir / borrar: el autor lo suyo, el administrador cualquier entrada.
create policy "trabajo_diario_update" on trabajo_diario
  for update to authenticated
  using (is_admin() or (puede_registrar_asistencia() and creado_por = auth.uid()))
  with check (is_admin() or (puede_registrar_asistencia() and creado_por = auth.uid()));

create policy "trabajo_diario_delete" on trabajo_diario
  for delete to authenticated
  using (is_admin() or (puede_registrar_asistencia() and creado_por = auth.uid()));

-- Las fotos siguen a su entrada: quien puede tocar la entrada puede
-- agregarle o sacarle fotos.
create policy "trabajo_diario_fotos_select" on trabajo_diario_fotos
  for select to authenticated using (puede_ver_obras());

create policy "trabajo_diario_fotos_insert" on trabajo_diario_fotos
  for insert to authenticated
  with check (
    exists (
      select 1 from trabajo_diario t
      where t.id = trabajo_diario_fotos.entrada_id
        and (is_admin() or (puede_registrar_asistencia() and t.creado_por = auth.uid()))
    )
  );

create policy "trabajo_diario_fotos_delete" on trabajo_diario_fotos
  for delete to authenticated
  using (
    exists (
      select 1 from trabajo_diario t
      where t.id = trabajo_diario_fotos.entrada_id
        and (is_admin() or (puede_registrar_asistencia() and t.creado_por = auth.uid()))
    )
  );

-- Verificación: tiene que devolver 0 filas, sin error.
select * from trabajo_diario;
