-- Módulo: Máquinas (parque de maquinarias, camiones, grúas y fletes) +
-- costeo interno hacia las obras
-- Qué hace este script:
-- 1. "maquinas": el parque, carga manual (nombre, tipo, activa/inactiva —
--    se desactiva, no se borra, para no perder el historial de uso que
--    quedó atado a ella).
-- 2. "maquina_componentes_costo": los ítems editables de la tarifa por hora
--    (amortización, mantenimiento, seguro...). La tarifa NO se guarda como
--    campo fijo: la vista "maquinas_con_tarifa" la calcula sumando estos
--    componentes al vuelo (mismo mecanismo que ya usa "stock_obra" para el
--    saldo de depósito) — editar/agregar/quitar un componente actualiza la
--    tarifa en todos lados sin trigger que sincronizar.
-- 3. "maquina_costos_reales": gastos reales de cada máquina (repuestos,
--    combustible, arreglos), para comparar contra lo "facturado" a obras.
-- 4. "maquina_movimientos": LA doble anotación, en una sola tabla en vez de
--    dos — una fila por uso, leída desde dos ángulos: costo de la obra
--    (sum por obra_id) e ingreso de la máquina (sum por maquina_id). Así no
--    hay forma de que un lado quede desincronizado del otro, porque son la
--    misma columna. El monto queda SIEMPRE congelado al momento de
--    cargarlo (horas × tarifa vigente ese día, o el monto directo si es un
--    flete) — si más adelante cambiás un componente de costo, la tarifa
--    nueva no reescribe costos históricos ya cargados. Se crea solo a
--    través de dos funciones (registrar_uso_maquina / registrar_flete),
--    nunca con un insert directo.
-- 5. Es contabilidad INTERNA de análisis (no plata real): no toca ni se
--    conecta con Caja, Facturas, Órdenes de pago ni ningún módulo de plata
--    real. Tampoco toca ninguna tabla existente — todo son tablas nuevas
--    que solo referencian obras(id) igual que ya hacen ordenes_trabajo,
--    hitos, certificaciones, etc.
--
-- Permisos:
-- - Gestionar el parque (alta de máquinas, componentes de costo, costos
--   reales): administrador + administracion.
-- - Ver el parque y sus tarifas (para poder elegir máquina al registrar
--   uso): administrador + administracion + jefe_obra.
-- - Ver costos reales y el análisis de rentabilidad: administrador +
--   administracion únicamente (jefe_obra no ve el detalle financiero).
-- - Registrar uso de una máquina/flete en una obra: administrador +
--   jefe_obra.
-- - Corregir o borrar un movimiento cargado mal: solo administrador (no es
--   plata real, así que se permite corregir — distinto criterio del de
--   Caja/Movimientos de material, que son inmutables).
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 072.

-- =========================================================================
-- 1. Permisos
-- =========================================================================

create or replace function puede_gestionar_maquinas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'administracion')
  );
$$;

create or replace function puede_ver_maquinas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'administracion', 'jefe_obra')
  );
$$;

grant execute on function puede_gestionar_maquinas() to authenticated;
grant execute on function puede_ver_maquinas() to authenticated;

-- =========================================================================
-- 2. Parque de máquinas
-- =========================================================================

create table if not exists maquinas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) > 0),
  tipo text not null check (tipo in ('maquina', 'camion', 'grua', 'flete')),
  activa boolean not null default true,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now()
);

alter table maquinas enable row level security;
revoke all on maquinas from anon;

drop policy if exists "maquinas_select" on maquinas;
create policy "maquinas_select" on maquinas
  for select to authenticated using (puede_ver_maquinas());

drop policy if exists "maquinas_insert" on maquinas;
create policy "maquinas_insert" on maquinas
  for insert to authenticated with check (puede_gestionar_maquinas());

drop policy if exists "maquinas_update" on maquinas;
create policy "maquinas_update" on maquinas
  for update to authenticated using (puede_gestionar_maquinas()) with check (puede_gestionar_maquinas());

create or replace function set_autor_maquina()
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

drop trigger if exists maquinas_autor on maquinas;
create trigger maquinas_autor
  before insert on maquinas
  for each row execute function set_autor_maquina();

-- =========================================================================
-- 3. Componentes de costo por hora (arman la tarifa)
-- =========================================================================

create table if not exists maquina_componentes_costo (
  id uuid primary key default gen_random_uuid(),
  maquina_id uuid not null references maquinas(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  monto_por_hora numeric(12, 2) not null check (monto_por_hora >= 0),
  created_at timestamptz not null default now()
);

create index if not exists maquina_componentes_costo_maquina_idx on maquina_componentes_costo (maquina_id);

alter table maquina_componentes_costo enable row level security;
revoke all on maquina_componentes_costo from anon;

-- Lectura junto con puede_ver_maquinas() (no solo gestionar): la vista de
-- tarifa (más abajo) hace join contra esta tabla con security_invoker, así
-- que si jefe_obra no pudiera leerla, la tarifa le daría 0 al elegir
-- máquina para registrar un uso.
drop policy if exists "maquina_componentes_costo_select" on maquina_componentes_costo;
create policy "maquina_componentes_costo_select" on maquina_componentes_costo
  for select to authenticated using (puede_ver_maquinas());

drop policy if exists "maquina_componentes_costo_insert" on maquina_componentes_costo;
create policy "maquina_componentes_costo_insert" on maquina_componentes_costo
  for insert to authenticated with check (puede_gestionar_maquinas());

drop policy if exists "maquina_componentes_costo_update" on maquina_componentes_costo;
create policy "maquina_componentes_costo_update" on maquina_componentes_costo
  for update to authenticated using (puede_gestionar_maquinas()) with check (puede_gestionar_maquinas());

drop policy if exists "maquina_componentes_costo_delete" on maquina_componentes_costo;
create policy "maquina_componentes_costo_delete" on maquina_componentes_costo
  for delete to authenticated using (puede_gestionar_maquinas());

-- Tarifa por hora = suma de los componentes, calculada al vuelo. No hay
-- campo "tarifa_hora" guardado en ningún lado.
create or replace view maquinas_con_tarifa
with (security_invoker = true)
as
select
  m.*,
  coalesce(sum(c.monto_por_hora), 0) as tarifa_hora
from maquinas m
left join maquina_componentes_costo c on c.maquina_id = m.id
group by m.id;

grant select on maquinas_con_tarifa to authenticated;
revoke all on maquinas_con_tarifa from anon;

-- =========================================================================
-- 4. Costos reales de cada máquina
-- =========================================================================

create table if not exists maquina_costos_reales (
  id uuid primary key default gen_random_uuid(),
  maquina_id uuid not null references maquinas(id) on delete cascade,
  fecha date not null,
  monto numeric(12, 2) not null check (monto > 0),
  descripcion text,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now()
);

create index if not exists maquina_costos_reales_maquina_idx on maquina_costos_reales (maquina_id, fecha desc);

alter table maquina_costos_reales enable row level security;
revoke all on maquina_costos_reales from anon;

-- Solo quien gestiona el parque ve el detalle de gastos reales (más
-- financiero que la tarifa) — jefe_obra no.
drop policy if exists "maquina_costos_reales_select" on maquina_costos_reales;
create policy "maquina_costos_reales_select" on maquina_costos_reales
  for select to authenticated using (puede_gestionar_maquinas());

drop policy if exists "maquina_costos_reales_insert" on maquina_costos_reales;
create policy "maquina_costos_reales_insert" on maquina_costos_reales
  for insert to authenticated with check (puede_gestionar_maquinas());

drop policy if exists "maquina_costos_reales_update" on maquina_costos_reales;
create policy "maquina_costos_reales_update" on maquina_costos_reales
  for update to authenticated using (puede_gestionar_maquinas()) with check (puede_gestionar_maquinas());

drop policy if exists "maquina_costos_reales_delete" on maquina_costos_reales;
create policy "maquina_costos_reales_delete" on maquina_costos_reales
  for delete to authenticated using (puede_gestionar_maquinas());

create or replace function set_autor_costo_real_maquina()
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

drop trigger if exists maquina_costos_reales_autor on maquina_costos_reales;
create trigger maquina_costos_reales_autor
  before insert on maquina_costos_reales
  for each row execute function set_autor_costo_real_maquina();

-- =========================================================================
-- 5. La doble anotación: costo de obra = ingreso de máquina
-- =========================================================================

create table if not exists maquina_movimientos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  maquina_id uuid not null references maquinas(id),
  fecha date not null,
  horas numeric(10, 2) check (horas > 0),
  tarifa_hora_usada numeric(12, 2),
  monto numeric(12, 2) not null check (monto >= 0),
  descripcion text,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now(),
  -- O es un uso por horas (horas + tarifa cargados los dos) o es un flete
  -- (monto directo, los dos en null) — nunca una mezcla de los dos.
  check ((horas is null) = (tarifa_hora_usada is null))
);

create index if not exists maquina_movimientos_obra_idx on maquina_movimientos (obra_id, fecha desc);
create index if not exists maquina_movimientos_maquina_idx on maquina_movimientos (maquina_id, fecha desc);

alter table maquina_movimientos enable row level security;
revoke all on maquina_movimientos from anon;

drop policy if exists "maquina_movimientos_select" on maquina_movimientos;
create policy "maquina_movimientos_select" on maquina_movimientos
  for select to authenticated using (puede_ver_maquinas());

-- A propósito NO hay política de insert: se crean SOLO a través de
-- registrar_uso_maquina() / registrar_flete() (más abajo), para que el
-- monto quede siempre calculado y congelado correctamente en el servidor.
drop policy if exists "maquina_movimientos_update" on maquina_movimientos;
create policy "maquina_movimientos_update" on maquina_movimientos
  for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "maquina_movimientos_delete" on maquina_movimientos;
create policy "maquina_movimientos_delete" on maquina_movimientos
  for delete to authenticated using (is_admin());

create or replace function registrar_uso_maquina(
  p_obra_id uuid,
  p_maquina_id uuid,
  p_horas numeric,
  p_fecha date,
  p_descripcion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_tipo text;
  v_tarifa numeric;
begin
  select role into v_rol from profiles where id = auth.uid();

  if v_rol not in ('administrador', 'jefe_obra') then
    raise exception 'No tenés permiso para registrar el uso de una máquina';
  end if;

  if p_horas is null or p_horas <= 0 then
    raise exception 'Las horas tienen que ser mayores a 0';
  end if;

  select tipo, tarifa_hora into v_tipo, v_tarifa
  from maquinas_con_tarifa where id = p_maquina_id;

  if not found then
    raise exception 'La máquina % no existe', p_maquina_id;
  end if;

  if v_tipo = 'flete' then
    raise exception 'Esta máquina es de tipo flete: usá "Registrar flete" en vez de cargar horas';
  end if;

  insert into maquina_movimientos
    (obra_id, maquina_id, fecha, horas, tarifa_hora_usada, monto, descripcion, creado_por, creado_por_email)
  values (
    p_obra_id,
    p_maquina_id,
    p_fecha,
    p_horas,
    v_tarifa,
    p_horas * v_tarifa,
    p_descripcion,
    auth.uid(),
    (select email from profiles where id = auth.uid())
  );
end;
$$;

create or replace function registrar_flete(
  p_obra_id uuid,
  p_maquina_id uuid,
  p_monto numeric,
  p_fecha date,
  p_descripcion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_tipo text;
begin
  select role into v_rol from profiles where id = auth.uid();

  if v_rol not in ('administrador', 'jefe_obra') then
    raise exception 'No tenés permiso para registrar un flete';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a 0';
  end if;

  select tipo into v_tipo from maquinas where id = p_maquina_id;

  if not found then
    raise exception 'La máquina % no existe', p_maquina_id;
  end if;

  if v_tipo <> 'flete' then
    raise exception 'Esta máquina no es de tipo flete: usá "Registrar uso" con horas en vez de un monto directo';
  end if;

  insert into maquina_movimientos
    (obra_id, maquina_id, fecha, horas, tarifa_hora_usada, monto, descripcion, creado_por, creado_por_email)
  values (p_obra_id, p_maquina_id, p_fecha, null, null, p_monto, p_descripcion, auth.uid(),
    (select email from profiles where id = auth.uid()));
end;
$$;

grant execute on function registrar_uso_maquina(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function registrar_flete(uuid, uuid, numeric, date, text) to authenticated;
revoke execute on function registrar_uso_maquina(uuid, uuid, numeric, date, text) from anon;
revoke execute on function registrar_flete(uuid, uuid, numeric, date, text) from anon;

-- Verificación: tiene que devolver 0 filas, sin error.
select * from maquina_movimientos;
