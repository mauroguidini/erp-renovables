"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const valoresIniciales = {
  nombre: "",
  activo: true,
};

export default function NuevoTipoTareaForm({ onTipoCreado }) {
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

    const { error } = await supabase.from("tipos_tarea").insert({
      nombre: form.nombre.trim(),
      activo: form.activo,
    });

    if (error) {
      setError(error.message);
    } else {
      setExito(true);
      setForm(valoresIniciales);
      onTipoCreado?.();
    }
    setGuardando(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold text-primary">Cargar tipo de tarea nuevo</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            placeholder="Ej: Relevamiento"
          />
        </div>

        <div className="flex items-center gap-2 pt-6">
          <input
            id="activo"
            type="checkbox"
            checked={form.activo}
            onChange={(e) => actualizarCampo("activo", e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          <label htmlFor="activo" className="text-sm text-zinc-700">
            Activo
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
          Tipo de tarea guardado correctamente.
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {guardando ? "Guardando..." : "Guardar tipo de tarea"}
      </button>
    </form>
  );
}
