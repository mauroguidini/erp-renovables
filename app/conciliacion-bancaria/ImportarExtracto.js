"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  normalizarTexto,
  clasificar,
  esIngresoCheque,
  esRechazoCheque,
  extraerNumeroCheque,
} from "./clasificacionMovimientos";

// Columnas que nos interesan del extracto bancario, buscadas por palabra
// clave (no por texto exacto) porque no tenemos un archivo real de
// Credicoop a mano para confirmar el encabezado exacto — esto es lo más
// flexible que se puede armar sin eso. Si al probarlo con un extracto real
// alguna columna no se detecta bien, se ajusta esta lista.
const PALABRAS_CLAVE = {
  fecha: "fecha",
  concepto: "concepto", // también matchea "descripcion" más abajo
  numeroComprobante: "comprobante",
  debito: "debito",
  credito: "credito",
  saldo: "saldo",
};

function detectarColumna(encabezadoNorm) {
  if (encabezadoNorm.includes(PALABRAS_CLAVE.fecha)) return "fecha";
  if (encabezadoNorm.includes(PALABRAS_CLAVE.concepto) || encabezadoNorm.includes("descripcion"))
    return "concepto";
  if (encabezadoNorm.includes(PALABRAS_CLAVE.numeroComprobante) || encabezadoNorm.includes("numero"))
    return "numeroComprobante";
  if (encabezadoNorm.includes(PALABRAS_CLAVE.debito)) return "debito";
  if (encabezadoNorm.includes(PALABRAS_CLAVE.credito)) return "credito";
  if (encabezadoNorm.includes(PALABRAS_CLAVE.saldo)) return "saldo";
  return null;
}

function remapearFila(filaOriginal) {
  const remapeada = {};
  for (const [clave, valor] of Object.entries(filaOriginal)) {
    const destino = detectarColumna(normalizarTexto(clave));
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

// Admite "1234.56", "1234,56" o el formato argentino "1.234,56". Vacío
// devuelve 0 (débito/crédito solo tienen valor en uno de los dos lados).
function parseMonto(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return 0;
  let limpio = texto;
  if (limpio.includes(",") && limpio.includes(".")) {
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (limpio.includes(",")) {
    limpio = limpio.replace(",", ".");
  }
  const num = Number(limpio);
  return Number.isNaN(num) ? null : num;
}

// Dígito verificador oficial de CUIT (módulo 11) — para no confundir un
// número de comprobante largo con un CUIT real dentro del concepto.
function cuitValido(digitos) {
  if (digitos.length !== 11) return false;
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = multiplicadores.reduce((acc, m, i) => acc + m * Number(digitos[i]), 0);
  let verificador = 11 - (suma % 11);
  if (verificador === 11) verificador = 0;
  if (verificador === 10) return false;
  return verificador === Number(digitos[10]);
}

const PREFIJOS_CUIT_VALIDOS = new Set(["20", "23", "24", "25", "26", "27", "30", "33", "34"]);

// Busca en el texto del concepto una secuencia de 11 dígitos (con o sin
// guiones) que tenga forma de CUIT válido. Ojo: NO se puede usar \b como
// límite izquierdo — si el CUIT viene pegado a una palabra sin espacio
// (ej. "CUIT30693269004"), letra y dígito cuentan como "la misma palabra"
// y \b no corta ahí. Por eso se usa un lookbehind que solo exige que no
// haya OTRO dígito inmediatamente antes (para no agarrar un pedazo de un
// número más largo), sin importar qué letra lo precede.
function extraerCuit(texto) {
  const regex = /(?<!\d)(\d{2})-?(\d{8})-?(\d)(?!\d)/g;
  let match;
  while ((match = regex.exec(texto)) !== null) {
    const digitos = match[1] + match[2] + match[3];
    if (PREFIJOS_CUIT_VALIDOS.has(match[1]) && cuitValido(digitos)) {
      return digitos;
    }
  }
  return null;
}

function claveDuplicado(bancoId, fecha, numeroComprobante, debito, credito, saldo) {
  return `${bancoId}|${fecha}|${numeroComprobante ?? ""}|${debito}|${credito}|${saldo ?? ""}`;
}

// Empareja eCheques por número de cheque — NUNCA por monto, porque puede
// haber varios cheques por el mismo importe. Revisa dos fuentes para la
// contrapartida: otras filas de este mismo archivo (por si el ingreso y
// el rechazo vienen juntos) y movimientos ya importados antes (por si
// quedaron en archivos distintos — lo más común, porque un cheque suele
// rebotar semanas después de haber entrado). Si no encuentra pareja en
// ninguna de las dos, la fila queda como estaba (sin emparejar, para
// revisar a mano) — nunca se fuerza un match.
async function emparejarCheques(validas, bancoId) {
  const conNumero = validas.filter((v) => v.numero_cheque);
  if (conNumero.length === 0) return [];

  const { data: existentesSinPareja } = await supabase
    .from("movimientos_bancarios")
    .select("id, numero_cheque, debito, credito")
    .eq("banco_id", bancoId)
    .is("cheque_pareja_id", null)
    .not("numero_cheque", "is", null);

  const actualizacionesDb = [];

  for (const fila of conNumero) {
    if (fila.cheque_pareja_id) continue; // ya se emparejó con otra fila de este archivo

    const esIngreso = fila.credito > 0;

    // 1) ¿Hay otra fila del mismo archivo, del tipo opuesto, con el mismo
    //    número de cheque, todavía sin pareja?
    const parejaEnArchivo = conNumero.find(
      (otra) =>
        otra !== fila &&
        !otra.cheque_pareja_id &&
        otra.numero_cheque === fila.numero_cheque &&
        (otra.credito > 0) !== esIngreso
    );
    if (parejaEnArchivo) {
      fila.cheque_pareja_id = parejaEnArchivo.id;
      parejaEnArchivo.cheque_pareja_id = fila.id;
      if (!esIngreso) {
        fila.estado = "clasificado";
        fila.clasificacion = "cheque_rechazado";
      } else {
        parejaEnArchivo.estado = "clasificado";
        parejaEnArchivo.clasificacion = "cheque_rechazado";
      }
      continue;
    }

    // 2) ¿Hay un movimiento ya importado antes, del tipo opuesto, con el
    //    mismo número de cheque, todavía sin pareja?
    const parejaExistente = (existentesSinPareja ?? []).find(
      (otra) => otra.numero_cheque === fila.numero_cheque && (otra.credito > 0) !== esIngreso
    );
    if (parejaExistente) {
      fila.cheque_pareja_id = parejaExistente.id;
      if (!esIngreso) {
        fila.estado = "clasificado";
        fila.clasificacion = "cheque_rechazado";
      }
      actualizacionesDb.push({
        id: parejaExistente.id,
        cheque_pareja_id: fila.id,
        // Si el que ya estaba importado es el rechazo (débito) y recién
        // ahora aparece su ingreso, es a él a quien hay que marcarle la
        // clasificación — el ingreso (crédito) no la necesita.
        ...(parejaExistente.debito > 0
          ? { estado: "clasificado", clasificacion: "cheque_rechazado" }
          : {}),
      });
    }
  }

  return actualizacionesDb;
}

async function validarFilas(filas, bancoId) {
  const { data: existentes } = await supabase
    .from("movimientos_bancarios")
    .select("fecha, numero_comprobante, debito, credito, saldo")
    .eq("banco_id", bancoId);

  const clavesExistentes = new Set(
    (existentes ?? []).map((m) =>
      claveDuplicado(bancoId, m.fecha, m.numero_comprobante, m.debito, m.credito, m.saldo)
    )
  );

  const validas = [];
  const errores = [];
  const duplicados = [];
  const clavesEnArchivo = new Set();

  filas.forEach((fila, index) => {
    const numeroFila = index + 2; // encabezado + índice desde 0

    const fecha = parsearFecha(fila.fecha);
    const concepto = String(fila.concepto ?? "").trim();
    const debito = parseMonto(fila.debito);
    const credito = parseMonto(fila.credito);
    const saldo = fila.saldo === "" || fila.saldo == null ? null : parseMonto(fila.saldo);
    const numeroComprobante = String(fila.numeroComprobante ?? "").trim() || null;

    // Filas sin fecha ni concepto (separadores, totales al pie, etc.) se
    // saltean en silencio — no son un movimiento real.
    if (!fecha && !concepto) return;

    const problemas = [];
    if (!fecha) problemas.push(`fecha no reconocida ("${fila.fecha}")`);
    if (!concepto) problemas.push("falta el concepto");
    if (debito === null) problemas.push(`"Débito" no es un número`);
    if (credito === null) problemas.push(`"Crédito" no es un número`);
    if (saldo === null && fila.saldo) problemas.push(`"Saldo" no es un número`);

    if (problemas.length > 0) {
      errores.push({ fila: numeroFila, detalle: concepto || "(sin concepto)", problemas });
      return;
    }

    const clave = claveDuplicado(bancoId, fecha, numeroComprobante, debito, credito, saldo);
    if (clavesExistentes.has(clave)) {
      duplicados.push({ fila: numeroFila, detalle: concepto });
      return;
    }
    if (clavesEnArchivo.has(clave)) {
      duplicados.push({ fila: numeroFila, detalle: `${concepto} (repetido en el mismo archivo)` });
      return;
    }
    clavesEnArchivo.add(clave);

    const esDebito = debito > 0;
    const conceptoNorm = normalizarTexto(concepto);

    let clasificacion = null;
    let cuitDetectado = null;
    let numeroCheque = null;
    let estado = "no_aplica";

    // "Comisión por cheque rechazado" contiene "cheque" y "rechazado" pero
    // es un gasto bancario (lo agarra clasificar() más abajo, vía
    // "comision"), no el cheque en sí — hay que descartarlo antes de
    // entrar a la rama de cheques.
    const esComision = /comision/.test(conceptoNorm);

    if (!esComision && (esIngresoCheque(conceptoNorm) || esRechazoCheque(conceptoNorm))) {
      // El número (si el extracto lo trae) se resuelve en emparejarCheques
      // más abajo; si no lo trae, queda pendiente para emparejar por
      // monto+fecha desde la pantalla principal. En ningún caso pasa por
      // clasificar() ni por extraerCuit(): un cheque no es un pago directo
      // a un proveedor.
      numeroCheque = extraerNumeroCheque(concepto);
      estado = esDebito ? "pendiente" : "no_aplica";
    } else if (esDebito) {
      clasificacion = clasificar(conceptoNorm);
      if (clasificacion) {
        estado = "clasificado";
      } else {
        cuitDetectado = extraerCuit(concepto);
        estado = "pendiente";
      }
    }

    validas.push({
      id: crypto.randomUUID(),
      banco_id: bancoId,
      fecha,
      concepto,
      numero_comprobante: numeroComprobante,
      debito,
      credito,
      saldo,
      cuit_detectado: cuitDetectado,
      numero_cheque: numeroCheque,
      cheque_pareja_id: null,
      clasificacion,
      estado,
    });
  });

  const actualizacionesDb = await emparejarCheques(validas, bancoId);

  return { validas, errores, duplicados, actualizacionesDb };
}

export default function ImportarExtracto({ bancos, onImportado }) {
  const [abierto, setAbierto] = useState(false);
  const [bancoId, setBancoId] = useState("");

  // "bancos" llega asíncrono desde la pantalla (se carga de la base
  // después del primer render) — cuando aparece, se preselecciona el
  // primero, sin pisar una elección que el usuario ya haya hecho.
  useEffect(() => {
    if (!bancoId && bancos.length > 0) {
      setBancoId(bancos[0].id);
    }
  }, [bancos, bancoId]);
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

    if (!bancoId) {
      setErrorLectura("Elegí primero de qué banco es el extracto.");
      e.target.value = "";
      return;
    }

    setValidando(true);
    try {
      const buffer = await file.arrayBuffer();
      const filas = await leerFilasXlsx(buffer);

      if (filas.length === 0) {
        throw new Error("No se encontraron filas de datos en el archivo.");
      }

      setResultado(await validarFilas(filas, bancoId));
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

    const { error } = await supabase.from("movimientos_bancarios").insert(resultado.validas);

    if (error) {
      setErrorImportar(error.message);
      setImportando(false);
      return;
    }

    // Movimientos ya importados antes (de un archivo previo) cuya pareja de
    // cheque recién apareció ahora — hay que marcarlos a ellos también.
    for (const actualizacion of resultado.actualizacionesDb ?? []) {
      const { id, ...cambios } = actualizacion;
      await supabase.from("movimientos_bancarios").update(cambios).eq("id", id);
    }

    const clasificados = resultado.validas.filter((f) => f.estado === "clasificado").length;
    const pendientes = resultado.validas.filter((f) => f.estado === "pendiente").length;
    const chequesEmparejados =
      resultado.validas.filter((f) => f.cheque_pareja_id).length +
      (resultado.actualizacionesDb?.length ?? 0);

    setExito(
      `Se importaron ${resultado.validas.length} movimientos. ` +
        `${clasificados} se clasificaron solos, ${pendientes} quedaron pendientes de revisar. ` +
        (chequesEmparejados > 0
          ? `Se emparejaron ${chequesEmparejados} movimientos de cheques (ingreso + rechazo). `
          : "") +
        `Se saltearon ${resultado.duplicados.length} por estar duplicados.`
    );
    setResultado(null);
    setImportando(false);
    onImportado?.();
  }

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 sm:mt-6 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-primary sm:text-lg">Importar extracto</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Excel del banco (fecha, concepto, número de comprobante, débito, crédito, saldo).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          {abierto ? "Cerrar" : "Importar extracto"}
        </button>
      </div>

      {abierto && (
        <div className="mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700">Banco</label>
              <select
                value={bancoId}
                onChange={(e) => setBancoId(e.target.value)}
                className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                {bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Archivo (.xlsx)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleArchivoSeleccionado}
                className="mt-1 block text-sm text-zinc-700"
              />
            </div>
          </div>

          {validando && <p className="mt-3 text-sm text-zinc-600">Leyendo archivo...</p>}

          {errorLectura && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              No se pudo leer el archivo: {errorLectura}
            </p>
          )}

          {exito && (
            <p className="mt-3 rounded-md bg-green-50 px-2.5 py-1.5 text-xs text-green-700">{exito}</p>
          )}

          {resultado && (
            <div className="mt-4">
              <p className="text-sm font-medium text-primary">
                {resultado.validas.length} movimientos listos para importar
                {resultado.duplicados.length > 0 &&
                  ` · ${resultado.duplicados.length} saltados por duplicados`}
                {resultado.errores.length > 0 && ` · ${resultado.errores.length} con errores`}
              </p>

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
