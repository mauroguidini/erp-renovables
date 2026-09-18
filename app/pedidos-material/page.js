"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function PedidosMaterial() {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [soloPendientes, setSoloPendientes] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("pedidos_material")
      .select(
        "*, obras(id, direccion), ordenes_trabajo(numero, descripcion), pedidos_material_items(cantidad, productos(nombre))"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setPedidos(data ?? []);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleAtender(pedido) {
    setPedidos((prev) =>
      prev.map((p) => (p.id === pedido.id ? { ...p, estado: "atendido" } : p))
    );

    const { error } = await supabase.rpc("marcar_pedido_material_atendido", {
      p_pedido_id: pedido.id,
    });

    if (error) {
      setError(error.message);
      cargar();
    }
  }

  const pedidosMostrados = soloPendientes
    ? pedidos.filter((p) => p.estado === "pendiente")
    : pedidos;

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">Pedidos de material</h1>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => setSoloPendientes(e.target.checked)}
            />
            Solo pendientes
          </label>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Pedidos cargados desde las OT de cada obra.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {!cargando && pedidosMostrados.length === 0 && (
          <p className="mt-6 text-zinc-600">No hay pedidos de material para mostrar.</p>
        )}

        {!cargando && pedidosMostrados.length > 0 && (
          <ul className="mt-6 space-y-3">
            {pedidosMostrados.map((p) => (
              <li key={p.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/obras/${p.obras?.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {p.obras?.direccion ?? "(obra eliminada)"}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      OT #{p.ordenes_trabajo?.numero} — {p.ordenes_trabajo?.descripcion}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.estado === "atendido"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {p.estado === "atendido" ? "Atendido" : "Pendiente"}
                  </span>
                </div>

                <ul className="mt-2 text-sm text-zinc-700">
                  {p.pedidos_material_items.map((it, i) => (
                    <li key={i}>
                      {it.productos?.nombre} — cantidad: {it.cantidad}
                    </li>
                  ))}
                </ul>

                {p.nota && <p className="mt-1 text-xs text-zinc-500">Nota: {p.nota}</p>}

                <p className="mt-2 text-xs text-zinc-400">
                  Pedido por {p.creado_por_email} el {new Date(p.created_at).toLocaleString()}
                  {p.estado === "atendido" &&
                    ` · Atendido por ${p.atendido_por_email} el ${new Date(
                      p.atendido_en
                    ).toLocaleString()}`}
                </p>

                {p.estado === "pendiente" && (
                  <button
                    onClick={() => handleAtender(p)}
                    className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
                  >
                    Marcar atendido
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
