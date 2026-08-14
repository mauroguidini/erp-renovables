"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ESTADOS = [
  "presupuestada",
  "aprobada",
  "en_curso",
  "finalizada",
  "cancelada",
];

export default function NuevaObra() {
  const router = useRouter();
  const [clientes, setClientes] = useState([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(true);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [clienteId, setClienteId] = useState("");
  const [direccion, setDireccion] = useState("");
  const [potenciaKwp, setPotenciaKwp] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFinEstimada, setFechaFinEstimada] = useState("");
  const [estado, setEstado] = useState("presupuestada");
  const [presupuesto, setPresupuesto] = useState("");

  useEffect(() => {
    async function cargarClientes() {
      const { data, error } = await supabase
        .from("clientes_nombre")
        .select("id, nombre")
        .order("nombre");

      if (error) {
        setError(error.message);
      } else {
        setClientes(data);
      }
      setCargandoOpciones(false);
    }

    cargarClientes();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const { data, error } = await supabase
      .from("obras")
      .insert({
        cliente_id: clienteId,
        direccion: direccion.trim(),
        potencia_kwp: Number(potenciaKwp),
        fecha_inicio: fechaInicio || null,
        fecha_fin_estimada: fechaFinEstimada || null,
        estado,
        presupuesto: presupuesto ? Number(presupuesto) : null,
      })
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      setGuardando(false);
    } else {
      router.push(`/obras/${data.id}`);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">Nueva obra</h1>

        {cargandoOpciones && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {!cargandoOpciones && clientes.length === 0 && (
          <p className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Todavía no hay clientes cargados. Andá a la pantalla de{" "}
            <strong>Clientes</strong> y cargá uno primero.
          </p>
        )}

        {!cargandoOpciones && clientes.length > 0 && (
          <form
            onSubmit={handleSubmit}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">
                  Cliente *
                </label>
                <select
                  required
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                >
                  <option value="" disabled>
                    Elegir cliente...
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">
                  Dirección de la obra *
                </label>
                <input
                  required
                  type="text"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Potencia instalada (kWp) *
                </label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="any"
                  value={potenciaKwp}
                  onChange={(e) => setPotenciaKwp(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Estado *
                </label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                >
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Fecha de fin estimada
                </label>
                <input
                  type="date"
                  value={fechaFinEstimada}
                  onChange={(e) => setFechaFinEstimada(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Presupuesto
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={presupuesto}
                  onChange={(e) => setPresupuesto(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                  placeholder="$"
                />
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                Error al crear la obra: {error}
              </p>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {guardando ? "Creando..." : "Crear obra"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
