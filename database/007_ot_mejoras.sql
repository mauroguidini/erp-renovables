-- Módulo: Mejoras a Órdenes de trabajo
-- Qué hace este script: renombra la columna "fecha" a "fecha_limite" (para
-- que quede claro que es el plazo de la tarea, no la fecha de creación), y
-- agrega "creado_por", que se completa sola con el email del usuario
-- logueado al crear la OT — la app no manda ese dato, lo pone la base.
-- No borra la tabla ni los datos existentes.
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New query,
-- y hacer clic en "Run". Requiere haber corrido antes 001 a 006.

alter table ordenes_trabajo rename column fecha to fecha_limite;

alter table ordenes_trabajo add column creado_por text;

-- Las OT que ya existían no tienen quién las creó guardado; les ponemos un
-- valor genérico para no romper la restricción de "no puede estar vacío".
update ordenes_trabajo set creado_por = 'desconocido' where creado_por is null;

alter table ordenes_trabajo alter column creado_por set not null;

-- De acá en adelante, toda OT nueva se completa sola con el email de quien
-- esté logueado en el momento de crearla.
alter table ordenes_trabajo alter column creado_por set default (auth.jwt() ->> 'email');
