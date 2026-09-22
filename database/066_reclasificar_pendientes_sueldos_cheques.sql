-- Módulo: Conciliación bancaria — aplicar retroactivamente a los
-- extractos YA IMPORTADOS las reglas nuevas de 065 (Sueldos, nuevas
-- palabras clave de Impuestos, emparejamiento de cheques por número).
-- Por qué hace falta: esas reglas solo se aplican en el momento de
-- importar un extracto nuevo (ImportarExtracto.js); lo que ya se había
-- importado antes se queda con la clasificación vieja para siempre si
-- no se corre este ajuste una vez.
--
-- Es un ajuste de datos, no de estructura, y es seguro correrlo más de
-- una vez (cada paso solo toca lo que todavía no tiene la clasificación
-- / pareja que le correspondería):
-- 1. Nunca toca un movimiento con estado = 'conciliado' — lo que ya se
--    pagó/concilió queda exactamente como está.
-- 2. El emparejamiento de cheques solo empareja cuando hay EXACTAMENTE
--    un ingreso y EXACTAMENTE un rechazo sin pareja con el mismo banco
--    y número de cheque — igual que "nunca adivinar" en proveedores
--    habituales (058/059): si hay 0 o 2+ candidatos, no empareja nada y
--    lo deja para revisar a mano.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 065.

-- 1) Sueldos — antes no había ninguna regla que los detectara, así que
--    quedaron "pendiente".
update movimientos_bancarios
set clasificacion = 'sueldos',
    estado = 'clasificado',
    cuit_detectado = null
where estado = 'pendiente'
  and debito > 0
  and lower(translate(concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) like '%pago de haberes%';

-- 2) Impuestos — palabras clave nuevas (Recaudación I.B., "Pago de
--    Servicios", "Ente:"). Las reglas viejas (Ley 25.413, IVA, Sellos,
--    SIRCREB, comisiones) ya los había clasificado en su momento, así
--    que acá no hay nada más para hacer con esos.
update movimientos_bancarios
set clasificacion = 'impuestos',
    estado = 'clasificado',
    cuit_detectado = null
where estado = 'pendiente'
  and debito > 0
  and lower(translate(concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
      ~ 'recaudacion.*i\.?\s*b|pago de servicios|\yente:';

-- 3) Cheques — primero se completa el número de cheque (de "Ch:00004051"
--    en el concepto) en todo eCheque que todavía no lo tenga, sin tocar
--    lo ya conciliado.
update movimientos_bancarios
set numero_cheque = substring(
  lower(translate(concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'))
  from 'ch:?\s*0*([0-9]+)'
)
where numero_cheque is null
  and estado <> 'conciliado'
  and lower(translate(concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) like '%echeq%'
  and (
    lower(translate(concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) like '%acred%'
    or lower(translate(concepto, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) like '%rechaz%'
  );

-- Ahora sí, el emparejamiento: NUNCA por monto, solo por (banco, número
-- de cheque), y solo cuando de cada lado hay un único candidato posible.
with candidatos as (
  select id, banco_id, numero_cheque, credito, debito, clasificacion, estado, cuit_detectado
  from movimientos_bancarios
  where numero_cheque is not null
    and estado <> 'conciliado'
    and cheque_pareja_id is null
),
ingresos as (
  select banco_id, numero_cheque, id as ingreso_id,
         count(*) over (partition by banco_id, numero_cheque) as cant
  from candidatos
  where credito > 0
),
rechazos as (
  select banco_id, numero_cheque, id as rechazo_id,
         count(*) over (partition by banco_id, numero_cheque) as cant
  from candidatos
  where debito > 0
),
parejas as (
  select i.ingreso_id, r.rechazo_id
  from ingresos i
  join rechazos r using (banco_id, numero_cheque)
  where i.cant = 1 and r.cant = 1
)
update movimientos_bancarios m
set cheque_pareja_id = case
      when m.id = parejas.ingreso_id then parejas.rechazo_id
      else parejas.ingreso_id
    end,
    clasificacion = case
      when m.id = parejas.rechazo_id then 'cheque_rechazado'
      else m.clasificacion
    end,
    estado = case
      when m.id = parejas.rechazo_id then 'clasificado'
      else m.estado
    end,
    cuit_detectado = case
      when m.id = parejas.rechazo_id then null
      else m.cuit_detectado
    end
from parejas
where m.id in (parejas.ingreso_id, parejas.rechazo_id);

-- Verificación: cuántos movimientos quedaron en cada estado/clasificación
-- después del ajuste.
select clasificacion, estado, count(*)
from movimientos_bancarios
group by clasificacion, estado
order by clasificacion nulls first, estado;
