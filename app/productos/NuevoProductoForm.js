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

const valoresIniciales = {
  codigo: "",
  nombre: "",
  descripcion: "",
  categoria: "panel",
  unidad_medida: "unidad",
  requiere_numero_serie: false,
  stock_minimo: "0",
};

export default function NuevoProductoForm({ onProductoCreado }) {
  const [form, setForm] = useState(valoresIniciales);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(false);

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setExito(false);

    const { error } = await supabase.from("productos").insert({
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria: form.categoria,
      unidad_medida: form.unidad_medida.trim() || "unidad",
      requiere_numero_serie: form.requiere_numero_serie,
      stock_minimo: Number(form.stock_minimo) || 0,
    });

    if (error) {
      setError(error.message);
    } else {
      setExito(true);
      setForm(valoresIniciales);
      onProductoCreado?.();
    }
    setGuardando(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold text-primary">Cargar producto nuevo</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Código *
          </label>
          <input
            required
            type="text"
            value={form.codigo}
            onChange={(e) => actualizarCampo("codigo", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
            placeholder="Ej: PAN-450W"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Nombre *
          </label>
          <input
            required
            type="text"
            value={form.nombre}
            onChange={(e) => actualizarCampo("nombre", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
            placeholder="Ej: Panel solar 450W"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-700">
            Descripción
          </label>
          <textarea
            value={form.descripcion}
            onChange={(e) => actualizarCampo("descripcion", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Categoría *
          </label>
          <select
            value={form.categoria}
            onChange={(e) => actualizarCampo("categoria", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Unidad de medida
          </label>
          <input
            type="text"
            value={form.unidad_medida}
            onChange={(e) => actualizarCampo("unidad_medida", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
            placeholder="unidad, metro, kg..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Stock mínimo
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.stock_minimo}
            onChange={(e) => actualizarCampo("stock_minimo", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
          />
        </div>

        <div className="flex items-center gap-2 pt-6">
          <input
            id="requiere_numero_serie"
            type="checkbox"
            checked={form.requiere_numero_serie}
            onChange={(e) =>
              actualizarCampo("requiere_numero_serie", e.target.checked)
            }
            className="h-4 w-4 rounded border-zinc-300"
          />
          <label
            htmlFor="requiere_numero_serie"
            className="text-sm text-zinc-700"
          >
            Requiere número de serie
          </label>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          Error al guardar: {error}
        </p>
      )}
      {exito && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Producto guardado correctamente.
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {guardando ? "Guardando..." : "Guardar producto"}
      </button>
    </form>
  );
}
