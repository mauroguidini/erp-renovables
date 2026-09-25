-- Módulo: Reporte semanal por obra (soporte de datos)
-- Qué hace este script:
-- 1. "hitos_historial_estados": mismo patrón que ot_historial_estados — una
--    fila por cada cambio real de estado de un hito, quién y cuándo. Nadie
--    inserta ahí a mano, solo el trigger. No cambia nada del comportamiento
--    actual de Hitos (seguís editando el estado exactamente igual) — es
--    puramente aditivo, para que el Reporte semanal pueda saber qué hitos
--    se cerraron efectivamente DURANTE el período, en vez de aproximarlo
--    con la fecha objetivo. Ojo: solo audita cambios a partir de ahora, no
--    tiene datos retroactivos de hitos que ya se cerraron antes de correr
--    este script.
-- 2. Certificaciones: se había dejado la lectura (puede_ver_certificaciones)
--    limitada a administrador + jefe_obra. El Reporte semanal lo puede
--    generar también administración, así que se amplía ese permiso para
--    incluirla — mismo rol que ya factura/cobra en el resto del sistema.
--    No cambia nada más del módulo de Certificaciones (cargar/editar sigue
--    siendo jefe_obra + administrador, cambiar estado sigue siendo solo
--    administrador).
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 071.

-- =========================================================================
-- 1. Historial de estados de hitos
-- =========================================================================

create table if not exists hitos_historial_estados (
  id uuid primary key default gen_random_uuid(),
  hito_id uuid not null references hitos(id) on delete cascade,
  estado text not null,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz not null default now()
);

alter table hitos_historial_estados enable row level security;
revoke all on hitos_historial_estados from anon;

drop policy if exists "hitos_historial_select" on hitos_historial_estados;
create policy "hitos_historial_select" on hitos_historial_estados
  for select to authenticated using (puede_ver_obras());
-- Sin política de insert para usuarios: solo el trigger de abajo escribe acá.

create or replace function registrar_historial_estado_hito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into hitos_historial_estados (hito_id, estado, usuario_id, usuario_email)
    values (new.id, new.estado, auth.uid(), (select email from profiles where id = auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists hitos_historial_estado on hitos;
create trigger hitos_historial_estado
  after update of estado on hitos
  for each row execute function registrar_historial_estado_hito();

-- =========================================================================
-- 2. Certificaciones: administración también puede leerlas
-- =========================================================================

create or replace function puede_ver_certificaciones()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('administrador', 'jefe_obra', 'administracion')
  );
$$;

-- Verificación: tiene que devolver 0 filas, sin error.
select * from hitos_historial_estados;
