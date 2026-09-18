"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Columnas que nos interesan del export "Mis Comprobantes Recibidos" de
// ARCA, normalizadas (sin tildes, sin puntos, minúscula, un solo espacio)
// para no depender de que el encabezado venga carácter por carácter igual.
const CLAVES = {
  fecha: "fecha",
  tipo: "tipo",
  "punto de venta": "puntoVenta",
  "numero desde": "numeroDesde",
  "nro doc emisor": "cuit",
  "denominacion emisor": "proveedorNombre",
  "neto gravado total": "neto",
  "otros tributos": "otrosImpuestos",
  "total iva": "iva",
  "imp total": "total",
};

function normalizarClave(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function remapearFila(filaOriginal) {
  const remapeada = {};
  for (const [clave, valor] of Object.entries(filaOriginal)) {
    const destino = CLAVES[normalizarClave(clave)];
    if (destino) remapeada[destino] = valor;
  }
  return remapeada;
}

function parseLineaCsv(linea) {
  const valores = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        actual += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ",") {
      valores.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  valores.push(actual);
  return valores;
}

// El archivo de ARCA trae el encabezado en la SEGUNDA fila (la primera es
// el título del reporte) — por eso se salta una línea de más antes de
// tomar los encabezados, tanto en CSV como en Excel.
function leerFilasCsv(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length < 2) return [];
  const encabezados = parseLineaCsv(lineas[1]);
  return lineas.slice(2).map((linea) => {
    const valores = parseLineaCsv(linea);
    const objeto = {};
    encabezados.forEach((clave, i) => {
      objeto[clave] = (valores[i] ?? "").trim();
    });
    return remapearFila(objeto);
  });
}

async function leerFilasXlsx(arrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  // range: 1 -> arranca a leer desde la segunda fila (índice 1), que es
  // donde están los encabezados reales.
  const filas = XLSX.utils.sheet_to_json(hoja, { range: 1, defval: "" });
  return filas.map(remapearFila);
}

function parsearFecha(valor) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, "0");
    const d = String(valor.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const texto = String(valor ?? "").trim();
  if (!texto) return null;

  let m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  return null;
}

// Admite "1234.56", "1234,56" o el formato argentino "1.234,56". Vacío
// devuelve 0 (neto/IVA/otros tributos pueden venir sin discriminar) —
// distinto de "no se pudo interpretar", que es un error real.
function parseMonto(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return { valor: 0, vacio: true };
  let limpio = texto;
  if (limpio.includes(",") && limpio.includes(".")) {
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (limpio.includes(",")) {
    limpio = limpio.replace(",", ".");
  }
  const num = Number(limpio);
  return { valor: Number.isNaN(num) ? null : num, vacio: false };
}

function normalizarCuit(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

function formatearCuit(digitos) {
  if (digitos.length === 11) {
    return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`;
  }
  return digitos;
}

function formatearNumeroComprobante(puntoVenta, numeroDesde) {
  const pv = String(puntoVenta ?? "").replace(/\D/g, "");
  const nro = String(numeroDesde ?? "").replace(/\D/g, "");
  if (!pv || !nro) return null;
  return `${pv.padStart(4, "0")}-${nro.padStart(8, "0")}`;
}

// "1 Factura A" -> factura, A. "3 Notas de Crédito A" -> nota_credito, A.
// "Liquidación..." (sin letra al final) -> factura, otro.
function parsearTipo(tipoTexto) {
  const normal = normalizarClave(tipoTexto);
  if (!normal) return null;
  const esNota = /credito/.test(normal);
  const match = String(tipoTexto).trim().match(/\b([ABC])\b\s*$/i);
  const tipoFactura = match ? match[1].toUpperCase() : "otro";
  return { tipoDocumento: esNota ? "nota_credito" : "factura", tipoFactura };
}

function claveDuplicado(proveedorClave, tipoDocumento, tipoFactura, numeroFactura) {
  return `${proveedorClave}|${tipoDocumento}|${tipoFactura}|${numeroFactura}`;
}

async function validarFilas(filas) {
  const { data: proveedoresData } = await supabase
    .from("proveedores")
    .select("id, cuit, nombre");

  const cuitAProveedorId = new Map();
  for (const p of proveedoresData ?? []) {
    const cuit = normalizarCuit(p.cuit);
    if (cuit) cuitAProveedorId.set(cuit, p.id);
  }

  const { data: categoriaOtro } = await supabase
    .from("categorias_factura")
    .select("id")
    .eq("nombre", "Otro")
    .maybeSingle();

  if (!categoriaOtro) {
    throw new Error(
      'No se encontró la categoría "Otro" — hace falta para poder importar (todo lo importado queda con esa categoría, se puede recategorizar después).'
    );
  }

  // IDs existentes de proveedores que aparecen en el archivo, para
  // preguntarle a la base qué comprobantes ya tienen cargados y no
  // duplicarlos.
  const idsExistentesEnArchivo = new Set();
  const filasConCuit = filas.map((fila) => {
    const cuit = normalizarCuit(fila.cuit);
    const proveedorId = cuit ? cuitAProveedorId.get(cuit) : null;
    if (proveedorId) idsExistentesEnArchivo.add(proveedorId);
    return { fila, cuit, proveedorId };
  });

  const duplicadosEnBase = new Set();
  if (idsExistentesEnArchivo.size > 0) {
    const { data: existentes } = await supabase
      .from("facturas_compra")
      .select("proveedor_id, tipo_documento, tipo_factura, numero_factura")
      .in("proveedor_id", Array.from(idsExistentesEnArchivo));

    for (const f of existentes ?? []) {
      duplicadosEnBase.add(
        claveDuplicado(f.proveedor_id, f.tipo_documento, f.tipo_factura, f.numero_factura)
      );
    }
  }

  const validas = [];
  const errores = [];
  const duplicados = [];
  const clavesEnArchivo = new Set();
  const proveedoresNuevos = new Map(); // cuit -> nombre

  filasConCuit.forEach(({ fila, cuit, proveedorId }, index) => {
    const numeroFila = index + 3; // fila de título + fila de encabezado + índice desde 0

    const problemas = [];

    const fecha = parsearFecha(fila.fecha);
    if (!fecha) problemas.push(`fecha no reconocida ("${fila.fecha}")`);

    const tipo = parsearTipo(fila.tipo);
    if (!tipo) problemas.push(`falta el tipo de comprobante`);

    if (!cuit) problemas.push("falta el CUIT del emisor");

    const proveedorNombre = String(fila.proveedorNombre ?? "").trim();
    if (!proveedorId && !proveedorNombre) {
      problemas.push("el proveedor no existe y falta la Denominación Emisor para crearlo");
    }

    const numeroFactura = formatearNumeroComprobante(fila.puntoVenta, fila.numeroDesde);
    if (!numeroFactura) problemas.push("falta punto de venta o número de comprobante");

    const neto = parseMonto(fila.neto);
    if (neto.valor === null) problemas.push(`"Neto Gravado Total" no es un número`);

    const iva = parseMonto(fila.iva);
    if (iva.valor === null) problemas.push(`"Total IVA" no es un número`);

    const otros = parseMonto(fila.otrosImpuestos);
    if (otros.valor === null) problemas.push(`"Otros Tributos" no es un número`);

    const total = parseMonto(fila.total);
    if (total.vacio || total.valor === null) problemas.push(`falta "Imp. Total"`);

    if (problemas.length > 0) {
      errores.push({ fila: numeroFila, detalle: `${fila.proveedorNombre || cuit || "?"}`, problemas });
      return;
    }

    const proveedorClave = proveedorId ?? `NUEVO:${cuit}`;
    const clave = claveDuplicado(proveedorClave, tipo.tipoDocumento, tipo.tipoFactura, numeroFactura);

    if (proveedorId && duplicadosEnBase.has(clave)) {
      duplicados.push({
        fila: numeroFila,
        detalle: `${proveedorNombre || cuit} — ${tipo.tipoFactura} n.º ${numeroFactura}`,
        motivo: "ya estaba cargado",
      });
      return;
    }
    if (clavesEnArchivo.has(clave)) {
      duplicados.push({
        fila: numeroFila,
        detalle: `${proveedorNombre || cuit} — ${tipo.tipoFactura} n.º ${numeroFactura}`,
        motivo: "repetido en el mismo archivo",
      });
      return;
    }
    clavesEnArchivo.add(clave);

    if (!proveedorId) proveedoresNuevos.set(cuit, proveedorNombre);

    validas.push({
      proveedorId,
      proveedorCuit: cuit,
      tipo_documento: tipo.tipoDocumento,
      tipo_factura: tipo.tipoFactura,
      numero_factura: numeroFactura,
      fecha,
      importe_neto: neto.valor,
      iva: iva.valor,
      otros_impuestos: otros.valor,
      importe_total: total.valor,
      categoria_id: categoriaOtro.id,
    });
  });

  return { validas, errores, duplicados, proveedoresNuevos };
}

export default function ImportarComprobantesArca({ onImportado }) {
  const [abierto, setAbierto] = useState(false);
  const [validando, setValidando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorLectura, setErrorLectura] = useState(null);

  const [importando, setImportando] = useState(false);
  const [errorImportar, setErrorImportar] = useState(null);
  const [exito, setExito] = useState(null);

  async function handleArchivoSeleccionado(e) {
    const file = e.target.files?.[0] ?? null;
    setResultado(null);
    setErrorLectura(null);
    setExito(null);
    if (!file) return;

    setValidando(true);
    try {
      let filas;
      if (file.name.toLowerCase().endsWith(".csv")) {
        const texto = await file.text();
        filas = leerFilasCsv(texto);
      } else {
        const buffer = await file.arrayBuffer();
        filas = await leerFilasXlsx(buffer);
      }

      if (filas.length === 0) {
        throw new Error(
          "No se encontraron filas de datos. Confirmá que el archivo tenga los encabezados en la segunda fila, como exporta ARCA."
        );
      }

      setResultado(await validarFilas(filas));
    } catch (err) {
      setErrorLectura(err.message);
    } finally {
      setValidando(false);
    }
  }

  async function handleConfirmarImportacion() {
    if (!resultado || resultado.validas.length === 0) return;

    setImportando(true);
    setErrorImportar(null);

    try {
      // 1. Crear los proveedores nuevos (una sola vez por CUIT, aunque
      // aparezca en varias filas), y armar el mapa cuit -> id completo.
      const cuitAId = new Map();
      const nuevosArray = Array.from(resultado.proveedoresNuevos.entries());
      if (nuevosArray.length > 0) {
        const { data: creados, error: errProveedores } = await supabase
          .from("proveedores")
          .insert(
            nuevosArray.map(([cuit, nombre]) => ({
              cuit: formatearCuit(cuit),
              nombre: nombre || cuit,
            }))
          )
          .select("id, cuit");

        if (errProveedores) throw new Error(errProveedores.message);

        for (const p of creados ?? []) {
          cuitAId.set(normalizarCuit(p.cuit), p.id);
        }
      }

      // 2. Insertar los comprobantes, resolviendo el proveedor definitivo.
      const filasAInsertar = resultado.validas.map((v) => ({
        proveedor_id: v.proveedorId ?? cuitAId.get(v.proveedorCuit),
        tipo_documento: v.tipo_documento,
        tipo_factura: v.tipo_factura,
        numero_factura: v.numero_factura,
        fecha: v.fecha,
        importe_neto: v.importe_neto,
        iva: v.iva,
        otros_impuestos: v.otros_impuestos,
        importe_total: v.importe_total,
        categoria_id: v.categoria_id,
      }));

      const { data: insertados, error: errFacturas } = await supabase
        .from("facturas_compra")
        .insert(filasAInsertar)
        .select("centro_asignado_por_regla");

      if (errFacturas) {
        throw new Error(
          errFacturas.code === "23505"
            ? "Se encontró un duplicado justo al importar (puede que alguien haya importado el mismo archivo en paralelo). No se importó nada de este lote — probá de nuevo."
            : errFacturas.message
        );
      }

      // Cuántas quedaron con centro de costos puesto solas, por ser de un
      // proveedor habitual de un único centro (ver "Proveedores
      // habituales" en Centros de costos) — para que quede claro que
      // conviene revisarlas.
      const asignadasPorRegla = (insertados ?? []).filter((f) => f.centro_asignado_por_regla).length;

      setExito(
        `Se importaron ${filasAInsertar.length} comprobantes. ` +
          `Se saltearon ${resultado.duplicados.length} por estar duplicados. ` +
          `Se crearon ${nuevosArray.length} proveedores nuevos.` +
          (asignadasPorRegla > 0
            ? ` ${asignadasPorRegla} se imputaron solas a un centro de costos por proveedor habitual — revisalas en Facturas de compra con el filtro "Asignadas por regla".`
            : "")
      );
      setResultado(null);
      onImportado?.();
    } catch (err) {
      setErrorImportar(err.message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-primary">
            Importar desde ARCA (Mis Comprobantes Recibidos)
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Subí el Excel/CSV tal como lo exporta el portal de ARCA — encabezados en la segunda
            fila. Facturas, Notas de Débito y Liquidaciones se cargan sumando; las Notas de
            Crédito, restando. Todo queda con categoría "Otro" y sin centro de costos, para
            ajustar después.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          {abierto ? "Cerrar" : "Importar comprobantes"}
        </button>
      </div>

      {abierto && (
        <div className="mt-4">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleArchivoSeleccionado}
            className="text-sm text-zinc-700"
          />

          {validando && <p className="mt-3 text-sm text-zinc-600">Validando archivo...</p>}

          {errorLectura && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              No se pudo leer el archivo: {errorLectura}
            </p>
          )}

          {exito && (
            <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              {exito}
            </p>
          )}

          {resultado && (
            <div className="mt-4">
              <p className="text-sm font-medium text-primary">
                {resultado.validas.length} comprobantes listos para importar
                {resultado.duplicados.length > 0 &&
                  ` · ${resultado.duplicados.length} saltados por duplicados`}
                {resultado.errores.length > 0 && ` · ${resultado.errores.length} con errores`}
              </p>

              {resultado.proveedoresNuevos.size > 0 && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-medium text-blue-800">
                    Se van a crear {resultado.proveedoresNuevos.size} proveedores nuevos:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-sm text-blue-800">
                    {Array.from(resultado.proveedoresNuevos.entries()).map(([cuit, nombre]) => (
                      <li key={cuit}>
                        {nombre || "(sin nombre)"} — CUIT {formatearCuit(cuit)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {resultado.duplicados.length > 0 && (
                <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-medium text-zinc-700">
                    Saltados por duplicados (no se van a importar):
                  </p>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-sm text-zinc-600">
                    {resultado.duplicados.map((d, i) => (
                      <li key={i}>
                        Fila {d.fila}: {d.detalle} ({d.motivo})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {resultado.errores.length > 0 && (
                <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm font-medium text-yellow-800">
                    Filas con errores (no se van a importar):
                  </p>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-sm text-yellow-800">
                    {resultado.errores.map((e, i) => (
                      <li key={i}>
                        Fila {e.fila} ({e.detalle}): {e.problemas.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {errorImportar && (
                <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                  {errorImportar}
                </p>
              )}

              <button
                type="button"
                onClick={handleConfirmarImportacion}
                disabled={importando || resultado.validas.length === 0}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {importando
                  ? "Importando..."
                  : `Confirmar importación (${resultado.validas.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
