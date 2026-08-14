"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const valoresIniciales = {
  nombre: "",
  contacto_telefono: "",
  contacto_email: "",
  direccion: "",
  cuit: "",
};

export default function NuevoProveedorForm({ onProveedorCreado }) {
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

    const { error } = await supabase.from("proveedores").insert({
      nombre: form.nombre.trim(),
      contacto_telefono: form.contacto_telefono.trim() || null,
      contacto_email: form.contacto_email.trim() || null,
      direccion: form.direccion.trim() || null,
      cuit: form.cuit.trim() || null,
    });

    if (error) {
      setError(error.message);
    } else {
      setExito(true);
      setForm(valoresIniciales);
      onProveedorCreado?.();
    }
    setGuardando(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-lg font-semibold text-primary">Cargar proveedor nuevo</h2>

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
            placeholder="Ej: Proveedor SRL"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            Teléfono
          </label>
          <input
            type="text"
            value={form.contacto_telefono}
            onChange={(e) =>
              actualizarCampo("contacto_telefono", e.target.value)
            }
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

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-700">
            Dirección
          </label>
          <input
            type="text"
            value={form.direccion}
            onChange={(e) => actualizarCampo("direccion", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700">
            CUIT
          </label>
          <input
            type="text"
            value={form.cuit}
            onChange={(e) => actualizarCampo("cuit", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
            placeholder="30-12345678-9"
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
          Proveedor guardado correctamente.
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {guardando ? "Guardando..." : "Guardar proveedor"}
      </button>
    </form>
  );
}
