"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

const valoresIniciales = {
  nombre: "",
  fecha_objetivo: "",
  estado: "pendiente",
};

export default function Hitos({ obraId, hitos, onCambio }) {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "jefe_obra";

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(valoresIniciales);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState(null);

  const [editandoId, setEditandoId] = useState(null);
  const [formEdicion, setFormEdicion] = useState(null);
  const [errorEdicion, setErrorEdicion] = useState(null);

  async function handleCrear(e) {
    e.preventDefault();
    setGuardando(true);
    setErrorForm(null);

    const { error } = await supabase.from("hitos").insert({
      obra_id: obraId,
      nombre: form.nombre.trim(),
      fecha_objetivo: form.fecha_objetivo || null,
      estado: form.estado,
    });

    if (error) {
      setErrorForm(error.message);
    } else {
      setForm(valoresIniciales);
      setMostrarForm(false);
      await onCambio();
    }
    setGuardando(false);
  }

  function iniciarEdicion(hito) {
    setEditandoId(hito.id);
    setFormEdicion({
      nombre: hito.nombre,
      fecha_objetivo: hito.fecha_objetivo ?? "",
      estado: hito.estado,
    });
    setErrorEdicion(null);
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    setErrorEdicion(null);

    const { error } = await supabase
      .from("hitos")
      .update({
        nombre: formEdicion.nombre.trim(),
        fecha_objetivo: formEdicion.fecha_objetivo || null,
        estado: formEdicion.estado,
      })
      .eq("id", editandoId);

    if (error) {
      setErrorEdicion(error.message);
    } else {
      setEditandoId(null);
      await onCambio();
    }
  }

  async function handleBorrar(hitoId) {
    const { error } = await supabase.from("hitos").delete().eq("id", hitoId);
    if (!error) {
      await onCambio();
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-primary">Hitos</h2>
        {puedeGestionar && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {mostrarForm ? "Cancelar" : "+ Nuevo hito"}
          </button>
        )}
      </div>

      {mostrarForm && puedeGestionar && (
        <form
          onSubmit={handleCrear}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 p-4"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-700">Nombre</label>
            <input
              required
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              placeholder="Ej: Fundaciones"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">
              Fecha objetivo
            </label>
            <input
              type="date"
              value={form.fecha_objetivo}
              onChange={(e) => setForm((f) => ({ ...f, fecha_objetivo: e.target.value }))}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">Estado</label>
            <select
              value={form.estado}
              onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="pendiente">Pendiente</option>
              <option value="cumplido">Cumplido</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Creando..." : "Crear hito"}
          </button>
          {errorForm && <p className="w-full text-xs text-accent">{errorForm}</p>}
        </form>
      )}

      {hitos.length === 0 && (
        <p className="mt-4 text-sm text-zinc-600">Todavía no hay hitos cargados.</p>
      )}

      {hitos.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-200">
          {hitos.map((hito) =>
            editandoId === hito.id ? (
              <li key={hito.id} className="py-3">
                <form
                  onSubmit={handleGuardarEdicion}
                  className="flex flex-wrap items-end gap-3"
                >
                  <div>
                    <label className="block text-xs font-medium text-zinc-700">
                      Nombre
                    </label>
                    <input
                      required
                      type="text"
                      value={formEdicion.nombre}
                      onChange={(e) =>
                        setFormEdicion((f) => ({ ...f, nombre: e.target.value }))
                      }
                      className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700">
                      Fecha objetivo
                    </label>
                    <input
                      type="date"
                      value={formEdicion.fecha_objetivo}
                      onChange={(e) =>
                        setFormEdicion((f) => ({ ...f, fecha_objetivo: e.target.value }))
                      }
                      className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700">
                      Estado
                    </label>
                    <select
                      value={formEdicion.estado}
                      onChange={(e) =>
                        setFormEdicion((f) => ({ ...f, estado: e.target.value }))
                      }
                      className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="cumplido">Cumplido</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoId(null)}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Cancelar
                  </button>
                  {errorEdicion && (
                    <p className="w-full text-xs text-accent">{errorEdicion}</p>
                  )}
                </form>
              </li>
            ) : (
              <li key={hito.id} className="flex items-center justify-between py-3">
                <div>
                  <span className="font-medium text-primary">{hito.nombre}</span>
                  <span className="ml-2 text-sm text-zinc-500">
                    {hito.fecha_objetivo ?? "sin fecha"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      hito.estado === "cumplido"
                        ? "bg-green-100 text-green-800"
                        : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {hito.estado}
                  </span>
                  {puedeGestionar && (
                    <>
                      <button
                        onClick={() => iniciarEdicion(hito)}
                        className="text-xs font-medium text-zinc-600 hover:text-primary"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleBorrar(hito.id)}
                        className="text-xs text-accent hover:underline"
                      >
                        Borrar
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
