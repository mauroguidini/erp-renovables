"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";

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

export default function OrdenesPago() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";

  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("ordenes_pago")
      .select("*, proveedores(nombre)")
      .order("numero", { ascending: false });
    if (error) setError(error.message);
    else setError(null);
    setOrdenes(data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">Órdenes de pago</h1>
          <Link
            href="/ordenes-pago/nueva"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            + Nueva orden de pago
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Paga una o varias facturas de un proveedor y descuenta la Caja de efectivo.
        </p>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          {error && (
            <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
          )}

          {cargando && <p className="text-sm text-zinc-600">Cargando...</p>}

          {!cargando && ordenes.length === 0 && (
            <p className="text-sm text-zinc-600">Todavía no hay órdenes de pago.</p>
          )}

          {!cargando && ordenes.length > 0 && (
            <ul className="divide-y divide-zinc-100">
              {ordenes.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-3">
                  <div>
                    <Link
                      href={`/ordenes-pago/${o.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      OP #{o.numero} — {o.proveedores?.nombre ?? "—"}
                    </Link>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {fechaLegible(o.fecha)} · {formatearMonto(o.total)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      o.estado === "anulada"
                        ? "bg-zinc-200 text-zinc-600"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {o.estado === "anulada" ? "Anulada" : "Confirmada"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
