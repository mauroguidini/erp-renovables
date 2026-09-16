-- Corrección: la vista "caja_saldo" (script 045) no respetaba los permisos
-- Qué pasó: se creó sin "security_invoker", así que Postgres la corre con
-- los privilegios de quien la CREÓ (no de quien pregunta) — eso hace que
-- devuelva el saldo real a CUALQUIER usuario autenticado, sin importar su
-- rol. La pantalla nunca se lo mostraba a nadie sin permiso, pero alguien
-- con acceso directo a la base (por ejemplo, con las credenciales del
-- proyecto) podía leerlo igual. Las otras vistas de este sistema
-- ("obras_visibles") ya usaban "security_invoker" correctamente; esta se
-- coló sin él por error.
--
-- Qué corrige: de acá en más, caja_saldo respeta la misma política que
-- caja_movimientos — solo administrador y administracion ven el saldo
-- real, cualquier otro rol recibe 0.
--
-- Cómo se usa: pegar en Supabase > SQL Editor > New query y Run. Requiere
-- haber corrido antes 001 a 046.

alter view caja_saldo set (security_invoker = true);

-- Verificación: tiene que devolver el mismo saldo de siempre (sos
-- administrador). Lo que cambia no se nota desde acá: ahora un usuario sin
-- permiso recibiría 0 en vez del saldo real.
select * from caja_saldo;
