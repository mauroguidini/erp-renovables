-- Módulo: OT cumplida bloqueada + auditoría (PASO 1 de varios)
-- Qué hace este script:
-- 1. Crea "ot_historial_estados": una fila por cada cambio de estado real
--    de una OT (a qué OT, a qué estado pasó, quién lo hizo, cuándo). La
--    ven los 4 roles que ven Obras/OT. Nadie puede insertar ahí
--    directamente — no hay política de "insert" para usuarios comunes,
--    solo el trigger (que corre con permisos propios) puede escribir.
-- 2. Un trigger en ordenes_trabajo que graba una fila ahí cada vez que la
--    columna "estado" cambia de verdad (no cuando se guarda el mismo
--    valor, ni cuando solo se edita el motivo de incumplimiento).
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 035.

create table ot_historial_estados (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references ordenes_trabajo(id) on delete cascade,
  estado text not null,
  usuario_id uuid,
  usuario_email text,
  created_at timestamptz not null default now()
);

alter table ot_historial_estados enable row level security;

create policy "ot_historial_select" on ot_historial_estados
  for select to authenticated using (puede_ver_obras());

revoke all on ot_historial_estados from anon;

create or replace function registrar_historial_estado_ot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into ot_historial_estados (ot_id, estado, usuario_id, usuario_email)
    values (
      new.id,
      new.estado,
      auth.uid(),
      (select email from profiles where id = auth.uid())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists ordenes_trabajo_historial_estado on ordenes_trabajo;
create trigger ordenes_trabajo_historial_estado
  after update of estado on ordenes_trabajo
  for each row execute function registrar_historial_estado_ot();

-- Verificación: tiene que devolver una tabla vacía (0 filas), sin error —
-- todavía no cambiaste ningún estado desde que se creó el trigger.
select * from ot_historial_estados;
