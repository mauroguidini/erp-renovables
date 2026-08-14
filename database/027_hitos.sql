-- Módulo: Hitos de obra (PASO 1 de varios)
-- Qué hace este script:
-- 1. Crea la tabla "hitos" (nombre, fecha objetivo, estado
--    pendiente/cumplido, asociado a una obra). Misma seguridad que "obras":
--    la ven los 4 roles que ven Obras; la crean/editan/borran administrador
--    y jefe_obra.
-- 2. Agrega "hito_id" a ordenes_trabajo (opcional). Si se borra un hito,
--    sus OT NO se borran — quedan sin hito asignado ("on delete set null"),
--    nunca se pierde una orden de trabajo por borrar un hito.
-- 3. Agrega una validación (trigger): una OT no puede quedar asignada a un
--    hito que pertenezca a OTRA obra. La app nunca va a ofrecer esa
--    combinación en un selector, pero esto lo bloquea también a nivel de
--    base de datos, por si acaso.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 026.

create table hitos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  nombre text not null,
  fecha_objetivo date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'cumplido')),
  created_at timestamptz not null default now()
);

alter table hitos enable row level security;

create policy "hitos_select" on hitos
  for select to authenticated using (puede_ver_obras());

create policy "hitos_insert" on hitos
  for insert to authenticated with check (puede_gestionar_obras());

create policy "hitos_update" on hitos
  for update to authenticated using (puede_gestionar_obras()) with check (puede_gestionar_obras());

create policy "hitos_delete" on hitos
  for delete to authenticated using (puede_gestionar_obras());

revoke all on hitos from anon;

alter table ordenes_trabajo
  add column hito_id uuid references hitos(id) on delete set null;

create or replace function validar_hito_de_obra()
returns trigger
language plpgsql
as $$
begin
  if new.hito_id is not null and not exists (
    select 1 from hitos where id = new.hito_id and obra_id = new.obra_id
  ) then
    raise exception 'El hito no pertenece a la misma obra que la orden de trabajo';
  end if;
  return new;
end;
$$;

create trigger ordenes_trabajo_valida_hito
  before insert or update of hito_id, obra_id on ordenes_trabajo
  for each row execute function validar_hito_de_obra();

-- Verificación: tiene que devolver una tabla vacía (0 filas), sin error.
select * from hitos;
