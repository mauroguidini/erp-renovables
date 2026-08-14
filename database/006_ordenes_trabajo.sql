-- Módulo: Órdenes de trabajo (OT)
-- Qué hace este script: crea la tabla de órdenes de trabajo, asociadas a una
-- obra. Cada OT tiene descripción, responsable, fecha y estado. Si el estado
-- es "no cumplida", puede guardar un motivo. Activa RLS igual que el resto
-- del sistema (cualquier usuario logueado puede ver y marcar, sin roles).
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New query,
-- y hacer clic en "Run". Requiere haber corrido antes 001 a 005.

drop table if exists ordenes_trabajo cascade;

create table ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete cascade,
  descripcion text not null,
  responsable text,
  fecha date not null default current_date,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'cumplida', 'no_cumplida', 'parcial')),
  motivo_incumplimiento text
    check (motivo_incumplimiento in ('falta_material', 'clima', 'falta_personal', 'otro')),
  motivo_detalle text,
  created_at timestamptz not null default now()
);

alter table ordenes_trabajo enable row level security;

drop policy if exists "authenticated_all" on ordenes_trabajo;
create policy "authenticated_all" on ordenes_trabajo
  for all to authenticated using (true) with check (true);

revoke all on ordenes_trabajo from anon;
