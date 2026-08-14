-- Módulo: Fecha de inicio en OT
-- Qué hace este script: agrega "fecha_inicio" (opcional) a ordenes_trabajo.
-- La fecha que ya existía, "fecha_limite" (se muestra como "Vence"), sigue
-- siendo la fecha de finalización — no se renombra ni se toca nada de lo
-- que ya funciona. Las OT que ya existen quedan con fecha_inicio vacía.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 027.

alter table ordenes_trabajo
  add column fecha_inicio date;

-- Verificación: tiene que aparecer la columna nueva "fecha_inicio", vacía
-- en todas las filas.
select id, fecha_inicio, fecha_limite from ordenes_trabajo limit 5;
