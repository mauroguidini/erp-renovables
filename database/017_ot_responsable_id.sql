-- Módulo: Conectar OT a Empleados (PASO 5 de varios)
-- Qué hace este script: agrega la columna "responsable_id" a
-- ordenes_trabajo, que apunta a la tabla empleados. Queda vacía (null) para
-- TODAS las OT que ya existen — no se migra ni se adivina nada del texto
-- viejo en "responsable". Ese campo de texto viejo se queda como está, sin
-- tocarlo, así no se pierde nada de lo que ya tenías escrito.
--
-- De acá en adelante: cuando cargues la lista de empleados (a mano o
-- importando), las OT nuevas van a usar un selector de esta lista en vez de
-- texto libre. Las OT viejas las podés reasignar cuando quieras — no hay
-- apuro ni riesgo de que se rompa nada mientras tanto.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 016.

alter table ordenes_trabajo
  add column responsable_id uuid references empleados(id);

-- Verificación: tiene que aparecer la columna nueva "responsable_id",
-- vacía en todas las filas.
select id, responsable, responsable_id from ordenes_trabajo limit 5;
