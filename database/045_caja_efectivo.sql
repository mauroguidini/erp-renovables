-- Módulo: Caja de efectivo (PASO 1 de varios)
-- Registro interno de la empresa (sin fines fiscales ni contables). Es un
-- módulo aparte de Obras: NO se ve desde una obra puntual, es una caja
-- única de toda la empresa.
--
-- Qué hace este script:
-- 1. puede_ver_caja() / puede_gestionar_caja(): administrador y
--    administracion (el rol "administrativo" que ya existe en el sistema
--    desde 013_roles_ampliar — no hace falta un rol nuevo). Hoy los dos
--    conjuntos son iguales, pero van en DOS funciones separadas (mismo
--    criterio que puede_ver_obras/puede_gestionar_obras) para poder abrir
--    el día de mañana un rol que solo mire, sin tocar ninguna política ya
--    escrita.
-- 2. "caja_movimientos": una fila por movimiento (entrada o salida). Sobre
--    el SALDO: se calcula sumando movimientos, NO se guarda como un valor
--    aparte — así nunca puede desincronizarse de la realidad (no hay dos
--    fuentes de verdad que puedan quedar en conflicto). Con el volumen de
--    una caja chica esto es rapidísimo incluso con años de historial.
--    La ÚNICA excepción es el saldo que queda anotado en cada CIERRE (ver
--    punto 4): ese sí se guarda, a propósito, porque es una foto de un
--    momento pasado, no algo que se tenga que recalcular con datos de hoy.
-- 3. Los movimientos NO se editan ni se borran — y esto no es una regla de
--    la pantalla nada más: la tabla directamente NO tiene política de
--    UPDATE ni DELETE para nadie (ni siquiera administrador vía la app
--    normal). Un error se corrige con un movimiento NUEVO que compensa
--    (columna "ajusta_a_id", apuntando al que corrige), dejando el
--    original intacto y a la vista. Quién hizo el ajuste y cuándo son las
--    mismas columnas que ya tiene cualquier movimiento (creado_por /
--    creado_por_email / created_at) — no hace falta una tabla de
--    auditoría aparte, porque cada fila ya se autoregistra.
-- 4. "caja_cierres": cierre de un período (diario o semanal). Guarda el
--    saldo que el sistema esperaba a esa fecha (saldo_calculado, una foto
--    congelada — ver punto 2), el efectivo que el administrativo contó a
--    mano (efectivo_contado) y la diferencia entre los dos. La única forma
--    de crear un cierre es la función cerrar_caja() (abajo): valida que no
--    se pise con un cierre anterior, calcula el saldo esperado del lado
--    del servidor (nunca confía en un número que mande la pantalla), y
--    de paso marca qué movimientos quedaron dentro de ese período
--    (columna "cierre_id" en caja_movimientos).
-- 5. "Bloqueo" de un período ya cerrado: como los movimientos nunca se
--    editan, lo único que hay que impedir es que aparezca un movimiento
--    NUEVO con fecha vieja, de un período que ya se cerró y ya se contó.
--    Por eso la política de insert de caja_movimientos exige que la fecha
--    sea POSTERIOR al último cierre que exista. Un ajuste hecho hoy para
--    corregir algo de un período cerrado entra sin problema, porque su
--    propia fecha es la de hoy — el que queda sin tocar es el movimiento
--    original, que ya estaba dentro del período cerrado.
-- 6. Comprobante (foto, opcional): UNA sola por movimiento, igual que la
--    factura de Rendiciones — por eso es una columna ("comprobante_ruta"),
--    no una tabla aparte. Va a un bucket privado NUEVO ("caja-
--    comprobantes"), separado del de archivos de obra, porque la Caja no
--    depende de ninguna obra (el campo "obra" del movimiento es opcional
--    y todavía no se usa para nada — queda preparado para más adelante,
--    tal como pediste).
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 044.

-- =========================================================================
-- 1. Permisos
-- =========================================================================

create or replace function puede_ver_caja()
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

create or replace function puede_gestionar_caja()
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

grant execute on function puede_ver_caja() to authenticated;
grant execute on function puede_gestionar_caja() to authenticated;

-- =========================================================================
-- 2. Cierres (se crea antes que movimientos porque movimientos la referencia)
-- =========================================================================

create table caja_cierres (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('diario', 'semanal')),
  fecha_desde date not null,
  fecha_hasta date not null check (fecha_hasta >= fecha_desde),
  saldo_calculado numeric(12, 2) not null,
  efectivo_contado numeric(12, 2) not null,
  diferencia numeric(12, 2) not null,
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now()
);

alter table caja_cierres enable row level security;

revoke all on caja_cierres from anon;

create policy "caja_cierres_select" on caja_cierres
  for select to authenticated using (puede_ver_caja());

-- A propósito NO hay política de insert/update/delete para caja_cierres:
-- la única forma de crear un cierre es la función cerrar_caja() de más
-- abajo, que corre con privilegios propios y hace las validaciones antes
-- de insertar. Esto evita que alguien cierre un período sin pasar por esas
-- validaciones (por ejemplo, dos cierres que se pisen en fechas).

-- =========================================================================
-- 3. Movimientos
-- =========================================================================

create table caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo text not null check (tipo in ('entrada', 'salida')),
  monto numeric(12, 2) not null check (monto > 0),
  concepto text not null check (length(btrim(concepto)) > 0),
  obra_id uuid references obras(id) on delete set null,
  comprobante_ruta text unique,
  ajusta_a_id uuid references caja_movimientos(id) check (ajusta_a_id is distinct from id),
  cierre_id uuid references caja_cierres(id),
  creado_por uuid,
  creado_por_email text,
  created_at timestamptz not null default now()
);

-- La lista de movimientos siempre se pide igual: de la fecha más nueva a
-- la más vieja. Este índice es exactamente esa consulta. El segundo sirve
-- para cuando se abre el detalle de un cierre puntual y se listan solo los
-- movimientos que quedaron adentro.
create index caja_movimientos_fecha_idx on caja_movimientos (fecha desc, created_at desc);
create index caja_movimientos_cierre_idx on caja_movimientos (cierre_id);

alter table caja_movimientos enable row level security;

revoke all on caja_movimientos from anon;

create policy "caja_movimientos_select" on caja_movimientos
  for select to authenticated using (puede_ver_caja());

create policy "caja_movimientos_insert" on caja_movimientos
  for insert to authenticated
  with check (
    puede_gestionar_caja()
    and fecha > coalesce((select max(fecha_hasta) from caja_cierres), '0001-01-01'::date)
  );

-- A propósito NO hay política de update ni de delete para caja_movimientos:
-- ni administrador ni administracion pueden tocar un movimiento ya cargado
-- desde la aplicación normal, sin excepción. La única escritura posterior
-- que existe es la que hace cerrar_caja() para anotar a qué cierre quedó
-- asociado cada movimiento (columna cierre_id) — y esa función corre con
-- privilegios propios, no pasa por esta política.

-- Quién cargó el movimiento — lo pone la base, no el celular.
create or replace function set_autor_caja_movimiento()
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

drop trigger if exists caja_movimientos_autor on caja_movimientos;
create trigger caja_movimientos_autor
  before insert on caja_movimientos
  for each row execute function set_autor_caja_movimiento();

-- =========================================================================
-- 4. Saldo
-- =========================================================================

-- Suma movimientos con fecha hasta la que se pida (por defecto, hoy). OJO:
-- a propósito NO es "security definer" — corre con los permisos de quien
-- la llama, así que respeta las mismas políticas de RLS que el resto:
-- alguien sin puede_ver_caja() va a ver 0 filas y esta función le va a dar
-- 0, nunca el saldo real.
create or replace function calcular_saldo_caja(p_hasta date default current_date)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(case when tipo = 'entrada' then monto else -monto end), 0)
  from caja_movimientos
  where fecha <= p_hasta;
$$;

grant execute on function calcular_saldo_caja(date) to authenticated;

-- Saldo de HOY, listo para pedir con un simple select — sin repetir la
-- cuenta en el frontend cada vez.
create view caja_saldo as
select calcular_saldo_caja() as saldo;

grant select on caja_saldo to authenticated;
revoke all on caja_saldo from anon;

-- =========================================================================
-- 5. Cierre de caja
-- =========================================================================

create or replace function cerrar_caja(
  p_tipo text,
  p_fecha_desde date,
  p_fecha_hasta date,
  p_efectivo_contado numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_max_hasta date;
  v_saldo_calculado numeric;
  v_cierre_id uuid;
begin
  select role into v_rol from profiles where id = auth.uid();

  if v_rol not in ('administrador', 'administracion') then
    raise exception 'No tenés permiso para cerrar la caja';
  end if;

  if p_tipo not in ('diario', 'semanal') then
    raise exception 'El tipo de cierre tiene que ser "diario" o "semanal"';
  end if;

  if p_fecha_hasta < p_fecha_desde then
    raise exception 'La fecha hasta no puede ser anterior a la fecha desde';
  end if;

  if p_fecha_hasta > current_date then
    raise exception 'No se puede cerrar un período que todavía no terminó';
  end if;

  select max(fecha_hasta) into v_max_hasta from caja_cierres;

  if v_max_hasta is not null and p_fecha_desde <= v_max_hasta then
    raise exception 'Ya existe un cierre que llega hasta el %; el próximo cierre tiene que empezar después de esa fecha', v_max_hasta;
  end if;

  -- Se calcula del lado del servidor, nunca se confía en un número que
  -- mande la pantalla — así nadie puede cerrar la caja con un saldo
  -- "esperado" inventado.
  v_saldo_calculado := calcular_saldo_caja(p_fecha_hasta);

  insert into caja_cierres (
    tipo, fecha_desde, fecha_hasta, saldo_calculado, efectivo_contado, diferencia,
    creado_por, creado_por_email
  )
  values (
    p_tipo, p_fecha_desde, p_fecha_hasta, v_saldo_calculado, p_efectivo_contado,
    p_efectivo_contado - v_saldo_calculado,
    auth.uid(), (select email from profiles where id = auth.uid())
  )
  returning id into v_cierre_id;

  update caja_movimientos
  set cierre_id = v_cierre_id
  where fecha between p_fecha_desde and p_fecha_hasta
    and cierre_id is null;

  return v_cierre_id;
end;
$$;

grant execute on function cerrar_caja(text, date, date, numeric) to authenticated;
revoke execute on function cerrar_caja(text, date, date, numeric) from anon;

-- =========================================================================
-- 6. Bucket para el comprobante (foto del movimiento)
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'caja-comprobantes',
  'caja-comprobantes',
  false,
  20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "caja_comprobantes_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'caja-comprobantes' and puede_ver_caja());

create policy "caja_comprobantes_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'caja-comprobantes' and puede_gestionar_caja());

-- A propósito NO hay política de delete para este bucket: mismo criterio
-- de inmutabilidad que los movimientos — un comprobante subido no se saca.

-- Verificación: las tres consultas tienen que andar sin error. La primera
-- y la segunda, vacías. La tercera tiene que devolver "0".
select * from caja_cierres;
select * from caja_movimientos;
select * from caja_saldo;
