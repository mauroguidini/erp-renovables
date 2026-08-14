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
  const encabezados = parseLineaCsv(lineas[0]).map((h) =>
    h.trim().toLowerCase()
  );
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
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
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

function parseFecha(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  if (typeof valor === "string") {
    const texto = valor.trim();
    const conBarras = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (conBarras) {
      const [, d, m, y] = conBarras;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  }
  return null;
}

function validarFilas(filas, hitos) {
  const validas = [];
  const errores = [];

  filas.forEach((fila, index) => {
    const numeroFila = index + 2;
    const descripcion = String(fila.descripcion ?? "").trim();
    const responsable = String(fila.responsable ?? "").trim();
    const nombreHito = String(fila.hito ?? "").trim();
    const fechaLimite = parseFecha(fila.fecha_limite);
    const valorFechaInicio = String(fila.fecha_inicio ?? "").trim();
    const fechaInicio = valorFechaInicio ? parseFecha(fila.fecha_inicio) : null;

    const problemas = [];
    if (!descripcion) problemas.push("falta la descripción");
    if (!fechaLimite) {
      problemas.push(
        `"fecha_limite" no se entiende ("${fila.fecha_limite}"), usá DD/MM/AAAA o AAAA-MM-DD`
      );
    }
    if (valorFechaInicio && !fechaInicio) {
      problemas.push(
        `"fecha_inicio" no se entiende ("${fila.fecha_inicio}"), usá DD/MM/AAAA o AAAA-MM-DD`
      );
    }

    let hitoId = null;
    if (nombreHito) {
      const encontrado = hitos.find(
        (h) => h.nombre.trim().toLowerCase() === nombreHito.toLowerCase()
      );
      if (encontrado) {
        hitoId = encontrado.id;
      } else {
        problemas.push(
          `el hito "${nombreHito}" no existe en esta obra (revisá que el nombre sea exactamente igual)`
        );
      }
    }

    if (problemas.length > 0) {
      errores.push({
        fila: numeroFila,
        descripcion: descripcion || "(sin descripción)",
        problemas,
      });
    } else {
      validas.push({
        descripcion,
        responsable: responsable || null,
        hito_id: hitoId,
        fecha_inicio: fechaInicio,
        fecha_limite: fechaLimite,
        tipo: "programada",
      });
    }
  });

  return { validas, errores };
}

async function descargarPlantilla() {
  const XLSX = await import("xlsx");

  const columnas = ["descripcion", "responsable", "hito", "fecha_inicio", "fecha_limite"];
  const filaEjemplo = {
    descripcion: "Instalar estructura de montaje",
    responsable: "Juan Pérez",
    hito: "Estructura",
    fecha_inicio: "10/08/2026",
    fecha_limite: "15/08/2026",
  };

  const hoja = XLSX.utils.json_to_sheet([filaEjemplo], { header: columnas });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Plan de trabajo");

  const hojaAyuda = XLSX.utils.aoa_to_sheet([
    ["fecha_limite acepta DD/MM/AAAA o AAAA-MM-DD"],
    ["responsable es opcional"],
    ["hito es opcional — tiene que ser el nombre EXACTO de un hito ya creado en esta obra"],
    ["si dejás \"hito\" vacío, o no lo incluís, la tarea entra sin hito asignado"],
    ["fecha_inicio es opcional, mismo formato que fecha_limite"],
  ]);
  XLSX.utils.book_append_sheet(libro, hojaAyuda, "Ayuda");

  XLSX.writeFile(libro, "plantilla_plan_trabajo.xlsx");
}

export default function ImportarPlanTrabajo({ obraId, hitos, onImportado }) {
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

      setResultado(validarFilas(filas, hitos));
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

    const { error } = await supabase.from("ordenes_trabajo").insert(
      resultado.validas.map((v) => ({ ...v, obra_id: obraId }))
    );

    if (error) {
      setErrorImportar(error.message);
    } else {
      setExito(
        `Se importaron ${resultado.validas.length} tareas al plan de trabajo.`
      );
      setResultado(null);
      setArchivo(null);
      onImportado?.();
    }
    setImportando(false);
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="text-sm font-medium text-primary hover:underline"
      >
        {abierto ? "Cerrar importador" : "Importar plan de trabajo"}
      </button>

      {abierto && (
        <div className="mt-3 rounded-md border border-zinc-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={descargarPlantilla}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Descargar plantilla
            </button>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleArchivoSeleccionado}
              className="text-sm text-zinc-700"
            />
          </div>

          {validando && (
            <p className="mt-3 text-sm text-zinc-600">Validando archivo...</p>
          )}

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
              <p className="text-sm font-medium text-zinc-900">
                {resultado.validas.length} de{" "}
                {resultado.validas.length + resultado.errores.length} filas
                listas para importar.
              </p>

              {resultado.errores.length > 0 && (
                <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm font-medium text-yellow-800">
                    {resultado.errores.length} filas con errores (no se van a
                    importar):
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-yellow-800">
                    {resultado.errores.map((e) => (
                      <li key={e.fila}>
                        Fila {e.fila} ({e.descripcion}): {e.problemas.join(", ")}
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
