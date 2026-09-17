"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

const DATOS_EMPRESA = {
  nombre: "Baluti Servicios Integrales SRL",
  cuit: "30-71829950-7",
  domicilio: "Av. 9 de Julio 950, Resistencia, Chaco (CP 3500)",
  contacto: "",
};

function fechaLegible(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
}

function formatearMonto(monto) {
  return Number(monto).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

export default function DetalleOrdenCompra() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";
  const router = useRouter();
  const { id } = useParams();

  const [orden, setOrden] = useState(null);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [errorItem, setErrorItem] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);

    const { data: ordenData, error: errOrden } = await supabase
      .from("ordenes_compra")
      .select("*, proveedores(nombre, contacto_telefono, contacto_email, direccion, cuit)")
      .eq("id", id)
      .single();

    if (errOrden) {
      setError(errOrden.message);
      setCargando(false);
      return;
    }

    const { data: itemsData } = await supabase
      .from("ordenes_compra_items")
      .select("*")
      .eq("orden_compra_id", id)
      .order("created_at");

    setError(null);
    setOrden(ordenData);
    setItems(itemsData ?? []);
    setCargando(false);
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleAgregarItem(e) {
    e.preventDefault();
    const cantNum = Number(cantidad);
    const precioNum = Number(precioUnitario);
    if (!descripcion.trim() || !cantNum || cantNum <= 0 || precioNum < 0) return;

    setAgregando(true);
    setErrorItem(null);

    const { error } = await supabase.from("ordenes_compra_items").insert({
      orden_compra_id: id,
      descripcion: descripcion.trim(),
      cantidad: cantNum,
      precio_unitario: precioNum,
    });

    if (error) {
      setErrorItem(error.message);
      setAgregando(false);
      return;
    }

    setDescripcion("");
    setCantidad("");
    setPrecioUnitario("");
    setAgregando(false);
    await cargar();
  }

  async function handleQuitarItem(itemId) {
    await supabase.from("ordenes_compra_items").delete().eq("id", itemId);
    await cargar();
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

  if (error || !orden) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-accent">{error ?? "No se encontró la orden de compra."}</p>
        </div>
      </div>
    );
  }

  const total = items.reduce((acc, i) => acc + Number(i.subtotal), 0);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/ordenes-compra")}
          className="text-sm text-zinc-500 hover:text-zinc-800 print:hidden"
        >
          ← Volver a órdenes de compra
        </button>

        {/* Membrete — solo se ve al imprimir */}
        <div className="mt-4 hidden print:block">
          <h1 className="text-xl font-bold">{DATOS_EMPRESA.nombre}</h1>
          {DATOS_EMPRESA.cuit && <p className="text-sm">CUIT: {DATOS_EMPRESA.cuit}</p>}
          {DATOS_EMPRESA.domicilio && <p className="text-sm">{DATOS_EMPRESA.domicilio}</p>}
          {DATOS_EMPRESA.contacto && <p className="text-sm">{DATOS_EMPRESA.contacto}</p>}
          <hr className="my-3" />
        </div>

        <div className="mt-2 flex items-center justify-between print:mt-0">
          <h1 className="text-2xl font-semibold text-primary print:text-lg">
            Orden de compra #{orden.numero}
          </h1>
          <button
            onClick={() => window.print()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 print:hidden"
          >
            Imprimir / Descargar PDF
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-white p-5 sm:grid-cols-2 print:mt-3 print:border-0 print:p-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Proveedor</p>
            <p className="mt-1 text-sm text-zinc-900">{orden.proveedores?.nombre}</p>
            {orden.proveedores?.cuit && (
              <p className="text-xs text-zinc-500">CUIT: {orden.proveedores.cuit}</p>
            )}
            {orden.proveedores?.direccion && (
              <p className="text-xs text-zinc-500">{orden.proveedores.direccion}</p>
            )}
            {(orden.proveedores?.contacto_telefono || orden.proveedores?.contacto_email) && (
              <p className="text-xs text-zinc-500">
                {[orden.proveedores?.contacto_telefono, orden.proveedores?.contacto_email]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Fecha</p>
            <p className="mt-1 text-sm text-zinc-900">{fechaLegible(orden.fecha)}</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white print:mt-4 print:border-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-4 py-2 font-medium">Descripción</th>
                <th className="px-4 py-2 font-medium">Cantidad</th>
                <th className="px-4 py-2 font-medium">Precio unitario</th>
                <th className="px-4 py-2 font-medium">Subtotal</th>
                <th className="px-4 py-2 print:hidden"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-zinc-500">
                    Todavía no agregaste ítems.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 text-primary">{item.descripcion}</td>
                  <td className="px-4 py-2 text-primary">{item.cantidad}</td>
                  <td className="px-4 py-2 text-primary">
                    {formatearMonto(item.precio_unitario)}
                  </td>
                  <td className="px-4 py-2 text-primary">{formatearMonto(item.subtotal)}</td>
                  <td className="px-4 py-2 text-right print:hidden">
                    <button
                      onClick={() => handleQuitarItem(item.id)}
                      className="text-xs text-accent hover:underline"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 font-semibold">
                <td className="px-4 py-2" colSpan={3}>
                  Total
                </td>
                <td className="px-4 py-2">{formatearMonto(total)}</td>
                <td className="print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {puedeGestionar && (
          <form
            onSubmit={handleAgregarItem}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:hidden"
          >
            <h2 className="text-lg font-semibold text-primary">Agregar ítem</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-zinc-700">Descripción *</label>
                <input
                  required
                  type="text"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700">Cantidad *</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="any"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700">
                  Precio unitario *
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={precioUnitario}
                  onChange={(e) => setPrecioUnitario(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                />
              </div>
            </div>

            {errorItem && (
              <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                {errorItem}
              </p>
            )}

            <button
              type="submit"
              disabled={agregando}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {agregando ? "Agregando..." : "Agregar ítem"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
