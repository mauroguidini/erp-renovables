"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const CATEGORIAS = [
  "panel",
  "inversor",
  "bateria",
  "estructura",
  "cableado",
  "otro",
];

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

function validarFilas(filas, codigosExistentes) {
  const codigosEnArchivo = new Set();
  const validas = [];
  const errores = [];

  filas.forEach((fila, index) => {
    const numeroFila = index + 2; // +1 por el encabezado, +1 porque index arranca en 0
    const codigo = String(fila.codigo ?? "").trim();
    const nombre = String(fila.nombre ?? "").trim();
    const descripcion = String(fila.descripcion ?? "").trim();
    const categoria = String(fila.categoria ?? "").trim().toLowerCase();
    const unidadMedida = String(fila.unidad_medida ?? "").trim() || "unidad";
    const requiereTexto = String(fila.requiere_numero_serie ?? "")
      .trim()
      .toLowerCase();
    const stockMinimoTexto = String(fila.stock_minimo ?? "").trim();

    const problemas = [];

    if (!codigo) problemas.push("falta el código");
    if (!nombre) problemas.push("falta el nombre");

    if (!categoria) {
      problemas.push("falta la categoría");
    } else if (!CATEGORIAS.includes(categoria)) {
      problemas.push(`la categoría "${fila.categoria}" no es válida`);
    }

    if (codigo && codigosExistentes.has(codigo)) {
      problemas.push(`el código "${codigo}" ya existe en el catálogo`);
    }
    if (codigo && codigosEnArchivo.has(codigo)) {
      problemas.push(`el código "${codigo}" está repetido en el archivo`);
    }

    let requiereNumeroSerie = false;
    if (["si", "sí", "true", "1", "x", ""].includes(requiereTexto)) {
      requiereNumeroSerie = ["si", "sí", "true", "1", "x"].includes(
        requiereTexto
      );
    } else if (["no", "false", "0"].includes(requiereTexto)) {
      requiereNumeroSerie = false;
    } else {
      problemas.push(
        `"requiere_numero_serie" no se entiende ("${fila.requiere_numero_serie}"), usá "si" o "no"`
      );
    }

    let stockMinimo = 0;
    if (stockMinimoTexto) {
      const num = Number(stockMinimoTexto.replace(",", "."));
      if (Number.isNaN(num)) {
        problemas.push(
          `"stock_minimo" no es un número ("${fila.stock_minimo}")`
        );
      } else {
        stockMinimo = num;
      }
    }

    if (codigo) codigosEnArchivo.add(codigo);

    if (problemas.length > 0) {
      errores.push({
        fila: numeroFila,
        codigo: codigo || "(sin código)",
        problemas,
      });
    } else {
      validas.push({
        codigo,
        nombre,
        descripcion: descripcion || null,
        categoria,
        unidad_medida: unidadMedida,
        requiere_numero_serie: requiereNumeroSerie,
        stock_minimo: stockMinimo,
      });
    }
  });

  return { validas, errores };
}

async function descargarPlantilla() {
  const XLSX = await import("xlsx");

  const columnas = [
    "codigo",
    "nombre",
    "descripcion",
    "categoria",
    "unidad_medida",
    "requiere_numero_serie",
    "stock_minimo",
  ];
  const filaEjemplo = {
    codigo: "PAN-450W",
    nombre: "Panel solar 450W",
    descripcion: "Panel monocristalino 450W",
    categoria: "panel",
    unidad_medida: "unidad",
    requiere_numero_serie: "si",
    stock_minimo: 5,
  };

  const hojaProductos = XLSX.utils.json_to_sheet([filaEjemplo], {
    header: columnas,
  });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaProductos, "Productos");

  const hojaAyuda = XLSX.utils.aoa_to_sheet([
    ["Categorías válidas:"],
    ...CATEGORIAS.map((c) => [c]),
    [],
    ['requiere_numero_serie: escribir "si" o "no"'],
  ]);
  XLSX.utils.book_append_sheet(libro, hojaAyuda, "Ayuda");

  XLSX.writeFile(libro, "plantilla_productos.xlsx");
}

export default function ImportarProductos({ onProductosImportados }) {
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
        .from("productos")
        .select("codigo");
      if (error) throw new Error(error.message);

      const codigosExistentes = new Set(
        (existentes ?? []).map((p) => p.codigo)
      );
      setResultado(validarFilas(filas, codigosExistentes));
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

    const { error } = await supabase
      .from("productos")
      .insert(resultado.validas);

    if (error) {
      setErrorImportar(error.message);
    } else {
      setExito(
        `Se importaron ${resultado.validas.length} productos correctamente.`
      );
      setResultado(null);
      setArchivo(null);
      onProductosImportados?.();
    }
    setImportando(false);
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">
          Importación masiva
        </h2>
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
            {abierto ? "Cerrar" : "Importar productos"}
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
              <p className="text-sm font-medium text-primary">
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
                        Fila {e.fila} ({e.codigo}): {e.problemas.join(", ")}
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
