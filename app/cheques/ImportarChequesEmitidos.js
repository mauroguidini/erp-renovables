"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Encabezados del listado de e-cheques de Banco Credicoop, normalizados
// (sin tildes, sin puntuación, un solo espacio) para no depender de que
// vengan carácter por carácter igual — mismo criterio que el resto de los
// importadores de este sistema (ImportarComprobantesArca, ImportarExtracto).
const CLAVES = {
  "nro de cheque": "numeroCheque",
  "n de cheque": "numeroCheque",
  "numero de cheque": "numeroCheque",
  "fecha de pago": "fecha",
  monto: "monto",
  beneficiario: "beneficiario",
  "cuit cuil cdi": "cuit",
  estado: "estadoBanco",
  banco: "bancoNombre",
};

// Banco Credicoop informa estos cuatro estados de e-cheque. Cualquier
// otro valor NO se adivina — la fila se marca como error para que se
// revise a mano (mejor frenar una fila rara que clasificarla mal en un
// módulo que toca facturas y pagos).
const ESTADOS_BANCO = {
  PAGADO: "cobrado",
  ACTIVO: "pendiente",
  PRESENTADO: "en_proceso",
  REPUDIADO: "rechazado",
  RECHAZADO: "rechazado",
};

export const ETIQUETA_ESTADO_CHEQUE = {
  pendiente: "Pendiente de cobro",
  en_proceso: "En proceso",
  cobrado: "Cobrado",
  rechazado: "Rechazado",
};

function normalizarClave(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
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

async function leerFilasXlsx(arrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });
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

// Admite "1234.56", "1234,56" o el formato argentino "1.234,56".
function parseMonto(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  let limpio = texto;
  if (limpio.includes(",") && limpio.includes(".")) {
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (limpio.includes(",")) {
    limpio = limpio.replace(",", ".");
  }
  const num = Number(limpio);
  return Number.isNaN(num) ? null : num;
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

// Deja solo los dígitos y saca los ceros a la izquierda — así "00004051"
// (como lo escribe el banco acá) y "Ch:00004051" o "Ch:4051" (como
// aparece el mismo cheque en el extracto bancario, en conciliación)
// terminan siendo la misma clave para poder cruzarlos más adelante.
function normalizarNumeroCheque(valor) {
  const soloDigitos = String(valor ?? "").replace(/\D/g, "");
  if (!soloDigitos) return null;
  return soloDigitos.replace(/^0+/, "") || "0";
}

function normalizarNombreBanco(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// El Excel a veces trae la razón social completa ("Banco Credicoop
// Cooperativo Limitado") en vez del nombre corto que está dado de alta
// ("Banco Credicoop") — por eso, si no hay match exacto, se prueba si uno
// de los dos nombres normalizados está contenido en el otro. Si eso
// matchea más de un banco a la vez, no se adivina — la fila queda como
// "banco no reconocido" para revisar a mano (mismo criterio que el resto
// del sistema: 0 o 2+ candidatos nunca se resuelven solos).
function resolverBancoId(nombreExcel, bancos) {
  const normExcel = normalizarNombreBanco(nombreExcel);
  if (!normExcel) return null;

  for (const b of bancos) {
    if (normalizarNombreBanco(b.nombre) === normExcel) return b.id;
  }

  const candidatos = bancos.filter((b) => {
    const normBanco = normalizarNombreBanco(b.nombre);
    return normExcel.includes(normBanco) || normBanco.includes(normExcel);
  });
  return candidatos.length === 1 ? candidatos[0].id : null;
}

function claveDuplicado(bancoId, numeroCheque) {
  return `${bancoId}|${numeroCheque}`;
}

async function validarFilas(filas, bancos) {
  const { data: proveedoresData } = await supabase.from("proveedores").select("id, cuit, nombre");

  const cuitAProveedorId = new Map();
  for (const p of proveedoresData ?? []) {
    const cuit = normalizarCuit(p.cuit);
    if (cuit) cuitAProveedorId.set(cuit, p.id);
  }

  // Bancos que aparecen en el archivo, para traer de la base solo los
  // cheques ya cargados de esos bancos (no hace falta pedir la tabla
  // entera para chequear duplicados).
  const bancoIdsEnArchivo = new Set();
  const filasPreprocesadas = filas.map((fila) => {
    const bancoId = resolverBancoId(fila.bancoNombre, bancos);
    if (bancoId) bancoIdsEnArchivo.add(bancoId);
    return { fila, bancoId };
  });

  const clavesExistentes = new Set();
  if (bancoIdsEnArchivo.size > 0) {
    const { data: existentes } = await supabase
      .from("cheques_emitidos")
      .select("banco_id, numero_cheque")
      .in("banco_id", Array.from(bancoIdsEnArchivo));
    for (const c of existentes ?? []) {
      clavesExistentes.add(claveDuplicado(c.banco_id, c.numero_cheque));
    }
  }

  const validas = [];
  const errores = [];
  const duplicados = [];
  const clavesEnArchivo = new Set();
  const proveedoresNuevos = new Map(); // cuit -> nombre
  const porEstado = { pendiente: 0, en_proceso: 0, cobrado: 0, rechazado: 0 };

  filasPreprocesadas.forEach(({ fila, bancoId }, index) => {
    const numeroFila = index + 2; // encabezado + índice desde 0

    const numeroCheque = normalizarNumeroCheque(fila.numeroCheque);
    const fecha = parsearFecha(fila.fecha);
    const monto = parseMonto(fila.monto);
    const cuit = normalizarCuit(fila.cuit);
    const beneficiario = String(fila.beneficiario ?? "").trim();
    const estadoBancoNorm = String(fila.estadoBanco ?? "")
      .trim()
      .toUpperCase();
    const estado = ESTADOS_BANCO[estadoBancoNorm];

    // Fila totalmente vacía (separadores, fila en blanco al final) — se
    // saltea en silencio, no es un cheque real.
    if (!numeroCheque && !fecha && !monto && !beneficiario && !cuit && !fila.estadoBanco) return;

    const problemas = [];
    if (!numeroCheque) problemas.push("falta el número de cheque");
    if (!fecha) problemas.push(`fecha de pago no reconocida ("${fila.fecha}")`);
    if (monto === null || monto <= 0) problemas.push(`"Monto" no es un número válido`);
    if (!cuit) problemas.push("falta el CUIT del beneficiario");
    if (!beneficiario) problemas.push("falta el nombre del beneficiario");
    if (!estado) problemas.push(`estado "${fila.estadoBanco}" no reconocido`);
    if (!bancoId)
      problemas.push(
        `el banco "${fila.bancoNombre || "(vacío)"}" no está dado de alta — creálo primero en la base`
      );

    if (problemas.length > 0) {
      errores.push({
        fila: numeroFila,
        detalle: `Cheque ${fila.numeroCheque || "?"} — ${beneficiario || cuit || "?"}`,
        problemas,
      });
      return;
    }

    const clave = claveDuplicado(bancoId, numeroCheque);
    if (clavesExistentes.has(clave)) {
      duplicados.push({
        fila: numeroFila,
        detalle: `Cheque ${numeroCheque} — ${beneficiario}`,
        motivo: "ya estaba importado",
      });
      return;
    }
    if (clavesEnArchivo.has(clave)) {
      duplicados.push({
        fila: numeroFila,
        detalle: `Cheque ${numeroCheque} — ${beneficiario}`,
        motivo: "repetido en el mismo archivo",
      });
      return;
    }
    clavesEnArchivo.add(clave);

    const proveedorId = cuitAProveedorId.get(cuit) ?? null;
    if (!proveedorId && !proveedoresNuevos.has(cuit)) {
      proveedoresNuevos.set(cuit, beneficiario);
    }

    porEstado[estado]++;

    validas.push({
      numero_cheque: numeroCheque,
      banco_id: bancoId,
      fecha_pago: fecha,
      monto,
      proveedorId,
      proveedorCuit: cuit,
      estado,
    });
  });

  return { validas, errores, duplicados, proveedoresNuevos, porEstado };
}

export default function ImportarChequesEmitidos({ bancos, onImportado }) {
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
      const buffer = await file.arrayBuffer();
      const filas = await leerFilasXlsx(buffer);

      if (filas.length === 0) {
        throw new Error(
          "No se encontraron filas de datos. Confirmá que el archivo tenga los encabezados en la primera fila."
        );
      }

      setResultado(await validarFilas(filas, bancos));
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
      // 1. Crear los proveedores nuevos (una sola vez por CUIT, aunque el
      // mismo beneficiario tenga varios cheques en el archivo).
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

      // 2. Insertar los cheques, resolviendo el proveedor definitivo.
      const filasAInsertar = resultado.validas.map((v) => ({
        numero_cheque: v.numero_cheque,
        banco_id: v.banco_id,
        fecha_pago: v.fecha_pago,
        monto: v.monto,
        proveedor_id: v.proveedorId ?? cuitAId.get(v.proveedorCuit),
        estado: v.estado,
      }));

      const { error: errCheques } = await supabase.from("cheques_emitidos").insert(filasAInsertar);

      if (errCheques) {
        throw new Error(
          errCheques.code === "23505"
            ? "Se encontró un duplicado justo al importar (puede que alguien haya importado el mismo archivo en paralelo). No se importó nada de este lote — probá de nuevo."
            : errCheques.message
        );
      }

      const desglose = Object.entries(resultado.porEstado)
        .filter(([, cant]) => cant > 0)
        .map(([estado, cant]) => `${cant} ${ETIQUETA_ESTADO_CHEQUE[estado].toLowerCase()}`)
        .join(", ");

      setExito(
        `Se importaron ${filasAInsertar.length} cheques (${desglose}). ` +
          `Se saltearon ${resultado.duplicados.length} por estar duplicados. ` +
          `Se crearon ${nuevosArray.length} proveedores nuevos.`
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
          <h2 className="text-lg font-semibold text-primary">Importar e-cheques (Credicoop)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Subí el Excel del listado de e-cheques — encabezados en la primera fila. Se importan
            sin factura vinculada; después los vinculás a mano acá abajo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          {abierto ? "Cerrar" : "Importar cheques"}
        </button>
      </div>

      {abierto && (
        <div className="mt-4">
          <input
            type="file"
            accept=".xlsx,.xls"
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
            <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{exito}</p>
          )}

          {resultado && (
            <div className="mt-4">
              <p className="text-sm font-medium text-primary">
                {resultado.validas.length} cheques listos para importar
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
                {importando ? "Importando..." : `Confirmar importación (${resultado.validas.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
