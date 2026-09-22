-- Módulo: Ingresos y salidas de material — acceso de Compras
-- Compras podía cargar movimientos (crear_movimiento_material ya lo
-- permitía) pero no podía ni siquiera entrar a la página de la obra para
-- llegar a esa sección: la tabla "obras" solo se puede leer si
-- puede_ver_obras() da true, y ese rol nunca incluyó a "compras" (a
-- propósito, compras no debe ver el resto de la obra: hitos, OT,
-- asistencia, trabajo diario, etc.).
--
-- Qué hace este script: agrega una función nueva, SIN tocar
-- puede_ver_obras() ni ninguna política existente, que devuelve solo
-- id+dirección de las obras — lo mínimo para elegir/identificar una obra
-- al cargar material — a cualquiera que ya pueda ver movimientos de
-- material (administrador, compras, administracion, capataz, jefe_obra).
-- No le da a Compras ningún acceso nuevo a "obras" ni a "ordenes_trabajo".
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 069.

create or replace function obras_para_material()
returns table (id uuid, direccion text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.direccion
  from obras o
  where puede_ver_movimientos_material()
  order by o.direccion;
$$;

grant execute on function obras_para_material() to authenticated;
revoke execute on function obras_para_material() from anon;

-- Verificación: tiene que devolver todas las obras (como sos administrador).
select * from obras_para_material();
