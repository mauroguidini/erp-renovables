"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

function formatearMonto(monto) {
  return Number(monto ?? 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function fechaLegible(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
}

const valoresIniciales = {
  maquina_id: "",
  horas: "",
  monto: "",
  fecha: new Date().toISOString().slice(0, 10),
  descripcion: "",
};

export default function Maquinas({ obraId }) {
  const role = useRole();
  const puedeVer = role === "administrador" || role === "administracion" || role === "jefe_obra";
  const puedeRegistrar = role === "administrador" || role === "jefe_obra";

  const [maquinasDisponibles, setMaquinasDisponibles] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(valoresIniciales);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [maquinasRes, movimientosRes] = await Promise.all([
      supabase.from("maquinas_con_tarifa").select("*").eq("activa", true).order("nombre"),
      supabase
        .from("maquina_movimientos")
        .select("*, maquinas(nombre, tipo)")
        .eq("obra_id", obraId)
        .order("fecha", { ascending: false }),
    ]);

    if (maquinasRes.error) setError(maquinasRes.error.message);
    else if (movimientosRes.error) setError(movimientosRes.error.message);
    else setError(null);

    setMaquinasDisponibles(maquinasRes.data ?? []);
    setMovimientos(movimientosRes.data ?? []);
    setCargando(false);
  }, [obraId]);

  useEffect(() => {
    if (!puedeVer) return;
    cargar();
  }, [puedeVer, cargar]);

  if (!puedeVer) return null;

  const maquinaSeleccionada = maquinasDisponibles.find((m) => m.id === form.maquina_id);
  const esFlete = maquinaSeleccionada?.tipo === "flete";
  const previewMonto =
    maquinaSeleccionada && !esFlete && form.horas
      ? Number(form.horas) * Number(maquinaSeleccionada.tarifa_hora)
      : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.maquina_id) return;

    setGuardando(true);
    setErrorForm(null);

    const rpc = esFlete ? "registrar_flete" : "registrar_uso_maquina";
    const params = esFlete
      ? {
          p_obra_id: obraId,
          p_maquina_id: form.maquina_id,
          p_monto: form.monto,
          p_fecha: form.fecha,
          p_descripcion: form.descripcion.trim() || null,
        }
      : {
          p_obra_id: obraId,
          p_maquina_id: form.maquina_id,
          p_horas: form.horas,
          p_fecha: form.fecha,
          p_descripcion: form.descripcion.trim() || null,
        };

    const { error } = await supabase.rpc(rpc, params);

    if (error) {
      setErrorForm(error.message);
      setGuardando(false);
      return;
    }

    setForm(valoresIniciales);
    setMostrarForm(false);
    setGuardando(false);
    await cargar();
  }

  const total = movimientos.reduce((acc, m) => acc + Number(m.monto), 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!cargando && !error && movimientos.length > 0 && (
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
            Total: {formatearMonto(total)}
          </span>
        )}
        {puedeRegistrar && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="ml-auto text-sm font-medium text-primary hover:underline"
          >
            {mostrarForm ? "Cancelar" : "+ Registrar uso"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      {mostrarForm && puedeRegistrar && (
        <form onSubmit={handleSubmit} className="mt-4 rounded-md border border-zinc-200 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Máquina / flete *</label>
              <select
                required
                value={form.maquina_id}
                onChange={(e) => setForm((f) => ({ ...f, maquina_id: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                <option value="">— Elegir —</option>
                {maquinasDisponibles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} {m.tipo !== "flete" ? `(${formatearMonto(m.tarifa_hora)}/h)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Fecha *</label>
              <input
                required
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            {esFlete ? (
              <div>
                <label className="block text-sm font-medium text-zinc-700">Monto *</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.monto}
                  onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-zinc-700">Horas *</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.horas}
                  onChange={(e) => setForm((f) => ({ ...f, horas: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                />
                {previewMonto !== null && (
                  <p className="mt-1 text-xs text-zinc-500">Costo: {formatearMonto(previewMonto)}</p>
                )}
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700">Descripción</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
          </div>

          {errorForm && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{errorForm}</p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </form>
      )}

      {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && movimientos.length === 0 && (
        <p className="mt-4 text-sm text-zinc-600">
          Todavía no hay uso de máquinas ni fletes registrado en esta obra.
        </p>
      )}

      {!cargando && movimientos.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {movimientos.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <span className="text-sm font-medium text-zinc-900">{m.maquinas?.nombre}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {fechaLegible(m.fecha)}
                  {m.horas ? ` · ${m.horas} h × ${formatearMonto(m.tarifa_hora_usada)}/h` : ""}
                  {m.descripcion ? ` · ${m.descripcion}` : ""}
                </span>
              </div>
              <span className="text-sm font-medium text-zinc-900">{formatearMonto(m.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
