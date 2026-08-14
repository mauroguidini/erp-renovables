"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function NuevoRemito() {
  const router = useRouter();
  const [obras, setObras] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(true);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [obraId, setObraId] = useState("");
  const [depositoOrigenId, setDepositoOrigenId] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    async function cargarOpciones() {
      const [obrasRes, depositosRes] = await Promise.all([
        supabase.from("obras_para_entrega").select("id, direccion, cliente_nombre").order("direccion"),
        supabase.from("depositos_origen").select("id, nombre").order("nombre"),
      ]);

      if (obrasRes.error) {
        setError(obrasRes.error.message);
      } else if (depositosRes.error) {
        setError(depositosRes.error.message);
      } else {
        setObras(obrasRes.data);
        setDepositos(depositosRes.data);
      }
      setCargandoOpciones(false);
    }

    cargarOpciones();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const { data, error } = await supabase
      .from("remitos")
      .insert({
        obra_id: obraId,
        deposito_origen_id: depositoOrigenId,
        motivo: motivo.trim() || null,
      })
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      setGuardando(false);
    } else {
      router.push(`/entregas/${data.id}`);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">Nuevo remito</h1>

        {cargandoOpciones && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {!cargandoOpciones && obras.length === 0 && (
          <p className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Todavía no hay obras cargadas.
          </p>
        )}

        {!cargandoOpciones && obras.length > 0 && (
          <form
            onSubmit={handleSubmit}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">
                  Obra *
                </label>
                <select
                  required
                  value={obraId}
                  onChange={(e) => setObraId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                >
                  <option value="" disabled>
                    Elegir obra...
                  </option>
                  {obras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.cliente_nombre ? `${o.cliente_nombre} — ` : ""}
                      {o.direccion}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Depósito de origen *
                </label>
                <select
                  required
                  value={depositoOrigenId}
                  onChange={(e) => setDepositoOrigenId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                >
                  <option value="" disabled>
                    Elegir depósito...
                  </option>
                  {depositos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Motivo
                </label>
                <input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                  placeholder="Ej: Envío para instalación"
                />
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                Error al crear el remito: {error}
              </p>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {guardando ? "Creando..." : "Crear remito (borrador)"}
            </button>
            <p className="mt-2 text-xs text-zinc-500">
              Después de crearlo vas a poder agregar los productos y confirmarlo.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
