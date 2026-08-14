"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function NuevaCompra() {
  const router = useRouter();
  const [proveedores, setProveedores] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(true);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [proveedorId, setProveedorId] = useState("");
  const [depositoId, setDepositoId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    async function cargarOpciones() {
      const [proveedoresRes, depositosRes] = await Promise.all([
        supabase.from("proveedores").select("id, nombre").order("nombre"),
        supabase
          .from("depositos")
          .select("id, nombre")
          .eq("activo", true)
          .order("nombre"),
      ]);

      if (proveedoresRes.error) {
        setError(proveedoresRes.error.message);
      } else if (depositosRes.error) {
        setError(depositosRes.error.message);
      } else {
        setProveedores(proveedoresRes.data);
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
      .from("compras")
      .insert({
        proveedor_id: proveedorId,
        deposito_destino_id: depositoId,
        fecha,
      })
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      setGuardando(false);
    } else {
      router.push(`/compras/${data.id}`);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">Nueva compra</h1>

        {cargandoOpciones && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {!cargandoOpciones && (
          <form
            onSubmit={handleSubmit}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Proveedor *
                </label>
                <select
                  required
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                >
                  <option value="" disabled>
                    Elegir proveedor...
                  </option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Depósito destino *
                </label>
                <select
                  required
                  value={depositoId}
                  onChange={(e) => setDepositoId(e.target.value)}
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
                  Fecha *
                </label>
                <input
                  required
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                Error al crear la compra: {error}
              </p>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {guardando ? "Creando..." : "Crear compra (borrador)"}
            </button>
            <p className="mt-2 text-xs text-zinc-500">
              Después de crearla vas a poder agregar los productos y confirmarla.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
