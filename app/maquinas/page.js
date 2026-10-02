"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";

const TIPOS = [
  { value: "maquina", label: "Máquina" },
  { value: "camion", label: "Camión" },
  { value: "grua", label: "Grúa" },
  { value: "flete", label: "Flete" },
];

function etiquetaTipo(tipo) {
  return TIPOS.find((t) => t.value === tipo)?.label ?? tipo;
}

function formatearMonto(monto) {
  return Number(monto ?? 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function NuevaMaquinaForm({ onCreada }) {
  const [mostrar, setMostrar] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("maquina");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const { error } = await supabase.from("maquinas").insert({ nombre: nombre.trim(), tipo });

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    setNombre("");
    setTipo("maquina");
    setMostrar(false);
    setGuardando(false);
    onCreada();
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setMostrar((v) => !v)}
        className="text-sm font-medium text-primary hover:underline"
      >
        {mostrar ? "Cancelar" : "+ Nueva máquina"}
      </button>

      {mostrar && (
        <form
          onSubmit={handleSubmit}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div>
            <label className="block text-sm font-medium text-zinc-700">Nombre / identificación</label>
            <input
              required
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          {error && <p className="w-full text-sm text-accent">{error}</p>}
        </form>
      )}
    </div>
  );
}

export default function Maquinas() {
  const role = useRole();
  const puedeVer = role === "administrador" || role === "administracion" || role === "jefe_obra";
  const puedeGestionar = role === "administrador" || role === "administracion";

  const [maquinas, setMaquinas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [verInactivas, setVerInactivas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("maquinas_con_tarifa")
      .select("*")
      .order("nombre");

    if (error) setError(error.message);
    else setError(null);
    setMaquinas(data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    if (!puedeVer) return;
    cargar();
  }, [puedeVer, cargar]);

  if (!puedeVer) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-accent">No tenés permiso para ver esta página.</p>
        </div>
      </div>
    );
  }

  const visibles = maquinas.filter((m) => verInactivas || m.activa);

  return (
    <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">Máquinas</h1>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={verInactivas}
              onChange={(e) => setVerInactivas(e.target.checked)}
            />
            Ver inactivas
          </label>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Parque de maquinarias, camiones, grúas y fletes. Contabilidad interna de análisis — no
          toca Caja ni Banco.
        </p>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && visibles.length === 0 && (
          <p className="mt-6 text-zinc-600">Todavía no hay máquinas cargadas.</p>
        )}

        {!cargando && !error && visibles.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {visibles.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/maquinas/${m.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
                >
                  <div>
                    <span className="font-medium text-primary">{m.nombre}</span>
                    <span className="ml-2 text-sm text-zinc-500">{etiquetaTipo(m.tipo)}</span>
                    {!m.activa && <span className="ml-2 text-xs text-zinc-400">inactiva</span>}
                  </div>
                  <span className="text-sm text-zinc-600">
                    {m.tipo === "flete" ? "sin tarifa" : `${formatearMonto(m.tarifa_hora)}/hora`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {puedeGestionar && <NuevaMaquinaForm onCreada={cargar} />}
      </div>
    </div>
  );
}
