-- Módulo: Tipo de OT (programada / puntual)
-- Qué hace este script: agrega la columna "tipo" a ordenes_trabajo, sin
-- borrar la tabla ni los datos existentes. Las OT que ya existen quedan como
-- "puntual" (se cargaron a mano), igual que las nuevas creadas desde el
-- formulario "+ Nueva OT". El importador de plan de trabajo va a marcar
-- explícitamente "programada" a las que suba.
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New query,
-- y hacer clic en "Run". Requiere haber corrido antes 001 a 007.

alter table ordenes_trabajo add column tipo text;

update ordenes_trabajo set tipo = 'puntual' where tipo is null;

alter table ordenes_trabajo alter column tipo set not null;
alter table ordenes_trabajo alter column tipo set default 'puntual';

alter table ordenes_trabajo
  add constraint ordenes_trabajo_tipo_check check (tipo in ('programada', 'puntual'));
