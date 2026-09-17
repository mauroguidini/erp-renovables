"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function NuevaOrdenPago() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";
  const router = useRouter();

  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());

  const [facturas, setFacturas] = useState([]);
  const [cargandoFacturas, setCargandoFacturas] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState(new Set());

  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("proveedores_nombre")
      .select("id, nombre")
      .order("nombre")
      .then(({ data }) => setProveedores(data ?? []));
  }, []);

  const cargarFacturasPendientes = useCallback(async (pid) => {
    if (!pid) {
      setFacturas([]);
      return;
    }
    setCargandoFacturas(true);
    const { data } = await supabase
      .from("facturas_compra")
      .select("*")
      .eq("proveedor_id", pid)
      .eq("tipo_documento", "factura")
      .eq("estado_pago", "pendiente")
      .order("fecha");
    setFacturas(data ?? []);
    setSeleccionadas(new Set());
    setCargandoFacturas(false);
  }, []);

  useEffect(() => {
    cargarFacturasPendientes(proveedorId);
  }, [proveedorId, cargarFacturasPendientes]);

  function toggleFactura(id) {
    setSeleccionadas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  const facturasSeleccionadas = facturas.filter((f) => seleccionadas.has(f.id));
  const total = facturasSeleccionadas.reduce((acc, f) => acc + Number(f.importe_total), 0);

  async function handleConfirmar() {
    if (seleccionadas.size === 0) return;

    setConfirmando(true);
    setError(null);

    const { data, error } = await supabase.rpc("confirmar_orden_pago", {
      p_proveedor_id: proveedorId,
      p_fecha: fecha,
      p_factura_ids: Array.from(seleccionadas),
    });

    if (error) {
      setError(error.message);
      setConfirmando(false);
      return;
    }

    router.push(`/ordenes-pago/${data}`);
  }

  if (!puedeGestionar) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">No tenés acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/ordenes-pago")}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Volver a órdenes de pago
        </button>

        <h1 className="mt-2 text-2xl font-semibold text-primary">Nueva orden de pago</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Al confirmar, se descuenta la Caja de efectivo y las facturas elegidas quedan marcadas
          como pagadas. No se puede deshacer con un simple "editar" — si te equivocás, después se
          anula desde el detalle de la orden.
        </p>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-700">Proveedor *</label>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">Elegí un proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Fecha *</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              />
            </div>
          </div>

          {!proveedorId && (
            <p className="mt-4 text-sm text-zinc-500">
              Elegí un proveedor para ver sus facturas pendientes de pago.
            </p>
          )}

          {proveedorId && cargandoFacturas && (
            <p className="mt-4 text-sm text-zinc-600">Cargando facturas...</p>
          )}

          {proveedorId && !cargandoFacturas && facturas.length === 0 && (
            <p className="mt-4 text-sm text-zinc-600">
              Este proveedor no tiene facturas pendientes de pago.
            </p>
          )}

          {proveedorId && !cargandoFacturas && facturas.length > 0 && (
            <div className="mt-4 divide-y divide-zinc-100">
              {facturas.map((f) => (
                <label
                  key={f.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={seleccionadas.has(f.id)}
                      onChange={() => toggleFactura(f.id)}
                    />
                    Factura {f.tipo_factura} n.º {f.numero_factura} — {fechaLegible(f.fecha)}
                  </span>
                  <span className="font-medium text-zinc-900">
                    {formatearMonto(f.importe_total)}
                  </span>
                </label>
              ))}
            </div>
          )}

          {seleccionadas.size > 0 && (
            <p className="mt-4 text-sm font-semibold text-zinc-900">
              Total a pagar: {formatearMonto(total)}
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
          )}

          <button
            onClick={handleConfirmar}
            disabled={confirmando || seleccionadas.size === 0}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {confirmando ? "Confirmando..." : "Confirmar orden de pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
