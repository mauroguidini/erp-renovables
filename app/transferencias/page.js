"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Transferencias() {
  const [productos, setProductos] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(true);
  const [error, setError] = useState(null);

  const [productoId, setProductoId] = useState("");
  const [depositoOrigenId, setDepositoOrigenId] = useState("");
  const [depositoDestinoId, setDepositoDestinoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [motivo, setMotivo] = useState("");

  const [disponible, setDisponible] = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [errorTransferencia, setErrorTransferencia] = useState(null);
  const [exito, setExito] = useState(false);

  useEffect(() => {
    async function cargarOpciones() {
      const [productosRes, depositosRes] = await Promise.all([
        supabase.from("productos").select("id, nombre, codigo").order("nombre"),
        supabase
          .from("depositos")
          .select("id, nombre")
          .eq("activo", true)
          .order("nombre"),
      ]);

      if (productosRes.error) {
        setError(productosRes.error.message);
      } else if (depositosRes.error) {
        setError(depositosRes.error.message);
      } else {
        setProductos(productosRes.data);
        setDepositos(depositosRes.data);
      }
      setCargandoOpciones(false);
    }

    cargarOpciones();
  }, []);

  const consultarDisponible = useCallback(async () => {
    if (!productoId || !depositoOrigenId) {
      setDisponible(null);
      return;
    }

    const { data, error } = await supabase
      .from("stock")
      .select("cantidad")
      .eq("producto_id", productoId)
      .eq("deposito_id", depositoOrigenId)
      .maybeSingle();

    if (error) {
      setDisponible(null);
    } else {
      setDisponible(data?.cantidad ?? 0);
    }
  }, [productoId, depositoOrigenId]);

  useEffect(() => {
    consultarDisponible();
  }, [consultarDisponible]);

  async function handleSubmit(e) {
    e.preventDefault();
    setEnviando(true);
    setErrorTransferencia(null);
    setExito(false);

    const { error } = await supabase.rpc("transferir_stock", {
      p_producto_id: productoId,
      p_deposito_origen_id: depositoOrigenId,
      p_deposito_destino_id: depositoDestinoId,
      p_cantidad: Number(cantidad),
      p_motivo: motivo.trim() || null,
    });

    if (error) {
      setErrorTransferencia(error.message);
    } else {
      setExito(true);
      setCantidad("1");
      setMotivo("");
      await consultarDisponible();
    }
    setEnviando(false);
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">
          Transferencias de stock
        </h1>

        {cargandoOpciones && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargandoOpciones && !error && (
          <form
            onSubmit={handleSubmit}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">
                  Producto *
                </label>
                <select
                  required
                  value={productoId}
                  onChange={(e) => setProductoId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                >
                  <option value="" disabled>
                    Elegir producto...
                  </option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Depósito origen *
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
                {disponible !== null && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Disponible ahí: {disponible}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Depósito destino *
                </label>
                <select
                  required
                  value={depositoDestinoId}
                  onChange={(e) => setDepositoDestinoId(e.target.value)}
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
                  Cantidad *
                </label>
                <input
                  required
                  type="number"
                  min="0.0001"
                  step="any"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
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
                  placeholder="Ej: Envío a obra"
                />
              </div>
            </div>

            {errorTransferencia && (
              <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                {errorTransferencia}
              </p>
            )}
            {exito && (
              <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                Transferencia realizada correctamente.
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {enviando ? "Transfiriendo..." : "Transferir"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
