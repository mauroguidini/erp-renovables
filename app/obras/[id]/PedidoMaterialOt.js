"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function lineaVacia() {
  return { producto_id: "", cantidad: "1" };
}

export default function PedidoMaterialOt({ otId, productos, puedePedir }) {
  const [pedidos, setPedidos] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("pedidos_material")
      .select("*, pedidos_material_items(cantidad, productos(nombre))")
      .eq("ot_id", otId)
      .order("created_at", { ascending: false });
    setPedidos(data ?? []);
  }, [otId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function actualizarLinea(i, campo, valor) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, lineaVacia()]);
  }

  function quitarLinea(i) {
    setLineas((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleEnviar(e) {
    e.preventDefault();
    setError(null);

    const lineasValidas = lineas.filter((l) => l.producto_id && Number(l.cantidad) > 0);
    if (lineasValidas.length === 0) {
      setError("Agregá al menos un producto con cantidad.");
      return;
    }

    setGuardando(true);

    const { data: pedido, error: errorPedido } = await supabase
      .from("pedidos_material")
      .insert({ ot_id: otId, nota: nota.trim() || null })
      .select("id")
      .single();

    if (errorPedido) {
      setError(errorPedido.message);
      setGuardando(false);
      return;
    }

    const { error: errorItems } = await supabase.from("pedidos_material_items").insert(
      lineasValidas.map((l) => ({
        pedido_id: pedido.id,
        producto_id: l.producto_id,
        cantidad: Number(l.cantidad),
      }))
    );

    if (errorItems) {
      setError(
        `El pedido se creó, pero hubo un error al cargar los productos: ${errorItems.message}`
      );
    } else {
      setLineas([lineaVacia()]);
      setNota("");
      setMostrarForm(false);
    }
    await cargar();
    setGuardando(false);
  }

  return (
    <div className="mt-2 rounded-md border border-zinc-200 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500">
          Pedidos de material{pedidos.length > 0 ? ` (${pedidos.length})` : ""}
        </span>
        {puedePedir && (
          <button
            type="button"
            onClick={() => setMostrarForm((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {mostrarForm ? "Cancelar" : "+ Pedir material"}
          </button>
        )}
      </div>

      {pedidos.length > 0 && (
        <ul className="mt-1 space-y-1">
          {pedidos.map((p) => (
            <li key={p.id} className="text-xs text-zinc-600">
              <span
                className={`mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  p.estado === "atendido"
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {p.estado === "atendido" ? "Atendido" : "Pendiente"}
              </span>
              {p.pedidos_material_items
                .map((it) => `${it.productos?.nombre} x${it.cantidad}`)
                .join(", ")}
              {p.nota ? ` — ${p.nota}` : ""}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-accent">{error}</p>}

      {mostrarForm && (
        <form onSubmit={handleEnviar} className="mt-2 space-y-2 rounded-md bg-zinc-50 p-2">
          {lineas.map((linea, i) => (
            <div key={i} className="flex items-center gap-1">
              <select
                required
                value={linea.producto_id}
                onChange={(e) => actualizarLinea(i, "producto_id", e.target.value)}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
              >
                <option value="" disabled>
                  Producto...
                </option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                min="0.01"
                step="any"
                value={linea.cantidad}
                onChange={(e) => actualizarLinea(i, "cantidad", e.target.value)}
                className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
              />
              {lineas.length > 1 && (
                <button
                  type="button"
                  onClick={() => quitarLinea(i)}
                  className="text-xs text-accent hover:underline"
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={agregarLinea}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Agregar producto
          </button>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota (opcional)"
            rows={2}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
          />
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Enviando..." : "Enviar pedido"}
          </button>
        </form>
      )}
    </div>
  );
}
