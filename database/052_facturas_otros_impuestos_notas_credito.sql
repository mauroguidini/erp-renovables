-- Módulo: Facturas de compra — otros impuestos y notas de crédito
-- Qué hace este script:
-- 1. Agrega "otros_impuestos" (percepciones, IIBB, etc.) a facturas_compra.
--    El total sigue siendo un campo que carga la pantalla (neto + IVA +
--    otros_impuestos, calculado del lado del cliente) — no hay un check
--    de base que lo fuerce, mismo criterio que ya existía para neto+IVA.
-- 2. Agrega "tipo_documento" ('factura' o 'nota_credito'). Una nota de
--    crédito NO es una tabla aparte: tiene EXACTAMENTE las mismas columnas
--    que una factura (por eso pediste que comparta los mismos datos), así
--    que reutilizar la misma tabla evita duplicar políticas, índices,
--    catálogos y el bucket de comprobantes. La diferencia es solo el
--    SIGNO al sumar: una nota resta en vez de sumar. Esa resta se hace en
--    la pantalla (donde ya se calculan los totales), no en la base.
-- 3. Agrega "factura_id": el vínculo OPCIONAL de una nota de crédito a la
--    factura que corrige. Puede quedar vacío (nota "suelta", sin factura
--    asociada) — un trigger valida que, si se completa, apunte a un
--    documento que sea REALMENTE una factura (no a otra nota de crédito,
--    para no encadenar notas entre sí) y nunca a sí misma.
-- 4. El número de comprobante ya no alcanza con proveedor+tipo+número: una
--    factura "A" n.º 123 y una nota de crédito "A" n.º 123 del MISMO
--    proveedor son documentos distintos (series de numeración separadas),
--    así que la restricción de "no repetido" ahora suma tipo_documento.
--
-- Cómo se usa: pegar todo este contenido en Supabase > SQL Editor > New
-- query, y hacer clic en "Run". Requiere haber corrido antes 001 a 051.

-- =========================================================================
-- 1. Otros impuestos
-- =========================================================================

alter table facturas_compra
  add column otros_impuestos numeric(12, 2) not null default 0 check (otros_impuestos >= 0);

-- =========================================================================
-- 2. Tipo de documento y vínculo opcional a la factura que corrige
-- =========================================================================

alter table facturas_compra
  add column tipo_documento text not null default 'factura'
    check (tipo_documento in ('factura', 'nota_credito'));

alter table facturas_compra
  add column factura_id uuid references facturas_compra(id) on delete set null;

alter table facturas_compra
  add constraint facturas_compra_no_autorreferencia check (factura_id is distinct from id);

-- Solo una nota de crédito puede tener "factura_id" cargado.
alter table facturas_compra
  add constraint facturas_compra_factura_id_solo_nota
  check (tipo_documento = 'nota_credito' or factura_id is null);

create index facturas_compra_factura_id_idx on facturas_compra (factura_id);

-- El documento al que apunta "factura_id" tiene que ser una FACTURA de
-- verdad, no otra nota de crédito (para no encadenar notas entre sí).
create or replace function validar_factura_id_nota_credito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_referenciado text;
begin
  if new.factura_id is null then
    return new;
  end if;

  select tipo_documento into v_tipo_referenciado
  from facturas_compra where id = new.factura_id;

  if v_tipo_referenciado is distinct from 'factura' then
    raise exception 'Una nota de crédito solo puede vincularse a una factura, no a otra nota de crédito';
  end if;

  return new;
end;
$$;

drop trigger if exists facturas_compra_validar_factura_id on facturas_compra;
create trigger facturas_compra_validar_factura_id
  before insert or update on facturas_compra
  for each row execute function validar_factura_id_nota_credito();

-- =========================================================================
-- 3. La restricción de "no repetido" ahora distingue factura de nota
-- =========================================================================

-- Busca la restricción unique existente sobre (proveedor_id, tipo_factura,
-- numero_factura) sin depender de cómo la haya nombrado Postgres, y la
-- reemplaza por una que además distingue tipo_documento.
do $$
declare
  v_conname text;
  v_esperado smallint[];
begin
  select array_agg(attnum order by attnum) into v_esperado
  from pg_attribute
  where attrelid = 'facturas_compra'::regclass
    and attname in ('proveedor_id', 'tipo_factura', 'numero_factura');

  select conname into v_conname
  from pg_constraint
  where conrelid = 'facturas_compra'::regclass
    and contype = 'u'
    and (select array_agg(k order by k) from unnest(conkey) as k) = v_esperado;

  if v_conname is not null then
    execute format('alter table facturas_compra drop constraint %I', v_conname);
  end if;
end $$;

alter table facturas_compra
  add constraint facturas_compra_documento_unique
  unique (proveedor_id, tipo_documento, tipo_factura, numero_factura);

-- Verificación: tiene que devolver tus facturas ya cargadas, todas con
-- tipo_documento = 'factura', otros_impuestos en 0 y factura_id en NULL —
-- nada se rompió, es lo esperado para datos previos a este script.
select id, tipo_documento, otros_impuestos, factura_id from facturas_compra limit 5;
