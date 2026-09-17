"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Columnas que nos interesan del export "Mis Comprobantes Emitidos" de
// ARCA, normalizadas igual que en el importador de compras.
const CLAVES = {
  fecha: "fecha",
  tipo: "tipo",
  "punto de venta": "puntoVenta",
  "numero desde": "numeroDesde",
  "nro doc receptor": "cuit",
  "denominacion receptor": "clienteNombre",
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
// el título del reporte).
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
function parsearTipo(tipoTexto) {
  const normal = normalizarClave(tipoTexto);
  if (!normal) return null;
  const esNota = /credito/.test(normal);
  const match = String(tipoTexto).trim().match(/\b([ABC])\b\s*$/i);
  const tipoFactura = match ? match[1].toUpperCase() : "otro";
  return { tipoDocumento: esNota ? "nota_credito" : "factura", tipoFactura };
}

function claveDuplicado(clienteClave, tipoDocumento, tipoFactura, numeroFactura) {
  return `${clienteClave}|${tipoDocumento}|${tipoFactura}|${numeroFactura}`;
}

async function validarFilas(filas) {
  const { data: clientesData } = await supabase.from("clientes").select("id, cuit, nombre");

  const cuitAClienteId = new Map();
  for (const c of clientesData ?? []) {
    const cuit = normalizarCuit(c.cuit);
    if (cuit) cuitAClienteId.set(cuit, c.id);
  }

  const idsExistentesEnArchivo = new Set();
  const filasConCuit = filas.map((fila) => {
    const cuit = normalizarCuit(fila.cuit);
    const clienteId = cuit ? cuitAClienteId.get(cuit) : null;
    if (clienteId) idsExistentesEnArchivo.add(clienteId);
    return { fila, cuit, clienteId };
  });

  const duplicadosEnBase = new Set();
  if (idsExistentesEnArchivo.size > 0) {
    const { data: existentes } = await supabase
      .from("facturas_venta")
      .select("cliente_id, tipo_documento, tipo_factura, numero_factura")
      .in("cliente_id", Array.from(idsExistentesEnArchivo));

    for (const f of existentes ?? []) {
      duplicadosEnBase.add(
        claveDuplicado(f.cliente_id, f.tipo_documento, f.tipo_factura, f.numero_factura)
      );
    }
  }

  const validas = [];
  const errores = [];
  const duplicados = [];
  const clavesEnArchivo = new Set();
  const clientesNuevos = new Map(); // cuit -> nombre

  filasConCuit.forEach(({ fila, cuit, clienteId }, index) => {
    const numeroFila = index + 3;

    const problemas = [];

    const fecha = parsearFecha(fila.fecha);
    if (!fecha) problemas.push(`fecha no reconocida ("${fila.fecha}")`);

    const tipo = parsearTipo(fila.tipo);
    if (!tipo) problemas.push("falta el tipo de comprobante");

    if (!cuit) problemas.push("falta el CUIT del receptor");

    const clienteNombre = String(fila.clienteNombre ?? "").trim();
    if (!clienteId && !clienteNombre) {
      problemas.push("el cliente no existe y falta la Denominación Receptor para crearlo");
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
      errores.push({ fila: numeroFila, detalle: `${fila.clienteNombre || cuit || "?"}`, problemas });
      return;
    }

    const clienteClave = clienteId ?? `NUEVO:${cuit}`;
    const clave = claveDuplicado(clienteClave, tipo.tipoDocumento, tipo.tipoFactura, numeroFactura);

    if (clienteId && duplicadosEnBase.has(clave)) {
      duplicados.push({
        fila: numeroFila,
        detalle: `${clienteNombre || cuit} — ${tipo.tipoFactura} n.º ${numeroFactura}`,
        motivo: "ya estaba cargado",
      });
      return;
    }
    if (clavesEnArchivo.has(clave)) {
      duplicados.push({
        fila: numeroFila,
        detalle: `${clienteNombre || cuit} — ${tipo.tipoFactura} n.º ${numeroFactura}`,
        motivo: "repetido en el mismo archivo",
      });
      return;
    }
    clavesEnArchivo.add(clave);

    if (!clienteId) clientesNuevos.set(cuit, clienteNombre);

    validas.push({
      clienteId,
      clienteCuit: cuit,
      tipo_documento: tipo.tipoDocumento,
      tipo_factura: tipo.tipoFactura,
      numero_factura: numeroFactura,
      fecha,
      importe_neto: neto.valor,
      iva: iva.valor,
      otros_impuestos: otros.valor,
      importe_total: total.valor,
    });
  });

  return { validas, errores, duplicados, clientesNuevos };
}

export default function ImportarComprobantesArcaVenta({ onImportado }) {
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
      const cuitAId = new Map();
      const nuevosArray = Array.from(resultado.clientesNuevos.entries());
      if (nuevosArray.length > 0) {
        const { data: creados, error: errClientes } = await supabase
          .from("clientes")
          .insert(
            nuevosArray.map(([cuit, nombre]) => ({
              cuit: formatearCuit(cuit),
              nombre: nombre || cuit,
            }))
          )
          .select("id, cuit");

        if (errClientes) throw new Error(errClientes.message);

        for (const c of creados ?? []) {
          cuitAId.set(normalizarCuit(c.cuit), c.id);
        }
      }

      const filasAInsertar = resultado.validas.map((v) => ({
        cliente_id: v.clienteId ?? cuitAId.get(v.clienteCuit),
        tipo_documento: v.tipo_documento,
        tipo_factura: v.tipo_factura,
        numero_factura: v.numero_factura,
        fecha: v.fecha,
        importe_neto: v.importe_neto,
        iva: v.iva,
        otros_impuestos: v.otros_impuestos,
        importe_total: v.importe_total,
      }));

      const { error: errFacturas } = await supabase.from("facturas_venta").insert(filasAInsertar);

      if (errFacturas) {
        throw new Error(
          errFacturas.code === "23505"
            ? "Se encontró un duplicado justo al importar (puede que alguien haya importado el mismo archivo en paralelo). No se importó nada de este lote — probá de nuevo."
            : errFacturas.message
        );
      }

      setExito(
        `Se importaron ${filasAInsertar.length} comprobantes. ` +
          `Se saltearon ${resultado.duplicados.length} por estar duplicados. ` +
          `Se crearon ${nuevosArray.length} clientes nuevos.`
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
            Importar desde ARCA (Mis Comprobantes Emitidos)
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Subí el Excel/CSV tal como lo exporta el portal de ARCA — encabezados en la segunda
            fila. Facturas se cargan sumando; las Notas de Crédito, restando. Sin obra ni centro
            de costos asignado, para vincular después.
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

              {resultado.clientesNuevos.size > 0 && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-medium text-blue-800">
                    Se van a crear {resultado.clientesNuevos.size} clientes nuevos:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-sm text-blue-800">
                    {Array.from(resultado.clientesNuevos.entries()).map(([cuit, nombre]) => (
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
