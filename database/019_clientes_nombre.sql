-- Módulo: Roles ampliados (PASO 7 de varios)
-- Qué hace este script: crea la vista "clientes_nombre", que muestra
-- ÚNICAMENTE id y nombre de cada cliente (nada de teléfono, email, CUIT ni
-- dirección) a cualquiera que pueda ver Obras (administrador, capataz,
-- jefe_obra, administracion). Compras sigue sin ver nada de esto.
--
-- Por qué hace falta: para crear o editar una obra hay que elegir a qué
-- cliente pertenece, pero la tabla "clientes" completa sigue restringida a
-- administrador/administracion (política "gestion_comercial" del paso 2).
-- Sin esta vista, Jefe de obra no podía ni ver la lista de clientes para
-- elegir uno al crear una obra nueva.
--
-- Esta vista, a diferencia de "obras_visibles", se define SIN
-- "security_invoker" a propósito: tiene su propio filtro
-- (puede_ver_obras()) adentro, y necesita poder leer la tabla clientes
-- aunque quien pregunta no tenga permiso directo sobre ella — por eso el
-- filtro está escrito a mano en el "where", no delegado al RLS de clientes.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 018.

create view clientes_nombre as
select id, nombre from clientes where puede_ver_obras();

grant select on clientes_nombre to authenticated;
revoke all on clientes_nombre from anon;

-- Verificación: tiene que devolver tus clientes (nombre e id), igual que si
-- consultaras la tabla clientes directamente, porque sos administrador.
select * from clientes_nombre;
