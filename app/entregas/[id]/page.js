"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SignaturePad from "../../SignaturePad";

export default function DetalleRemito() {
  const { id } = useParams();
  const router = useRouter();
  const firmaRef = useRef(null);

  const [remito, setRemito] = useState(null);
  const [obra, setObra] = useState(null);
  const [depositoOrigen, setDepositoOrigen] = useState(null);
  const [items, setItems] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [agregando, setAgregando] = useState(false);
  const [errorItem, setErrorItem] = useState(null);

  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState(null);

  const [firmanteNombre, setFirmanteNombre] = useState("");
  const [firmando, setFirmando] = useState(false);
  const [errorFirma, setErrorFirma] = useState(null);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    const remitoRes = await supabase.from("remitos").select("*").eq("id", id).single();

    if (remitoRes.error) {
      setError(remitoRes.error.message);
      setCargando(false);
      return;
    }

    const [itemsRes, productosRes, obraRes, depositoRes] = await Promise.all([
      supabase
        .from("remito_items")
        .select("id, cantidad, producto_id")
        .eq("remito_id", id)
        .order("created_at"),
      supabase.from("productos_nombre").select("id, nombre, codigo").order("nombre"),
      supabase
        .from("obras_para_entrega")
        .select("id, direccion, cliente_nombre")
        .eq("id", remitoRes.data.obra_id)
        .maybeSingle(),
      supabase
        .from("depositos_origen")
        .select("id, nombre")
        .eq("id", remitoRes.data.deposito_origen_id)
        .maybeSingle(),
    ]);

    const nombresPorProducto = {};
    (productosRes.data ?? []).forEach((p) => {
      nombresPorProducto[p.id] = p;
    });

    setError(null);
    setRemito(remitoRes.data);
    setItems(
      (itemsRes.data ?? []).map((item) => ({
        ...item,
        productos: nombresPorProducto[item.producto_id] ?? null,
      }))
    );
    setProductos(productosRes.data ?? []);
    setObra(obraRes.data ?? null);
    setDepositoOrigen(depositoRes.data ?? null);
    setCargando(false);
  }, [id]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  async function handleAgregarItem(e) {
    e.preventDefault();
    setAgregando(true);
    setErrorItem(null);

    const { error } = await supabase.from("remito_items").insert({
      remito_id: id,
      producto_id: productoId,
      cantidad: Number(cantidad),
    });

    if (error) {
      setErrorItem(error.message);
    } else {
      setProductoId("");
      setCantidad("1");
      await cargarTodo();
    }
    setAgregando(false);
  }

  async function handleEliminarItem(itemId) {
    const { error } = await supabase.from("remito_items").delete().eq("id", itemId);
    if (error) {
      setErrorItem(error.message);
    } else {
      await cargarTodo();
    }
  }

  async function handleConfirmar() {
    setConfirmando(true);
    setErrorConfirmar(null);

    const { error } = await supabase.rpc("confirmar_remito", { p_remito_id: id });

    if (error) {
      setErrorConfirmar(error.message);
    } else {
      await cargarTodo();
    }
    setConfirmando(false);
  }

  async function handleFirmar(e) {
    e.preventDefault();
    if (firmaRef.current.estaVacio()) {
      setErrorFirma("Falta la firma.");
      return;
    }
    setFirmando(true);
    setErrorFirma(null);

    const { error } = await supabase.rpc("firmar_remito", {
      p_remito_id: id,
      p_firmante_nombre: firmanteNombre.trim(),
      p_firma_imagen: firmaRef.current.exportar(),
    });

    if (error) {
      setErrorFirma(error.message);
    } else {
      await cargarTodo();
    }
    setFirmando(false);
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
          <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo cargar el remito.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  const esBorrador = remito.estado === "borrador";

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/entregas")}
          className="text-sm text-zinc-500 hover:text-zinc-800 print:hidden"
        >
          ← Volver a entregas
        </button>

        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-primary">
              Remito — {obra?.cliente_nombre ? `${obra.cliente_nombre} — ` : ""}
              {obra?.direccion ?? "(obra)"}
            </h1>
            <p className="text-sm text-zinc-500">
              Desde {depositoOrigen?.nombre ?? "(depósito)"} ·{" "}
              {new Date(remito.created_at).toLocaleDateString()}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              remito.estado === "confirmado"
                ? "bg-green-100 text-green-800"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {remito.estado}
          </span>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 font-medium">Cantidad</th>
                {esBorrador && <th className="px-4 py-2 print:hidden"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.length === 0 && (
                <tr>
                  <td colSpan={esBorrador ? 3 : 2} className="px-4 py-3 text-zinc-500">
                    Todavía no agregaste productos.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 text-primary">
                    {item.productos?.nombre}{" "}
                    <span className="text-zinc-400">({item.productos?.codigo})</span>
                  </td>
                  <td className="px-4 py-2 text-primary">{item.cantidad}</td>
                  {esBorrador && (
                    <td className="px-4 py-2 text-right print:hidden">
                      <button
                        onClick={() => handleEliminarItem(item.id)}
                        className="text-xs text-accent hover:underline"
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
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:hidden"
          >
            <h2 className="text-lg font-semibold text-primary">Agregar producto</h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
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
            </div>

            {errorItem && (
              <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                Error al agregar: {errorItem}
              </p>
            )}

            <button
              type="submit"
              disabled={agregando}
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {agregando ? "Agregando..." : "Agregar al remito"}
            </button>
          </form>
        )}

        {esBorrador && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:hidden">
            <h2 className="text-lg font-semibold text-primary">Confirmar remito</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Al confirmar, se mueve el stock de cada producto desde{" "}
              <strong>{depositoOrigen?.nombre}</strong> hacia la obra, y no se va a
              poder editar el remito.
            </p>

            {errorConfirmar && (
              <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                Error al confirmar: {errorConfirmar}
              </p>
            )}

            <button
              onClick={handleConfirmar}
              disabled={confirmando || items.length === 0}
              className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {confirmando ? "Confirmando..." : "Confirmar remito"}
            </button>
            {items.length === 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                Agregá al menos un producto para poder confirmar.
              </p>
            )}
          </div>
        )}

        {!esBorrador && !remito.firmada && (
          <form
            onSubmit={handleFirmar}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:hidden"
          >
            <h2 className="text-lg font-semibold text-primary">Firma de recepción</h2>
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-700">
                Nombre de quien recibe *
              </label>
              <input
                required
                type="text"
                value={firmanteNombre}
                onChange={(e) => setFirmanteNombre(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-700">
                Firma *
              </label>
              <div className="mt-1">
                <SignaturePad ref={firmaRef} />
              </div>
            </div>

            {errorFirma && (
              <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                {errorFirma}
              </p>
            )}

            <button
              type="submit"
              disabled={firmando}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {firmando ? "Guardando..." : "Guardar firma"}
            </button>
          </form>
        )}

        {remito.firmada && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between print:hidden">
              <h2 className="text-lg font-semibold text-primary">Firma de recepción</h2>
              <button
                onClick={() => window.print()}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Imprimir
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              Recibió: <strong>{remito.firmante_nombre}</strong> —{" "}
              {new Date(remito.firmada_at).toLocaleString()}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={remito.firma_imagen}
              alt="Firma"
              className="mt-3 h-32 w-full max-w-sm rounded-md border border-zinc-200 bg-white object-contain"
            />
          </div>
        )}
      </div>
    </div>
  );
}
