"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";
import Seccion from "../Seccion";
import ImportarExtracto from "./ImportarExtracto";
import { normalizarTexto, esIngresoCheque, esRechazoCheque } from "./clasificacionMovimientos";

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

function normalizarCuit(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

// "2026-09-15" -> "septiembre 2026". Solo se usa para agrupar, nunca se
// guarda — el mes "real" para agrupar siempre sale de partir fecha (texto
// "YYYY-MM"), no de este formateo.
function formatearMes(mesIso) {
  const [a, m] = mesIso.split("-").map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Buscador simple del lado del cliente (ya está todo cargado en memoria,
// no hace falta ir a la base) — por concepto, número de comprobante, CUIT
// detectado o nombre del proveedor si el CUIT matcheó a uno.
function coincideBusqueda(movimiento, termino, proveedores) {
  const limpio = termino.trim().toLowerCase();
  if (!limpio) return true;

  if (movimiento.concepto?.toLowerCase().includes(limpio)) return true;
  if (movimiento.numero_comprobante?.toLowerCase().includes(limpio)) return true;

  const soloDigitos = termino.replace(/\D/g, "");
  if (soloDigitos && movimiento.cuit_detectado?.includes(soloDigitos)) return true;

  if (movimiento.cuit_detectado) {
    const proveedor = proveedores.find(
      (p) => normalizarCuit(p.cuit) === movimiento.cuit_detectado
    );
    if (proveedor?.nombre.toLowerCase().includes(limpio)) return true;
  }

  return false;
}

const ETIQUETA_CLASIFICACION = {
  impuestos: "Gasto impuestos",
  gastos_bancarios: "Gastos bancarios",
  sueldos: "Sueldos",
  cheque_rechazado: "Cheque rechazado (emparejado)",
};

function MovimientoInfo({ movimiento }) {
  return (
    <div>
      <p className="text-sm font-medium text-zinc-900">
        {formatearMonto(movimiento.debito)}{" "}
        <span className="font-normal text-zinc-500">— débito</span>
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">
        {fechaLegible(movimiento.fecha)}
        {movimiento.numero_comprobante && ` · Comp. ${movimiento.numero_comprobante}`}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{movimiento.concepto}</p>
    </div>
  );
}

// Una factura "coincide" si es del proveedor cuyo CUIT aparece en el
// concepto, está pendiente, y su importe está dentro del 1% (o $1, lo que
// sea mayor) del débito del movimiento — margen chico para redondeos, no
// para adivinar entre importes distintos.
function esMontoParecido(importeFactura, debitoMovimiento) {
  const tolerancia = Math.max(1, Number(importeFactura) * 0.01);
  return Math.abs(Number(importeFactura) - Number(debitoMovimiento)) <= tolerancia;
}

// Panel de conciliación manual: para cuando la transferencia paga VARIAS
// facturas juntas del mismo proveedor (o cuando el sistema no encontró
// ninguna coincidencia sola). Muestra TODAS las facturas pendientes del
// proveedor elegido, no solo las de importe parecido — la elección es
// tuya, el sistema solo suma y te avisa si el total no coincide.
function ConciliacionManual({ movimiento, proveedores, proveedorSugerido, onConciliar }) {
  const [abierto, setAbierto] = useState(false);
  const [proveedorId, setProveedorId] = useState("");
  const [facturas, setFacturas] = useState([]);
  const [cargandoFacturas, setCargandoFacturas] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function handleAbrir() {
    setProveedorId(proveedorSugerido?.id ?? "");
    setSeleccionadas(new Set());
    setError(null);
    setAbierto(true);
  }

  useEffect(() => {
    if (!abierto || !proveedorId) {
      setFacturas([]);
      return;
    }
    let cancelado = false;
    setCargandoFacturas(true);
    supabase
      .from("facturas_compra")
      .select("id, tipo_factura, numero_factura, fecha, importe_total")
      .eq("proveedor_id", proveedorId)
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
  }, [abierto, proveedorId]);

  function toggleFactura(facturaId) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(facturaId)) next.delete(facturaId);
      else next.add(facturaId);
      return next;
    });
  }

  const total = facturas
    .filter((f) => seleccionadas.has(f.id))
    .reduce((acc, f) => acc + Number(f.importe_total), 0);
  const coincide = seleccionadas.size > 0 && esMontoParecido(total, movimiento.debito);

  async function handleConciliar() {
    if (seleccionadas.size === 0) return;
    setGuardando(true);
    setError(null);
    const err = await onConciliar(movimiento.id, Array.from(seleccionadas));
    setGuardando(false);
    if (err) setError(err);
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={handleAbrir}
        className="mt-2 text-xs font-medium text-primary hover:underline"
      >
        Conciliación manual (elegir una o varias facturas)
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-zinc-200 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <label className="block text-xs font-medium text-zinc-700">Proveedor</label>
          <select
            value={proveedorId}
            onChange={(e) => {
              setProveedorId(e.target.value);
              setSeleccionadas(new Set());
            }}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
          >
            <option value="">Elegí un proveedor...</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-zinc-500 hover:text-zinc-800"
        >
          Cerrar
        </button>
      </div>

      {cargandoFacturas && <p className="mt-2 text-xs text-zinc-400">Buscando facturas...</p>}

      {!cargandoFacturas && proveedorId && facturas.length === 0 && (
        <p className="mt-2 text-xs text-zinc-400">Este proveedor no tiene facturas pendientes.</p>
      )}

      {!cargandoFacturas && facturas.length > 0 && (
        <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
          {facturas.map((f) => (
            <label
              key={f.id}
              className="flex items-center gap-2 rounded-md border border-zinc-100 p-1.5 text-xs text-zinc-700"
            >
              <input
                type="checkbox"
                checked={seleccionadas.has(f.id)}
                onChange={() => toggleFactura(f.id)}
                className="h-4 w-4 shrink-0"
              />
              Factura {f.tipo_factura} n.º {f.numero_factura} — {fechaLegible(f.fecha)} —{" "}
              {formatearMonto(f.importe_total)}
            </label>
          ))}
        </div>
      )}

      {seleccionadas.size > 0 && (
        <p
          className={`mt-2 text-xs font-medium ${coincide ? "text-green-700" : "text-yellow-700"}`}
        >
          Total seleccionado: {formatearMonto(total)} — movimiento: {formatearMonto(movimiento.debito)}
          {coincide ? " (coincide)" : " (no coincide exacto — revisá antes de conciliar)"}
        </p>
      )}

      {error && <p className="mt-1 text-xs text-accent">{error}</p>}

      <button
        type="button"
        onClick={handleConciliar}
        disabled={seleccionadas.size === 0 || guardando}
        className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {guardando ? "Conciliando..." : `Conciliar ${seleccionadas.size || ""} factura(s)`}
      </button>
    </div>
  );
}

// Panel para agrupar VARIOS movimientos seleccionados (ej: dos
// transferencias del mismo día) contra varias facturas de un mismo
// proveedor, en un solo pago. Mismo mecanismo que ConciliacionManual,
// pero sumando el débito de todos los movimientos elegidos, no de uno
// solo.
function ConciliacionManualGrupo({ movimientos, proveedores, onConciliar, onCerrar }) {
  const [proveedorId, setProveedorId] = useState("");
  const [facturas, setFacturas] = useState([]);
  const [cargandoFacturas, setCargandoFacturas] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!proveedorId) {
      setFacturas([]);
      return;
    }
    let cancelado = false;
    setCargandoFacturas(true);
    supabase
      .from("facturas_compra")
      .select("id, tipo_factura, numero_factura, fecha, importe_total")
      .eq("proveedor_id", proveedorId)
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
  }, [proveedorId]);

  function toggleFactura(facturaId) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(facturaId)) next.delete(facturaId);
      else next.add(facturaId);
      return next;
    });
  }

  const totalMovimientos = movimientos.reduce((acc, m) => acc + Number(m.debito), 0);
  const totalFacturas = facturas
    .filter((f) => seleccionadas.has(f.id))
    .reduce((acc, f) => acc + Number(f.importe_total), 0);
  const coincide = seleccionadas.size > 0 && esMontoParecido(totalFacturas, totalMovimientos);

  async function handleConciliar() {
    if (seleccionadas.size === 0) return;
    setGuardando(true);
    setError(null);
    const err = await onConciliar(
      movimientos.map((m) => m.id),
      Array.from(seleccionadas)
    );
    setGuardando(false);
    if (err) setError(err);
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-primary">
          Agrupando {movimientos.length} movimientos — total transferido:{" "}
          {formatearMonto(totalMovimientos)}
        </p>
        <button
          type="button"
          onClick={onCerrar}
          className="text-xs text-zinc-500 hover:text-zinc-800"
        >
          Cerrar
        </button>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-zinc-600">
        {movimientos.map((m) => (
          <li key={m.id}>
            {fechaLegible(m.fecha)} · {formatearMonto(m.debito)} · {m.concepto}
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <label className="block text-xs font-medium text-zinc-700">Proveedor</label>
        <select
          value={proveedorId}
          onChange={(e) => {
            setProveedorId(e.target.value);
            setSeleccionadas(new Set());
          }}
          className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
        >
          <option value="">Elegí un proveedor...</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      {cargandoFacturas && <p className="mt-2 text-xs text-zinc-400">Buscando facturas...</p>}

      {!cargandoFacturas && proveedorId && facturas.length === 0 && (
        <p className="mt-2 text-xs text-zinc-400">Este proveedor no tiene facturas pendientes.</p>
      )}

      {!cargandoFacturas && facturas.length > 0 && (
        <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
          {facturas.map((f) => (
            <label
              key={f.id}
              className="flex items-center gap-2 rounded-md border border-zinc-100 bg-white p-1.5 text-xs text-zinc-700"
            >
              <input
                type="checkbox"
                checked={seleccionadas.has(f.id)}
                onChange={() => toggleFactura(f.id)}
                className="h-4 w-4 shrink-0"
              />
              Factura {f.tipo_factura} n.º {f.numero_factura} — {fechaLegible(f.fecha)} —{" "}
              {formatearMonto(f.importe_total)}
            </label>
          ))}
        </div>
      )}

      {seleccionadas.size > 0 && (
        <p
          className={`mt-2 text-xs font-medium ${coincide ? "text-green-700" : "text-yellow-700"}`}
        >
          Total facturas: {formatearMonto(totalFacturas)} — total transferencias:{" "}
          {formatearMonto(totalMovimientos)}
          {coincide ? " (coincide)" : " (no coincide exacto — revisá antes de conciliar)"}
        </p>
      )}

      {error && <p className="mt-1 text-xs text-accent">{error}</p>}

      <button
        type="button"
        onClick={handleConciliar}
        disabled={seleccionadas.size === 0 || guardando}
        className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {guardando ? "Conciliando..." : `Conciliar ${movimientos.length} movimientos con ${seleccionadas.size || ""} factura(s)`}
      </button>
    </div>
  );
}

function FilaPendiente({
  movimiento,
  proveedor,
  proveedores,
  candidatos,
  seleccionado,
  onToggleSeleccionado,
  onConciliar,
  onConciliarVarias,
}) {
  const [conciliandoId, setConciliandoId] = useState(null);
  const [error, setError] = useState(null);

  async function handleConciliar(facturaId) {
    setConciliandoId(facturaId);
    setError(null);
    const err = await onConciliar(movimiento.id, facturaId);
    setConciliandoId(null);
    if (err) setError(err);
  }

  return (
    <div className="flex items-start gap-3 py-3">
      <input
        type="checkbox"
        checked={seleccionado}
        onChange={() => onToggleSeleccionado(movimiento.id)}
        title="Seleccionar para conciliar en lote o agrupar con otras transferencias"
        className="mt-1 h-4 w-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <MovimientoInfo movimiento={movimiento} />

        {movimiento.cuit_detectado && (
          <p className="mt-1 text-xs text-zinc-400">
            CUIT detectado: {movimiento.cuit_detectado}
            {proveedor ? ` — ${proveedor.nombre}` : " (no coincide con ningún proveedor cargado)"}
          </p>
        )}
        {!movimiento.cuit_detectado && (
          <p className="mt-1 text-xs text-zinc-400">No se detectó un CUIT en el concepto.</p>
        )}

        {error && <p className="mt-1 text-xs text-accent">{error}</p>}

        {candidatos === undefined && proveedor && (
          <p className="mt-2 text-xs text-zinc-400">Buscando facturas de {proveedor.nombre}...</p>
        )}

        {candidatos && candidatos.length === 0 && proveedor && (
          <p className="mt-2 text-xs text-zinc-400">
            Sin facturas pendientes de {proveedor.nombre} con un importe parecido.
          </p>
        )}

        {candidatos && candidatos.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {candidatos.map((f) => (
              <div
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 p-2"
              >
                <span className="text-xs text-zinc-700">
                  Factura {f.tipo_factura} n.º {f.numero_factura} — {fechaLegible(f.fecha)} —{" "}
                  {formatearMonto(f.importe_total)}
                </span>
                <button
                  type="button"
                  onClick={() => handleConciliar(f.id)}
                  disabled={conciliandoId !== null}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {conciliandoId === f.id ? "Conciliando..." : "Conciliar"}
                </button>
              </div>
            ))}
          </div>
        )}

        <ConciliacionManual
          movimiento={movimiento}
          proveedores={proveedores}
          proveedorSugerido={proveedor}
          onConciliar={onConciliarVarias}
        />
      </div>
    </div>
  );
}

// El extracto de este banco no trae ningún número de cheque, así que acá
// se sugieren candidatos por monto EXACTO (no "parecido") + fecha de
// ingreso anterior o igual a la del rechazo — pero nunca se empareja
// solo: el usuario tiene que confirmar cada pareja a mano, una por una.
function FilaRechazoCheque({ movimiento, candidatos, onConfirmar }) {
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [error, setError] = useState(null);

  async function handleConfirmar(ingresoId) {
    setConfirmandoId(ingresoId);
    setError(null);
    const err = await onConfirmar(ingresoId, movimiento.id);
    setConfirmandoId(null);
    if (err) setError(err);
  }

  return (
    <div className="py-3">
      <MovimientoInfo movimiento={movimiento} />
      {error && <p className="mt-1 text-xs text-accent">{error}</p>}

      {candidatos.length === 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          No se encontró ningún ingreso por el mismo monto exacto — revisalo a mano en el extracto.
        </p>
      )}

      {candidatos.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {candidatos.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5"
            >
              <span className="text-xs text-zinc-600">
                Ingreso del {fechaLegible(c.fecha)} · {formatearMonto(c.credito)} · {c.concepto}
              </span>
              <button
                type="button"
                onClick={() => handleConfirmar(c.id)}
                disabled={confirmandoId !== null}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {confirmandoId === c.id ? "Confirmando..." : "Confirmar pareja"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Mismo criterio que "Por categoría" en Centro de costo: se agrupa en un
// solo paso en JS sobre lo que ya está cargado en memoria, sin pedirle un
// group by a la base. Acá se agrupa dos niveles: tipo de gasto (Impuestos,
// Gastos bancarios, Sueldos, Cheque rechazado) y, adentro, por mes.
function ResumenGastosClasificados({ movimientos }) {
  const porTipo = {};
  for (const m of movimientos) {
    const tipo = m.clasificacion ?? "otro";
    const mes = m.fecha.slice(0, 7);
    porTipo[tipo] ??= { total: 0, porMes: {} };
    porTipo[tipo].total += Number(m.debito);
    porTipo[tipo].porMes[mes] = (porTipo[tipo].porMes[mes] ?? 0) + Number(m.debito);
  }

  const tipos = Object.entries(porTipo).sort((a, b) => b[1].total - a[1].total);

  if (tipos.length === 0) {
    return <p className="text-sm text-zinc-600">Todavía no hay movimientos clasificados.</p>;
  }

  return (
    <div className="space-y-4">
      {tipos.map(([tipo, info]) => {
        const meses = Object.entries(info.porMes).sort((a, b) => (a[0] < b[0] ? 1 : -1));
        return (
          <div key={tipo}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-700">
                {ETIQUETA_CLASIFICACION[tipo] ?? tipo}
              </h3>
              <span className="text-sm font-semibold text-zinc-900">
                {formatearMonto(info.total)}
              </span>
            </div>
            <div className="mt-1 divide-y divide-zinc-100 border-t border-zinc-100 pl-3">
              {meses.map(([mes, total]) => (
                <div key={mes} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-zinc-600">{formatearMes(mes)}</span>
                  <span className="text-zinc-700">{formatearMonto(total)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilaClasificada({ movimiento, onCambio }) {
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [error, setError] = useState(null);

  async function handleDeshacer() {
    const confirmado = window.confirm(
      "¿Deshacer este emparejamiento de cheque? Los dos movimientos vuelven a quedar sin resolver."
    );
    if (!confirmado) return;

    setDeshaciendo(true);
    setError(null);
    const { error } = await supabase.rpc("deshacer_pareja_cheque", {
      p_movimiento_id: movimiento.id,
    });
    if (error) {
      setError(error.message);
      setDeshaciendo(false);
      return;
    }
    setDeshaciendo(false);
    await onCambio();
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-3">
      <div>
        <MovimientoInfo movimiento={movimiento} />
        {error && <p className="mt-1 text-xs text-accent">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
          {ETIQUETA_CLASIFICACION[movimiento.clasificacion] ?? movimiento.clasificacion}
        </span>
        {movimiento.clasificacion === "cheque_rechazado" && (
          <button
            type="button"
            onClick={handleDeshacer}
            disabled={deshaciendo}
            className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
          >
            {deshaciendo ? "Deshaciendo..." : "Deshacer"}
          </button>
        )}
      </div>
    </div>
  );
}

function FilaConciliado({ movimiento, onCambio }) {
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [error, setError] = useState(null);

  async function handleDeshacer() {
    const confirmado = window.confirm(
      "¿Deshacer esta conciliación? Se anula la orden de pago y la factura vuelve a pendiente. El movimiento bancario no se borra."
    );
    if (!confirmado) return;

    setDeshaciendo(true);
    setError(null);
    const { error } = await supabase.rpc("desconciliar_movimiento_bancario", {
      p_movimiento_id: movimiento.id,
    });
    if (error) {
      setError(error.message);
      setDeshaciendo(false);
      return;
    }
    setDeshaciendo(false);
    await onCambio();
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-3">
      <div>
        <MovimientoInfo movimiento={movimiento} />
        <p className="mt-1 text-xs text-zinc-400">
          Conciliado por {movimiento.conciliado_por_email ?? "desconocido"} el{" "}
          {new Date(movimiento.conciliado_at).toLocaleString()}
        </p>
        {error && <p className="mt-1 text-xs text-accent">{error}</p>}
      </div>
      <button
        type="button"
        onClick={handleDeshacer}
        disabled={deshaciendo}
        className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
      >
        {deshaciendo ? "Deshaciendo..." : "Deshacer"}
      </button>
    </div>
  );
}

export default function ConciliacionBancaria() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";

  const [bancos, setBancos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  // Ingresos (créditos) candidatos a pareja de un cheque rechazado. Van
  // aparte porque quedan con estado "no_aplica" (como cualquier crédito) y
  // la consulta principal de abajo los excluye a propósito.
  const [ingresosCheque, setIngresosCheque] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [candidatosPorMovimiento, setCandidatosPorMovimiento] = useState({});
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [conciliandoLote, setConciliandoLote] = useState(false);
  const [resultadoLote, setResultadoLote] = useState(null);
  const [mostrarGrupo, setMostrarGrupo] = useState(false);

  const [busqueda, setBusqueda] = useState("");

  const cargarMovimientos = useCallback(async () => {
    setCargando(true);
    const [{ data, error }, { data: ingresos }] = await Promise.all([
      supabase
        .from("movimientos_bancarios")
        .select("*")
        .neq("estado", "no_aplica")
        .order("fecha", { ascending: false }),
      supabase
        .from("movimientos_bancarios")
        .select("*")
        .gt("credito", 0)
        .is("cheque_pareja_id", null)
        .order("fecha", { ascending: false }),
    ]);
    if (error) setError(error.message);
    else setError(null);
    setMovimientos(data ?? []);
    setIngresosCheque(
      (ingresos ?? []).filter((m) => esIngresoCheque(normalizarTexto(m.concepto)))
    );
    setCargando(false);
  }, []);

  useEffect(() => {
    supabase
      .from("bancos")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setBancos(data ?? []));
    supabase
      .from("proveedores_nombre")
      .select("id, nombre, cuit")
      .order("nombre")
      .then(({ data }) => setProveedores(data ?? []));
    cargarMovimientos();
  }, [cargarMovimientos]);

  // Sin filtrar por búsqueda — el cálculo de candidatos siempre corre
  // sobre TODOS los pendientes, la búsqueda solo recorta qué se muestra.
  // Los rechazos de cheque quedan afuera: no son un pago a un proveedor,
  // así que no tiene sentido ofrecerles una factura — se resuelven aparte
  // en su propia sección, más abajo.
  const todosPendientes = movimientos.filter(
    (m) => m.estado === "pendiente" && !esRechazoCheque(normalizarTexto(m.concepto))
  );

  // Candidatos de TODOS los pendientes en un solo lote (una consulta por
  // proveedor involucrado, no una por movimiento) — así se puede armar la
  // lista con checkbox sin pegarle a la base una vez por fila.
  useEffect(() => {
    let cancelado = false;

    async function calcular() {
      const conCuit = todosPendientes.filter((m) => m.cuit_detectado);
      if (conCuit.length === 0) {
        setCandidatosPorMovimiento({});
        return;
      }

      const proveedorIds = [
        ...new Set(
          conCuit
            .map((m) => proveedores.find((p) => normalizarCuit(p.cuit) === m.cuit_detectado)?.id)
            .filter(Boolean)
        ),
      ];
      if (proveedorIds.length === 0) {
        setCandidatosPorMovimiento({});
        return;
      }

      const { data } = await supabase
        .from("facturas_compra")
        .select("id, proveedor_id, tipo_factura, numero_factura, fecha, importe_total")
        .in("proveedor_id", proveedorIds)
        .eq("tipo_documento", "factura")
        .eq("estado_pago", "pendiente");

      if (cancelado) return;

      const mapa = {};
      for (const m of conCuit) {
        const proveedor = proveedores.find((p) => normalizarCuit(p.cuit) === m.cuit_detectado);
        if (!proveedor) continue;
        mapa[m.id] = (data ?? []).filter(
          (f) => f.proveedor_id === proveedor.id && esMontoParecido(f.importe_total, m.debito)
        );
      }
      setCandidatosPorMovimiento(mapa);
    }

    calcular();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosPendientes.map((m) => m.id).join(","), proveedores]);

  function toggleSeleccionado(movimientoId) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(movimientoId)) next.delete(movimientoId);
      else next.add(movimientoId);
      return next;
    });
  }

  // La búsqueda es un filtro puramente visual — recorta qué se muestra
  // (y sobre qué actúan "seleccionar todos"/el lote), no afecta los
  // candidatos ya calculados arriba sobre todosPendientes.
  const pendientes = todosPendientes.filter((m) => coincideBusqueda(m, busqueda, proveedores));

  // Solo se puede tildar (y mandar en el lote automático) un movimiento
  // con UNA sola coincidencia — con varias, hay que elegir a mano cuál
  // con la conciliación manual, no se adivina.
  const seleccionables = pendientes.filter((m) => candidatosPorMovimiento[m.id]?.length === 1);

  function toggleSeleccionarTodos() {
    setSeleccionados((prev) =>
      prev.size === seleccionables.length ? new Set() : new Set(seleccionables.map((m) => m.id))
    );
  }

  // Una sola conciliación — la usan el botón individual de cada factura
  // candidata, el botón de lote, y los dos paneles de conciliación manual
  // (uno o varios movimientos). Toma arrays de los dos lados porque una o
  // varias transferencias pueden pagar juntas una o varias facturas del
  // mismo proveedor.
  async function conciliar(movimientoIds, facturaIds) {
    const { error } = await supabase.rpc("conciliar_movimientos_bancarios", {
      p_movimiento_ids: movimientoIds,
      p_factura_ids: facturaIds,
    });
    if (error) return error.message;
    return null;
  }

  async function handleConfirmarParejaCheque(ingresoId, rechazoId) {
    const { error } = await supabase.rpc("confirmar_pareja_cheque", {
      p_ingreso_id: ingresoId,
      p_rechazo_id: rechazoId,
    });
    if (error) return error.message;
    await cargarMovimientos();
    return null;
  }

  async function handleConciliarUno(movimientoId, facturaId) {
    const err = await conciliar([movimientoId], [facturaId]);
    if (!err) await cargarMovimientos();
    return err;
  }

  async function handleConciliarVarias(movimientoId, facturaIds) {
    const err = await conciliar([movimientoId], facturaIds);
    if (!err) await cargarMovimientos();
    return err;
  }

  async function handleConciliarGrupo(movimientoIds, facturaIds) {
    const err = await conciliar(movimientoIds, facturaIds);
    if (!err) {
      setSeleccionados(new Set());
      await cargarMovimientos();
    }
    return err;
  }

  async function handleConciliarSeleccionados() {
    const items = pendientes.filter((m) => seleccionados.has(m.id));
    if (items.length === 0) return;

    const confirmado = window.confirm(
      `¿Conciliar ${items.length} movimientos? Se va a generar una orden de pago por cada uno.`
    );
    if (!confirmado) return;

    setConciliandoLote(true);
    setResultadoLote(null);

    let ok = 0;
    let saltados = 0;
    const fallidos = [];
    for (const m of items) {
      const candidato = candidatosPorMovimiento[m.id]?.[0];
      if (!candidato) {
        saltados++;
        continue;
      }
      const err = await conciliar([m.id], [candidato.id]);
      if (err) fallidos.push(`${m.concepto}: ${err}`);
      else ok++;
    }

    setConciliandoLote(false);
    setSeleccionados(new Set());
    setResultadoLote({ ok, saltados, fallidos });
    await cargarMovimientos();
  }

  if (!puedeGestionar) {
    return (
      <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">No tenés acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  const clasificados = movimientos
    .filter((m) => m.estado === "clasificado")
    .filter((m) => coincideBusqueda(m, busqueda, proveedores));
  const conciliados = movimientos
    .filter((m) => m.estado === "conciliado")
    .filter((m) => coincideBusqueda(m, busqueda, proveedores));

  const rechazosChequePendientes = movimientos
    .filter(
      (m) =>
        m.estado === "pendiente" &&
        m.debito > 0 &&
        !m.cheque_pareja_id &&
        esRechazoCheque(normalizarTexto(m.concepto))
    )
    .filter((m) => coincideBusqueda(m, busqueda, proveedores));

  function candidatosIngresoPara(rechazo) {
    return ingresosCheque
      .filter(
        (i) =>
          i.banco_id === rechazo.banco_id &&
          Number(i.credito) === Number(rechazo.debito) &&
          i.fecha <= rechazo.fecha
      )
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-primary">Conciliación bancaria</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Solo pagos salientes por ahora. El sistema nunca concilia solo — siempre confirmás vos
          con el botón &ldquo;Conciliar&rdquo;.
        </p>

        <ImportarExtracto bancos={bancos} onImportado={cargarMovimientos} />

        <div className="mt-4 sm:mt-6">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por concepto, N.º de comprobante, CUIT o proveedor..."
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          />
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
        )}

        {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

        {!cargando && (
          <>
            <Seccion titulo={`Pendientes de conciliar (${pendientes.length})`} defaultAbierto>
              {pendientes.length === 0 && (
                <p className="text-sm text-zinc-600">No hay movimientos pendientes de revisar.</p>
              )}

              {(seleccionables.length > 0 || seleccionados.size > 0) && (
                <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  {seleccionables.length > 0 && (
                    <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                      <input
                        type="checkbox"
                        checked={
                          seleccionables.length > 0 && seleccionados.size === seleccionables.length
                        }
                        onChange={toggleSeleccionarTodos}
                        className="h-4 w-4"
                      />
                      Seleccionar los {seleccionables.length} con una sola coincidencia
                    </label>
                  )}
                  {seleccionados.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        {seleccionados.size} seleccionados
                      </span>
                      <button
                        type="button"
                        onClick={handleConciliarSeleccionados}
                        disabled={conciliandoLote}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                      >
                        {conciliandoLote ? "Conciliando..." : "Conciliar automáticos"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMostrarGrupo(true)}
                        className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        Agrupar seleccionados en un pago manual
                      </button>
                    </div>
                  )}
                </div>
              )}

              {mostrarGrupo && seleccionados.size > 0 && (
                <div className="mt-3">
                  <ConciliacionManualGrupo
                    movimientos={pendientes.filter((m) => seleccionados.has(m.id))}
                    proveedores={proveedores}
                    onConciliar={handleConciliarGrupo}
                    onCerrar={() => setMostrarGrupo(false)}
                  />
                </div>
              )}

              {resultadoLote && (
                <div className="mt-3 rounded-md bg-green-50 px-2.5 py-1.5 text-xs text-green-700">
                  <p>
                    Se conciliaron {resultadoLote.ok} movimientos.
                    {resultadoLote.saltados > 0 &&
                      ` ${resultadoLote.saltados} se saltearon por no tener una sola coincidencia automática (usá la conciliación manual para esos).`}
                  </p>
                  {resultadoLote.fallidos.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-accent">
                      {resultadoLote.fallidos.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {pendientes.length > 0 && (
                <div className="mt-2 divide-y divide-zinc-100">
                  {pendientes.map((m) => {
                    const proveedor = m.cuit_detectado
                      ? proveedores.find((p) => normalizarCuit(p.cuit) === m.cuit_detectado)
                      : null;
                    return (
                      <FilaPendiente
                        key={m.id}
                        movimiento={m}
                        proveedor={proveedor}
                        proveedores={proveedores}
                        candidatos={candidatosPorMovimiento[m.id]}
                        seleccionado={seleccionados.has(m.id)}
                        onToggleSeleccionado={toggleSeleccionado}
                        onConciliar={handleConciliarUno}
                        onConciliarVarias={handleConciliarVarias}
                      />
                    );
                  })}
                </div>
              )}
            </Seccion>

            <Seccion
              titulo={`Cheques rechazados a revisar (${rechazosChequePendientes.length})`}
              defaultAbierto
            >
              <p className="text-xs text-zinc-500">
                Este banco no informa el número de cheque, así que acá se sugiere por monto exacto
                + fecha — nunca se empareja solo, confirmá cada pareja a mano.
              </p>
              {rechazosChequePendientes.length === 0 && (
                <p className="mt-2 text-sm text-zinc-600">No hay rechazos de cheque para revisar.</p>
              )}
              {rechazosChequePendientes.length > 0 && (
                <div className="mt-2 divide-y divide-zinc-100">
                  {rechazosChequePendientes.map((m) => (
                    <FilaRechazoCheque
                      key={m.id}
                      movimiento={m}
                      candidatos={candidatosIngresoPara(m)}
                      onConfirmar={handleConfirmarParejaCheque}
                    />
                  ))}
                </div>
              )}
            </Seccion>

            <Seccion titulo={`Clasificados automáticamente (${clasificados.length})`}>
              <ResumenGastosClasificados movimientos={clasificados} />

              {clasificados.length > 0 && (
                <div className="mt-4 divide-y divide-zinc-100 border-t border-zinc-200 pt-2">
                  {clasificados.map((m) => (
                    <FilaClasificada key={m.id} movimiento={m} onCambio={cargarMovimientos} />
                  ))}
                </div>
              )}
            </Seccion>

            <Seccion titulo={`Conciliados (${conciliados.length})`}>
              {conciliados.length === 0 && (
                <p className="text-sm text-zinc-600">Todavía no conciliaste ningún movimiento.</p>
              )}
              {conciliados.length > 0 && (
                <div className="divide-y divide-zinc-100">
                  {conciliados.map((m) => (
                    <FilaConciliado key={m.id} movimiento={m} onCambio={cargarMovimientos} />
                  ))}
                </div>
              )}
            </Seccion>
          </>
        )}
      </div>
    </div>
  );
}
