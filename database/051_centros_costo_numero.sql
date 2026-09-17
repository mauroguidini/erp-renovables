-- Módulo: Número de centro de costos
-- Qué hace este script: agrega "numero" a centros_costo — un código que
-- vos elegís (no lo asigna el sistema en orden de creación), pensado para
-- un esquema tipo plan de cuentas (ej: 100 = Administración, 200 =
-- Vehículos, 301 = Obra Cangallo). Tiene que ser único.
--
-- A los centros que ya tengas cargados este script les asigna un número
-- provisorio (1, 2, 3... según el orden en que los creaste) para que la
-- columna pueda quedar obligatoria sin romper nada — ENTRÁ A "Centros de
-- costos" después de correr esto y revisá/cambiá esos números por los que
-- realmente quieras usar.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 050.

alter table centros_costo add column numero integer;

with numerado as (
  select id, row_number() over (order by created_at) as rn
  from centros_costo
)
update centros_costo c
set numero = n.rn
from numerado n
where c.id = n.id;

alter table centros_costo alter column numero set not null;
alter table centros_costo add constraint centros_costo_numero_unique unique (numero);

-- Verificación: tiene que aparecer cada centro con un número (los que ya
-- existían, del 1 en adelante según el orden de creación — revisalos y
-- cambialos por los que quieras usar de verdad).
select numero, nombre, tipo from centros_costo order by numero;
