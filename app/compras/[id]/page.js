"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function DetalleCompra() {
  const { id } = useParams();
  const router = useRouter();

  const [compra, setCompra] = useState(null);
  const [items, setItems] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precioCosto, setPrecioCosto] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [errorItem, setErrorItem] = useState(null);

  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState(null);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    const [compraRes, itemsRes, productosRes] = await Promise.all([
      supabase
        .from("compras")
        .select("id, fecha, estado, proveedores(nombre), depositos(nombre)")
        .eq("id", id)
        .single(),
      supabase
        .from("compra_items")
        .select("id, cantidad, precio_costo, productos(id, nombre, codigo)")
        .eq("compra_id", id)
        .order("created_at"),
      supabase.from("productos").select("id, nombre, codigo").order("nombre"),
    ]);

    if (compraRes.error) {
      setError(compraRes.error.message);
    } else {
      setError(null);
      setCompra(compraRes.data);
      setItems(itemsRes.data ?? []);
      setProductos(productosRes.data ?? []);
    }
    setCargando(false);
  }, [id]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  async function handleAgregarItem(e) {
    e.preventDefault();
    setAgregando(true);
    setErrorItem(null);

    const { error } = await supabase.from("compra_items").insert({
      compra_id: id,
      producto_id: productoId,
      cantidad: Number(cantidad),
      precio_costo: precioCosto ? Number(precioCosto) : null,
    });

    if (error) {
      setErrorItem(error.message);
    } else {
      setProductoId("");
      setCantidad("1");
      setPrecioCosto("");
      await cargarTodo();
    }
    setAgregando(false);
  }

  async function handleEliminarItem(itemId) {
    const { error } = await supabase
      .from("compra_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      setErrorItem(error.message);
    } else {
      await cargarTodo();
    }
  }

  async function handleConfirmar() {
    setConfirmando(true);
    setErrorConfirmar(null);

    const { error } = await supabase.rpc("confirmar_compra", {
      p_compra_id: id,
    });

    if (error) {
      setErrorConfirmar(error.message);
      setConfirmando(false);
    } else {
      await cargarTodo();
      setConfirmando(false);
    }
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-medium">No se pudo cargar la compra.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  const esBorrador = compra.estado === "borrador";

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/compras")}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Volver a compras
        </button>

        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {compra.proveedores?.nombre} → {compra.depositos?.nombre}
            </h1>
            <p className="text-sm text-zinc-500">{compra.fecha}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              compra.estado === "confirmada"
                ? "bg-green-100 text-green-800"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {compra.estado}
          </span>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 font-medium">Cantidad</th>
                <th className="px-4 py-2 font-medium">Precio costo</th>
                {esBorrador && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.length === 0 && (
                <tr>
                  <td colSpan={esBorrador ? 4 : 3} className="px-4 py-3 text-zinc-500">
                    Todavía no agregaste productos.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 text-zinc-900">
                    {item.productos?.nombre}{" "}
                    <span className="text-zinc-400">({item.productos?.codigo})</span>
                  </td>
                  <td className="px-4 py-2 text-zinc-900">{item.cantidad}</td>
                  <td className="px-4 py-2 text-zinc-900">
                    {item.precio_costo ?? "—"}
                  </td>
                  {esBorrador && (
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleEliminarItem(item.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {esBorrador && (
          <form
            onSubmit={handleAgregarItem}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold text-zinc-900">
              Agregar producto
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Producto *
                </label>
                <select
                  required
                  value={productoId}
                  onChange={(e) => setProductoId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
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
                  Cantidad *
                </label>
                <input
                  required
                  type="number"
                  min="0.0001"
                  step="any"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Precio costo
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={precioCosto}
                  onChange={(e) => setPrecioCosto(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                />
              </div>
            </div>

            {errorItem && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                Error al agregar: {errorItem}
              </p>
            )}

            <button
              type="submit"
              disabled={agregando}
              className="mt-5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {agregando ? "Agregando..." : "Agregar a la compra"}
            </button>
          </form>
        )}

        {esBorrador && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-zinc-900">
              Confirmar compra
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Al confirmar, se suma el stock de cada producto en{" "}
              <strong>{compra.depositos?.nombre}</strong> y no se va a poder
              deshacer ni editar la compra.
            </p>

            {errorConfirmar && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                Error al confirmar: {errorConfirmar}
              </p>
            )}

            <button
              onClick={handleConfirmar}
              disabled={confirmando || items.length === 0}
              className="mt-4 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {confirmando ? "Confirmando..." : "Confirmar compra"}
            </button>
            {items.length === 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                Agregá al menos un producto para poder confirmar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
