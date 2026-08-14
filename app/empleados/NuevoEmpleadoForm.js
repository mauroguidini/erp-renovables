"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const OFICIOS = [
  { value: "instalador", label: "Instalador" },
  { value: "electricista", label: "Electricista" },
  { value: "ayudante", label: "Ayudante" },
  { value: "tecnico", label: "Técnico" },
  { value: "otro", label: "Otro" },
];

const valoresIniciales = {
  nombre: "",
  oficio: "instalador",
  contacto_telefono: "",
  contacto_email: "",
  activo: true,
};

export default function NuevoEmpleadoForm({ onEmpleadoCreado }) {
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

    const { error } = await supabase.from("empleados").insert({
      nombre: form.nombre.trim(),
      oficio: form.oficio,
      contacto_telefono: form.contacto_telefono.trim() || null,
      contacto_email: form.contacto_email.trim() || null,
      activo: form.activo,
    });

    if (error) {
      setError(error.message);
    } else {
      setExito(true);
      setForm(valoresIniciales);
      onEmpleadoCreado?.();
    }
    setGuardando(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold text-primary">Cargar empleado nuevo</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-700">
            Nombre *
          </label>
          <input
            required
            type="text"
            value={form.nombre}
            onChange={(e) => actualizarCampo("nombre", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
            placeholder="Ej: Juan Pérez"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Oficio *
          </label>
          <select
            value={form.oficio}
            onChange={(e) => actualizarCampo("oficio", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
          >
            {OFICIOS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Teléfono
          </label>
          <input
            type="text"
            value={form.contacto_telefono}
            onChange={(e) => actualizarCampo("contacto_telefono", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            type="email"
            value={form.contacto_email}
            onChange={(e) => actualizarCampo("contacto_email", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          Error al guardar: {error}
        </p>
      )}
      {exito && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Empleado guardado correctamente.
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {guardando ? "Guardando..." : "Guardar empleado"}
      </button>
    </form>
  );
}
