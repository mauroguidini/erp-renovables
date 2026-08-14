"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function parseNumeroAr(str) {
  if (!str) return null;
  const limpio = str.replace(/\./g, "").replace(",", ".");
  const numero = parseFloat(limpio);
  return Number.isNaN(numero) ? null : numero;
}

// Líneas que casi seguro son datos de encabezado/pie de la factura
// (proveedor, cliente, fechas, totales) y no un renglón de producto.
const PALABRAS_DESCARTE =
  /cuit|dni|tel[eé]fono|^tel\b|email|correo|direcci[oó]n|domicilio|fecha|cliente|proveedor|raz[oó]n social|subtotal|^total\b|\btotal\b.*\$|iva|factura\s*n|n[uú]mero de factura|condici[oó]n|forma de pago|per[ií]odo|vencimiento|p[aá]gina/i;

function sugerirFilasDesdeTexto(texto) {
  const lineas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length < 120)
    .filter((l) => !PALABRAS_DESCARTE.test(l));

  return lineas
    .map((linea, i) => {
      // Exigimos un precio con pinta real (con centavos) para considerar que
      // la línea es un renglón de producto y no ruido del encabezado.
      const matchesPrecio = linea.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}/g);
      if (!matchesPrecio) return null;

      const matchCantidad = linea.match(/^(\d+)(?:[.,]\d+)?\s/);
      const precioTexto = matchesPrecio[matchesPrecio.length - 1];
      const precio = parseNumeroAr(precioTexto);
      const cantidad = matchCantidad ? Number(matchCantidad[1]) : 1;

      return {
        id: i,
        textoOriginal: linea,
        cantidad: cantidad || 1,
        precio,
        productoId: "",
        incluir: true,
      };
    })
    .filter(Boolean);
}

async function convertirPdfAImagenes(archivo) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await archivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const imagenes = [];

  for (let numeroPagina = 1; numeroPagina <= pdf.numPages; numeroPagina++) {
    const pagina = await pdf.getPage(numeroPagina);
    const viewport = pagina.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await pagina.render({ canvasContext: canvas.getContext("2d"), viewport })
      .promise;
    imagenes.push(canvas.toDataURL("image/png"));
  }

  return imagenes;
}

async function leerTextoDeImagen(imagenSrc, onProgreso) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("spa", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        onProgreso(Math.round(m.progress * 100));
      }
    },
  });
  const { data } = await worker.recognize(imagenSrc);
  await worker.terminate();
  return data.text;
}

export default function LectorFactura({ compraId, productos, onItemsAgregados }) {
  const [archivo, setArchivo] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [progreso, setProgreso] = useState(0);
  const [errorLectura, setErrorLectura] = useState(null);

  const [filas, setFilas] = useState([]);

  const [agregando, setAgregando] = useState(false);
  const [errorAgregar, setErrorAgregar] = useState(null);

  async function handleLeerFactura() {
    if (!archivo) return;

    setLeyendo(true);
    setErrorLectura(null);
    setFilas([]);
    setProgreso(0);

    try {
      let imagenes;
      if (archivo.type === "application/pdf") {
        setEtapa("Convirtiendo PDF a imagen...");
        imagenes = await convertirPdfAImagenes(archivo);
      } else {
        imagenes = [archivo];
      }

      setEtapa("Leyendo texto...");
      let textoCompleto = "";
      for (let i = 0; i < imagenes.length; i++) {
        const texto = await leerTextoDeImagen(imagenes[i], (p) => {
          setProgreso(Math.round(((i + p / 100) / imagenes.length) * 100));
        });
        textoCompleto += texto + "\n";
      }

      setFilas(sugerirFilasDesdeTexto(textoCompleto));
    } catch (err) {
      setErrorLectura(err.message);
    } finally {
      setLeyendo(false);
      setEtapa("");
    }
  }

  function actualizarFila(id, campo, valor) {
    setFilas((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f))
    );
  }

  function quitarFila(id) {
    setFilas((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleAgregarSeleccionadas() {
    const seleccionadas = filas.filter((f) => f.incluir && f.productoId);
    if (seleccionadas.length === 0) return;

    setAgregando(true);
    setErrorAgregar(null);

    const { error } = await supabase.from("compra_items").insert(
      seleccionadas.map((f) => ({
        compra_id: compraId,
        producto_id: f.productoId,
        cantidad: Number(f.cantidad) || 1,
        precio_costo: f.precio != null ? Number(f.precio) : null,
      }))
    );

    if (error) {
      setErrorAgregar(error.message);
    } else {
      setFilas([]);
      setArchivo(null);
      onItemsAgregados?.();
    }
    setAgregando(false);
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-primary">Leer factura</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Subí un PDF o una foto de la factura. El programa lee el texto
        automáticamente (sin mandarlo a ningún servicio externo) y te sugiere
        renglones con cantidad y precio — vos revisás cada uno y elegís a qué
        producto de tu catálogo corresponde antes de agregarlo.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="text-sm text-zinc-700"
        />
        <button
          type="button"
          onClick={handleLeerFactura}
          disabled={!archivo || leyendo}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {leyendo ? `${etapa} ${progreso}%` : "Leer factura"}
        </button>
      </div>

      {errorLectura && (
        <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          Error al leer la factura: {errorLectura}
        </p>
      )}

      {filas.length > 0 && (
        <div className="mt-5">
          <p className="text-sm text-zinc-600">
            Detectamos estos renglones. Tildá los que correspondan, elegí el
            producto y ajustá cantidad/precio si hace falta:
          </p>

          <div className="mt-3 space-y-3">
            {filas.map((f) => (
              <div
                key={f.id}
                className="rounded-md border border-zinc-200 p-3"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={f.incluir}
                    onChange={(e) =>
                      actualizarFila(f.id, "incluir", e.target.checked)
                    }
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                  />
                  <p className="flex-1 text-xs text-zinc-500">
                    {f.textoOriginal}
                  </p>
                  <button
                    type="button"
                    onClick={() => quitarFila(f.id)}
                    className="text-xs text-accent hover:underline"
                  >
                    Quitar
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <select
                    value={f.productoId}
                    onChange={(e) =>
                      actualizarFila(f.id, "productoId", e.target.value)
                    }
                    disabled={!f.incluir}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-primary disabled:opacity-50"
                  >
                    <option value="">Elegir producto...</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({p.codigo})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    value={f.cantidad}
                    disabled={!f.incluir}
                    onChange={(e) =>
                      actualizarFila(f.id, "cantidad", e.target.value)
                    }
                    placeholder="Cantidad"
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-primary disabled:opacity-50"
                  />

                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={f.precio ?? ""}
                    disabled={!f.incluir}
                    onChange={(e) =>
                      actualizarFila(f.id, "precio", e.target.value)
                    }
                    placeholder="Precio costo"
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-primary disabled:opacity-50"
                  />
                </div>
              </div>
            ))}
          </div>

          {errorAgregar && (
            <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              Error al agregar: {errorAgregar}
            </p>
          )}

          <button
            type="button"
            onClick={handleAgregarSeleccionadas}
            disabled={agregando}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {agregando ? "Agregando..." : "Agregar seleccionados a la compra"}
          </button>
        </div>
      )}
    </div>
  );
}
