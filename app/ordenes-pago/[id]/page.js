"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

// TODO: mismos datos de la empresa que en Órdenes de compra — reemplazar
// apenas Mauro los confirme.
const DATOS_EMPRESA = {
  nombre: "BSI Renovables",
  cuit: "",
  domicilio: "",
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

export default function DetalleOrdenPago() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";
  const router = useRouter();
  const { id } = useParams();

  const [orden, setOrden] = useState(null);
  const [detalle, setDetalle] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);

    const { data: ordenData, error: errOrden } = await supabase
      .from("ordenes_pago")
      .select(
        "*, proveedores(nombre, contacto_telefono, contacto_email, direccion, cuit)"
      )
      .eq("id", id)
      .single();

    if (errOrden) {
      setError(errOrden.message);
      setCargando(false);
      return;
    }

    const { data: detalleData } = await supabase
      .from("ordenes_pago_facturas")
      .select("*, facturas_compra(tipo_factura, numero_factura, fecha)")
      .eq("orden_pago_id", id)
      .order("monto", { ascending: false });

    setError(null);
    setOrden(ordenData);
    setDetalle(detalleData ?? []);
    setCargando(false);
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleAnular() {
    const confirmado = window.confirm(
      "¿Anular esta orden de pago? Se repone el monto a la Caja de efectivo y las facturas incluidas vuelven a quedar pendientes. No se puede deshacer."
    );
    if (!confirmado) return;

    setAnulando(true);
    setErrorAnular(null);

    const { error } = await supabase.rpc("anular_orden_pago", { p_orden_pago_id: id });

    if (error) {
      setErrorAnular(error.message);
      setAnulando(false);
      return;
    }

    setAnulando(false);
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
          <p className="text-accent">{error ?? "No se encontró la orden de pago."}</p>
        </div>
      </div>
    );
  }

  const anulada = orden.estado === "anulada";

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/ordenes-pago")}
          className="text-sm text-zinc-500 hover:text-zinc-800 print:hidden"
        >
          ← Volver a órdenes de pago
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
            Orden de pago #{orden.numero}
          </h1>
          <div className="flex items-center gap-2 print:hidden">
            {anulada && (
              <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm font-medium text-zinc-600">
                Anulada
              </span>
            )}
            <button
              onClick={() => window.print()}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Imprimir / Descargar PDF
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-white p-5 sm:grid-cols-2 print:mt-3 print:border-0 print:p-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Proveedor</p>
            <p className="mt-1 text-sm text-zinc-900">{orden.proveedores?.nombre}</p>
            {orden.proveedores?.cuit && (
              <p className="text-xs text-zinc-500">CUIT: {orden.proveedores.cuit}</p>
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
                <th className="px-4 py-2 font-medium">Factura</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Monto pagado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {detalle.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2 text-primary">
                    {d.facturas_compra?.tipo_factura} n.º {d.facturas_compra?.numero_factura}
                  </td>
                  <td className="px-4 py-2 text-primary">
                    {d.facturas_compra?.fecha ? fechaLegible(d.facturas_compra.fecha) : "—"}
                  </td>
                  <td className="px-4 py-2 text-primary">{formatearMonto(d.monto)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 font-semibold">
                <td className="px-4 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-2">{formatearMonto(orden.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:hidden">
          <h2 className="text-lg font-semibold text-primary">Trazabilidad</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Generada por {orden.creado_por_email ?? "desconocido"} el{" "}
            {new Date(orden.created_at).toLocaleString()}.
          </p>
          {anulada && (
            <p className="mt-1 text-sm text-zinc-600">
              Anulada por {orden.anulado_por_email ?? "desconocido"} el{" "}
              {new Date(orden.anulada_at).toLocaleString()}.
            </p>
          )}

          {puedeGestionar && !anulada && (
            <>
              {errorAnular && (
                <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                  {errorAnular}
                </p>
              )}
              <button
                onClick={handleAnular}
                disabled={anulando}
                className="mt-3 rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                {anulando ? "Anulando..." : "Anular orden de pago"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
