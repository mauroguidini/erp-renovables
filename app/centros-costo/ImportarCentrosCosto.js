"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

function leerFilasCsv(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length === 0) return [];
  const encabezados = parseLineaCsv(lineas[0]).map((h) => h.trim().toLowerCase());
  return lineas.slice(1).map((linea) => {
    const valores = parseLineaCsv(linea);
    const objeto = {};
    encabezados.forEach((clave, i) => {
      objeto[clave] = (valores[i] ?? "").trim();
    });
    return objeto;
  });
}

async function leerFilasXlsx(arrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

  return filas.map((fila) => {
    const normalizada = {};
    Object.keys(fila).forEach((clave) => {
      normalizada[clave.trim().toLowerCase()] = fila[clave];
    });
    return normalizada;
  });
}

// Busca la obra por nombre exacto (sin importar mayúsculas/espacios). Si no
// la encuentra, NO es un error: el centro se carga igual, sin vincular —
// la obra se puede vincular después a mano, tal como pediste.
function buscarObraId(nombreObra, obras) {
  if (!nombreObra) return { obraId: null, encontrada: true };
  const clave = nombreObra.trim().toLowerCase();
  const obra = obras.find((o) => o.direccion.trim().toLowerCase() === clave);
  return { obraId: obra?.id ?? null, encontrada: !!obra };
}

function validarFilas(filas, numerosExistentes, nombresExistentes, obras) {
  const numerosEnArchivo = new Set();
  const nombresEnArchivo = new Set();
  const validas = [];
  const errores = [];
  const avisos = [];

  filas.forEach((fila, index) => {
    const numeroFila = index + 2;
    const numeroTexto = String(fila.numero ?? "").trim();
    const nombre = String(fila.nombre ?? "").trim();
    const nombreClave = nombre.toLowerCase();
    const tipoTexto = String(fila.tipo ?? "").trim().toLowerCase();
    const obraTexto = String(fila.obra ?? "").trim();

    const problemas = [];

    const numero = Number(numeroTexto);
    if (!numeroTexto || Number.isNaN(numero) || !Number.isInteger(numero)) {
      problemas.push(`"numero" no es válido ("${fila.numero}")`);
    } else {
      if (numerosExistentes.has(numero)) problemas.push(`el número ${numero} ya existe`);
      if (numerosEnArchivo.has(numero)) problemas.push(`el número ${numero} está repetido en el archivo`);
    }

    if (!nombre) problemas.push("falta el nombre");
    if (nombre && nombresExistentes.has(nombreClave)) {
      problemas.push(`ya existe un centro llamado "${nombre}"`);
    }
    if (nombre && nombresEnArchivo.has(nombreClave)) {
      problemas.push(`el nombre "${nombre}" está repetido en el archivo`);
    }

    let tipo = null;
    if (tipoTexto === "obra" || tipoTexto === "general") {
      tipo = tipoTexto;
    } else {
      problemas.push(`"tipo" tiene que ser "obra" o "general" (vino "${fila.tipo}")`);
    }

    let obraId = null;
    if (tipo === "obra" && obraTexto) {
      const { obraId: id, encontrada } = buscarObraId(obraTexto, obras);
      obraId = id;
      if (!encontrada) {
        avisos.push(`Fila ${numeroFila} (${nombre}): no se encontró la obra "${obraTexto}", se carga sin vincular.`);
      }
    }

    if (numeroTexto && !Number.isNaN(numero)) numerosEnArchivo.add(numero);
    if (nombre) nombresEnArchivo.add(nombreClave);

    if (problemas.length > 0) {
      errores.push({ fila: numeroFila, nombre: nombre || "(sin nombre)", problemas });
    } else {
      validas.push({ numero, nombre, tipo, obra_id: tipo === "obra" ? obraId : null });
    }
  });

  return { validas, errores, avisos };
}

async function descargarPlantilla() {
  const XLSX = await import("xlsx");

  const columnas = ["numero", "nombre", "tipo", "obra"];
  const filasEjemplo = [
    { numero: 100, nombre: "Administración", tipo: "general", obra: "" },
    { numero: 200, nombre: "Vehículos", tipo: "general", obra: "" },
    { numero: 301, nombre: "Obra Cangallo", tipo: "obra", obra: "Cangallo 1234" },
  ];

  const hoja = XLSX.utils.json_to_sheet(filasEjemplo, { header: columnas });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Centros de costos");

  const hojaAyuda = XLSX.utils.aoa_to_sheet([
    ['"tipo": escribir "obra" o "general".'],
    ['"obra": opcional. Tiene que coincidir EXACTO con la dirección de una obra ya cargada'],
    ["en el sistema (Obras > el dato \"Dirección\"). Si no coincide o la obra todavía no"],
    ["existe, el centro se carga igual, sin vincular — se puede vincular después a mano."],
    ["Dejar vacío si el tipo es \"general\"."],
  ]);
  XLSX.utils.book_append_sheet(libro, hojaAyuda, "Ayuda");

  XLSX.writeFile(libro, "plantilla_centros_costo.xlsx");
}

export default function ImportarCentrosCosto({ obras, onCentrosImportados }) {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState(null);
  const [validando, setValidando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorLectura, setErrorLectura] = useState(null);

  const [importando, setImportando] = useState(false);
  const [errorImportar, setErrorImportar] = useState(null);
  const [exito, setExito] = useState(null);

  async function handleArchivoSeleccionado(e) {
    const file = e.target.files?.[0] ?? null;
    setArchivo(file);
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

      const { data: existentes, error } = await supabase
        .from("centros_costo")
        .select("numero, nombre");
      if (error) throw new Error(error.message);

      const numerosExistentes = new Set((existentes ?? []).map((c) => c.numero));
      const nombresExistentes = new Set(
        (existentes ?? []).map((c) => c.nombre.trim().toLowerCase())
      );
      setResultado(validarFilas(filas, numerosExistentes, nombresExistentes, obras));
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

    const { error } = await supabase.from("centros_costo").insert(resultado.validas);

    if (error) {
      setErrorImportar(error.message);
    } else {
      setExito(`Se importaron ${resultado.validas.length} centros de costos correctamente.`);
      setResultado(null);
      setArchivo(null);
      onCentrosImportados?.();
    }
    setImportando(false);
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">Importación masiva</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={descargarPlantilla}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Descargar plantilla
          </button>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
          >
            {abierto ? "Cerrar" : "Importar centros"}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="mt-4">
          <input
            type="file"
            accept=".xlsx,.csv"
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
                {resultado.validas.length} de{" "}
                {resultado.validas.length + resultado.errores.length} filas listas para
                importar.
              </p>

              {resultado.avisos.length > 0 && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <ul className="space-y-1 text-sm text-blue-800">
                    {resultado.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {resultado.errores.length > 0 && (
                <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm font-medium text-yellow-800">
                    {resultado.errores.length} filas con errores (no se van a importar):
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-yellow-800">
                    {resultado.errores.map((e) => (
                      <li key={e.fila}>
                        Fila {e.fila} ({e.nombre}): {e.problemas.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {errorImportar && (
                <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                  Error al importar: {errorImportar}
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
