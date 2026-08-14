-- Módulo: Entregas de material a obra (PASO 1 de varios)
-- Qué hace este script: agrega la columna "deposito_id" a "obras" — el
-- depósito propio de esa obra (tipo 'obra'), donde se registra el material
-- que le llega. Queda vacía (null) para todas las obras que ya existen; se
-- completa sola la primera vez que se le entregue material (eso lo hace la
-- función del paso 2, todavía no creada). "unique" es para que un mismo
-- depósito no pueda quedar conectado a dos obras a la vez.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 019.

alter table obras
  add column deposito_id uuid unique references depositos(id);

-- Verificación: tiene que aparecer la columna nueva "deposito_id", vacía en
-- todas las filas.
select id, direccion, deposito_id from obras limit 5;
