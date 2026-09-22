"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";
import ImportarChequesEmitidos, { ETIQUETA_ESTADO_CHEQUE } from "./ImportarChequesEmitidos";

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

const COLOR_ESTADO = {
  pendiente: "bg-zinc-100 text-zinc-700",
  en_proceso: "bg-blue-100 text-blue-700",
  cobrado: "bg-green-100 text-green-700",
  rechazado: "bg-accent/10 text-accent",
};

function coincideBusqueda(cheque, termino) {
  const limpio = termino.trim().toLowerCase();
  if (!limpio) return true;
  if (cheque.numero_cheque?.toLowerCase().includes(limpio)) return true;
  if (cheque.proveedores?.nombre?.toLowerCase().includes(limpio)) return true;
  if (cheque.proveedores?.cuit?.includes(limpio)) return true;
  return false;
}

// Panel de vincular a factura: muestra las facturas pendientes del mismo
// proveedor del cheque para elegir — nunca las de otro proveedor, y nunca
// se ofrece este panel si el cheque está rechazado (el RPC también lo
// bloquea del lado del servidor, esto es solo para no mostrar algo que
// va a fallar igual).
function VincularFactura({ cheque, onVinculado }) {
  const [abierto, setAbierto] = useState(false);
  const [facturas, setFacturas] = useState([]);
  const [cargandoFacturas, setCargandoFacturas] = useState(false);
  const [vinculandoId, setVinculandoId] = useState(null);
  const [error, setError] = useState(null);

  function handleAbrir() {
    setError(null);
    setAbierto(true);
  }

  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    setCargandoFacturas(true);
    supabase
      .from("facturas_compra")
      .select("id, tipo_factura, numero_factura, fecha, importe_total")
      .eq("proveedor_id", cheque.proveedor_id)
      .eq("tipo_documento", "factura")
      .eq("estado_pago", "pendiente")
      .order("fecha", { ascending: false })
      .then(({ data }) => {
        if (cancelado) return;
        setFacturas(data ?? []);
        setCargandoFacturas(false);
      });
    return () => {
      cancelado = true;
    };
  }, [abierto, cheque.proveedor_id]);

  async function handleVincular(facturaId) {
    setVinculandoId(facturaId);
    setError(null);
    const { error } = await supabase.rpc("vincular_cheque_factura", {
      p_cheque_id: cheque.id,
      p_factura_id: facturaId,
    });
    setVinculandoId(null);
    if (error) {
      setError(error.message);
      return;
    }
    setAbierto(false);
    await onVinculado();
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={handleAbrir}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
      >
        Vincular a factura
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-700">
          Facturas pendientes de {cheque.proveedores?.nombre ?? "este proveedor"}
        </p>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-zinc-500 hover:underline"
        >
          Cerrar
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-accent">{error}</p>}
      {cargandoFacturas && <p className="mt-2 text-xs text-zinc-500">Buscando facturas...</p>}
      {!cargandoFacturas && facturas.length === 0 && (
        <p className="mt-2 text-xs text-zinc-500">Este proveedor no tiene facturas pendientes.</p>
      )}

      {facturas.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {facturas.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5"
            >
              <span className="text-xs text-zinc-600">
                {f.tipo_factura} n.º {f.numero_factura} · {fechaLegible(f.fecha)} ·{" "}
                {formatearMonto(f.importe_total)}
              </span>
              <button
                type="button"
                onClick={() => handleVincular(f.id)}
                disabled={vinculandoId !== null}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {vinculandoId === f.id ? "Vinculando..." : "Vincular"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilaCheque({ cheque, onCambio }) {
  const [desvinculando, setDesvinculando] = useState(false);
  const [error, setError] = useState(null);

  async function handleDesvincular() {
    const confirmado = window.confirm(
      "¿Desvincular este cheque de la factura? La factura vuelve a quedar pendiente de pago."
    );
    if (!confirmado) return;

    setDesvinculando(true);
    setError(null);
    const { error } = await supabase.rpc("desvincular_cheque_factura", {
      p_cheque_id: cheque.id,
    });
    if (error) {
      setError(error.message);
      setDesvinculando(false);
      return;
    }
    setDesvinculando(false);
    await onCambio();
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div>
        <p className="text-sm font-medium text-zinc-900">
          Cheque {cheque.numero_cheque} · {formatearMonto(cheque.monto)}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {fechaLegible(cheque.fecha_pago)} · {cheque.bancos?.nombre ?? "—"} ·{" "}
          {cheque.proveedores?.nombre ?? "(proveedor eliminado)"}
        </p>
        {cheque.facturas_compra && (
          <p className="mt-0.5 text-xs text-zinc-500">
            Vinculado a {cheque.facturas_compra.tipo_factura} n.º{" "}
            {cheque.facturas_compra.numero_factura}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-accent">{error}</p>}
      </div>

      <div className="flex flex-col items-end gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO[cheque.estado]}`}
        >
          {ETIQUETA_ESTADO_CHEQUE[cheque.estado]}
        </span>

        {cheque.estado !== "rechazado" &&
          (cheque.factura_id ? (
            <button
              type="button"
              onClick={handleDesvincular}
              disabled={desvinculando}
              className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
            >
              {desvinculando ? "Desvinculando..." : "Desvincular"}
            </button>
          ) : (
            <VincularFactura cheque={cheque} onVinculado={onCambio} />
          ))}
      </div>
    </div>
  );
}

export default function ChequesEmitidos() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";

  const [bancos, setBancos] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [soloSinVincular, setSoloSinVincular] = useState(false);

  const cargarCheques = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("cheques_emitidos")
      .select("*, proveedores(nombre, cuit), bancos(nombre), facturas_compra(tipo_factura, numero_factura, importe_total)")
      .order("fecha_pago", { ascending: false });
    if (error) setError(error.message);
    else setError(null);
    setCheques(data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    supabase
      .from("bancos")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setBancos(data ?? []));
    cargarCheques();
  }, [cargarCheques]);

  if (!puedeGestionar) {
    return (
      <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">No tenés acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  const chequesFiltrados = cheques
    .filter((c) => !filtroEstado || c.estado === filtroEstado)
    .filter((c) => !soloSinVincular || !c.factura_id)
    .filter((c) => coincideBusqueda(c, busqueda));

  return (
    <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-primary">Cheques emitidos</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Cheques propios entregados a proveedores. Vinculá cada uno a la factura que paga — eso
          la marca como pagada.
        </p>

        <ImportarChequesEmitidos bancos={bancos} onImportado={cargarCheques} />

        <div className="mt-4 flex flex-wrap gap-2 sm:mt-6">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por N.º de cheque, proveedor o CUIT..."
            className="w-full flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 sm:w-auto"
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Todos los estados</option>
            {Object.entries(ETIQUETA_ESTADO_CHEQUE).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={soloSinVincular}
              onChange={(e) => setSoloSinVincular(e.target.checked)}
              className="h-4 w-4"
            />
            Solo sin vincular
          </label>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
        )}

        {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

        {!cargando && (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-500">{chequesFiltrados.length} cheques</p>
            {chequesFiltrados.length === 0 && (
              <p className="mt-2 text-sm text-zinc-600">No hay cheques para este filtro.</p>
            )}
            {chequesFiltrados.length > 0 && (
              <div className="mt-2 divide-y divide-zinc-100">
                {chequesFiltrados.map((c) => (
                  <FilaCheque key={c.id} cheque={c} onCambio={cargarCheques} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
