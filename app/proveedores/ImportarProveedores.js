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

function validarFilas(filas, nombresExistentes) {
  const nombresEnArchivo = new Set();
  const validas = [];
  const errores = [];

  filas.forEach((fila, index) => {
    const numeroFila = index + 2; // +1 por el encabezado, +1 porque index arranca en 0
    const nombre = String(fila.nombre ?? "").trim();
    const nombreClave = nombre.toLowerCase();
    const contactoTelefono = String(fila.contacto_telefono ?? "").trim();
    const contactoEmail = String(fila.contacto_email ?? "").trim();
    const direccion = String(fila.direccion ?? "").trim();
    const cuit = String(fila.cuit ?? "").trim();

    const problemas = [];

    if (!nombre) problemas.push("falta el nombre");

    if (nombre && nombresExistentes.has(nombreClave)) {
      problemas.push(`ya existe un proveedor llamado "${nombre}"`);
    }
    if (nombre && nombresEnArchivo.has(nombreClave)) {
      problemas.push(`el nombre "${nombre}" está repetido en el archivo`);
    }

    if (nombre) nombresEnArchivo.add(nombreClave);

    if (problemas.length > 0) {
      errores.push({ fila: numeroFila, nombre: nombre || "(sin nombre)", problemas });
    } else {
      validas.push({
        nombre,
        contacto_telefono: contactoTelefono || null,
        contacto_email: contactoEmail || null,
        direccion: direccion || null,
        cuit: cuit || null,
      });
    }
  });

  return { validas, errores };
}

async function descargarPlantilla() {
  const XLSX = await import("xlsx");

  const columnas = ["nombre", "contacto_telefono", "contacto_email", "direccion", "cuit"];
  const filaEjemplo = {
    nombre: "Distribuidora Solar SA",
    contacto_telefono: "011-4444-5555",
    contacto_email: "ventas@distribuidorasolar.com",
    direccion: "Av. Siempre Viva 123, CABA",
    cuit: "30-12345678-9",
  };

  const hoja = XLSX.utils.json_to_sheet([filaEjemplo], { header: columnas });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Proveedores");

  const hojaAyuda = XLSX.utils.aoa_to_sheet([
    ["Solo \"nombre\" es obligatorio."],
    ["El resto de las columnas puede quedar vacío."],
  ]);
  XLSX.utils.book_append_sheet(libro, hojaAyuda, "Ayuda");

  XLSX.writeFile(libro, "plantilla_proveedores.xlsx");
}

export default function ImportarProveedores({ onProveedoresImportados }) {
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
        .from("proveedores")
        .select("nombre");
      if (error) throw new Error(error.message);

      const nombresExistentes = new Set(
        (existentes ?? []).map((p) => p.nombre.trim().toLowerCase())
      );
      setResultado(validarFilas(filas, nombresExistentes));
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

    const { error } = await supabase.from("proveedores").insert(resultado.validas);

    if (error) {
      setErrorImportar(error.message);
    } else {
      setExito(`Se importaron ${resultado.validas.length} proveedores correctamente.`);
      setResultado(null);
      setArchivo(null);
      onProveedoresImportados?.();
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
            {abierto ? "Cerrar" : "Importar proveedores"}
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
