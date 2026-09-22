-- Módulo: Conciliación bancaria — corrige la regla de "Ingresos Brutos"
-- (065/066 asumían la forma abreviada "I.B", pero el extracto real dice
-- "Recaudacion Ingresos Brutos Tucuman" completo) y agrega "ATP" (débito
-- automático de Ingresos Brutos de Tucumán) como impuesto. La regla en
-- código ya se corrigió en clasificacionMovimientos.js — este script solo
-- aplica el ajuste a lo que YA está importado y quedó "pendiente" por
-- ese motivo.
--
-- Es un ajuste de datos, no de estructura, y es seguro correrlo más de
-- una vez (solo toca lo que sigue "pendiente"; no toca lo conciliado).
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 067.

update movimientos_bancarios
set clasificacion = 'impuestos',
    estado = 'clasificado',
    cuit_detectado = null
where estado = 'pendiente'
  and debito > 0
  and lower(translate(concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
      ~ 'recaudacion.*(ingresos brutos|i\.?\s*b\y)|\yatp\y';

-- Verificación: no debería quedar ningún "Recaudacion Ingresos Brutos" ni
-- "ATP" pendiente después de correr esto.
select concepto, clasificacion, estado, count(*)
from movimientos_bancarios
where lower(concepto) like '%ingresos brutos%' or lower(concepto) like '%atp%'
group by concepto, clasificacion, estado
order by concepto;
