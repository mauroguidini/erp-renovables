"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";
import ImportarComprobantesArcaVenta from "./ImportarComprobantesArcaVenta";

const BUCKET = "facturas-venta";
const PAGINA = 20;
const TIPOS_FACTURA = ["A", "B", "C", "otro"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function anioActual() {
  return new Date().getFullYear();
}

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

// Una nota de crédito emitida resta en vez de sumar — el signo se aplica
// acá, no en la base (que siempre guarda un importe_total positivo).
function montoFirmado(fila) {
  const monto = Number(fila.importe_total);
  return fila.tipo_documento === "nota_credito" ? -monto : monto;
}

function sumaFirmada(filas) {
  return filas.reduce((acc, f) => acc + montoFirmado(f), 0);
}

function CamposFacturaVenta({ form, setForm, clientes, obras, centros }) {
  const [totalTocado, setTotalTocado] = useState(false);

  function actualizar(campo, valor) {
    setForm((f) => {
      const siguiente = { ...f, [campo]: valor };
      if (
        (campo === "importe_neto" || campo === "iva" || campo === "otros_impuestos") &&
        !totalTocado
      ) {
        const neto = Number(campo === "importe_neto" ? valor : siguiente.importe_neto) || 0;
        const iva = Number(campo === "iva" ? valor : siguiente.iva) || 0;
        const otros =
          Number(campo === "otros_impuestos" ? valor : siguiente.otros_impuestos) || 0;
        siguiente.importe_total = String((neto + iva + otros).toFixed(2));
      }
      return siguiente;
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-zinc-700">Tipo de documento *</label>
        <select
          required
          value={form.tipo_documento}
          onChange={(e) => actualizar("tipo_documento", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="factura">Factura</option>
          <option value="nota_credito">Nota de crédito</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Cliente *</label>
        <select
          required
          value={form.cliente_id}
          onChange={(e) => actualizar("cliente_id", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="">Elegí un cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Fecha *</label>
        <input
          required
          type="date"
          value={form.fecha}
          onChange={(e) => actualizar("fecha", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Tipo de factura *</label>
        <select
          required
          value={form.tipo_factura}
          onChange={(e) => actualizar("tipo_factura", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          {TIPOS_FACTURA.map((t) => (
            <option key={t} value={t}>
              {t === "otro" ? "Otro" : t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">N.º de factura *</label>
        <input
          required
          type="text"
          value={form.numero_factura}
          onChange={(e) => actualizar("numero_factura", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Importe neto *</label>
        <input
          required
          type="number"
          min="0"
          step="any"
          value={form.importe_neto}
          onChange={(e) => actualizar("importe_neto", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">IVA *</label>
        <input
          required
          type="number"
          min="0"
          step="any"
          value={form.iva}
          onChange={(e) => actualizar("iva", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Otros impuestos *</label>
        <input
          required
          type="number"
          min="0"
          step="any"
          value={form.otros_impuestos}
          onChange={(e) => actualizar("otros_impuestos", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">
          Importe total *{" "}
          {!totalTocado && <span className="text-zinc-400">(neto + IVA + otros impuestos)</span>}
        </label>
        <input
          required
          type="number"
          min="0"
          step="any"
          value={form.importe_total}
          onChange={(e) => {
            setTotalTocado(true);
            actualizar("importe_total", e.target.value);
          }}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Estado de cobro *</label>
        <select
          required
          value={form.estado_cobro}
          onChange={(e) => actualizar("estado_cobro", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="pendiente">Pendiente</option>
          <option value="cobrada">Cobrada</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Obra (opcional)</label>
        <select
          value={form.obra_id}
          onChange={(e) => actualizar("obra_id", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="">Sin vincular</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.direccion}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-zinc-700">
          Centro de costos (opcional)
        </label>
        <select
          value={form.centro_costo_id}
          onChange={(e) => actualizar("centro_costo_id", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="">Sin imputar</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function FacturaVenta({ factura, clientes, obras, centros, url, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function iniciarEdicion() {
    setForm({
      tipo_documento: factura.tipo_documento,
      cliente_id: factura.cliente_id,
      tipo_factura: factura.tipo_factura,
      numero_factura: factura.numero_factura,
      fecha: factura.fecha,
      importe_neto: String(factura.importe_neto),
      iva: String(factura.iva),
      otros_impuestos: String(factura.otros_impuestos),
      importe_total: String(factura.importe_total),
      estado_cobro: factura.estado_cobro,
      obra_id: factura.obra_id ?? "",
      centro_costo_id: factura.centro_costo_id ?? "",
    });
    setError(null);
    setEditando(true);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("facturas_venta")
      .update({
        tipo_documento: form.tipo_documento,
        cliente_id: form.cliente_id,
        tipo_factura: form.tipo_factura,
        numero_factura: form.numero_factura.trim(),
        fecha: form.fecha,
        importe_neto: Number(form.importe_neto),
        iva: Number(form.iva),
        otros_impuestos: Number(form.otros_impuestos),
        importe_total: Number(form.importe_total),
        estado_cobro: form.estado_cobro,
        obra_id: form.obra_id || null,
        centro_costo_id: form.centro_costo_id || null,
      })
      .eq("id", factura.id);

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    setGuardando(false);
    setEditando(false);
    await onCambio();
  }

  async function handleBorrar() {
    const confirmado = window.confirm(
      `¿Borrar ${factura.tipo_documento === "nota_credito" ? "esta nota de crédito" : "esta factura"}? También se borra el comprobante si tiene. No se puede deshacer.`
    );
    if (!confirmado) return;

    setGuardando(true);
    setError(null);

    if (factura.comprobante_ruta) {
      await supabase.storage.from(BUCKET).remove([factura.comprobante_ruta]);
    }

    const { error } = await supabase.from("facturas_venta").delete().eq("id", factura.id);

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    setGuardando(false);
    await onCambio();
  }

  async function handleToggleEstado() {
    const nuevoEstado = factura.estado_cobro === "pendiente" ? "cobrada" : "pendiente";
    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("facturas_venta")
      .update({ estado_cobro: nuevoEstado })
      .eq("id", factura.id);

    if (error) setError(error.message);
    setGuardando(false);
    await onCambio();
  }

  const nombreCliente = clientes.find((c) => c.id === factura.cliente_id)?.nombre;
  const nombreObra = obras.find((o) => o.id === factura.obra_id)?.direccion;
  const nombreCentro = centros.find((c) => c.id === factura.centro_costo_id)?.nombre;
  const esNota = factura.tipo_documento === "nota_credito";

  if (editando) {
    return (
      <form onSubmit={handleGuardar} className="py-3">
        <CamposFacturaVenta
          form={form}
          setForm={setForm}
          clientes={clientes}
          obras={obras}
          centros={centros}
        />

        {error && (
          <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="flex items-start gap-3">
        {factura.comprobante_ruta && url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt="Comprobante"
              className="h-16 w-16 rounded-md border border-zinc-200 object-cover"
            />
          </a>
        )}
        <div>
          <p className="text-sm font-medium text-zinc-900">
            <span className={esNota ? "text-accent" : ""}>
              {esNota ? "− " : ""}
              {formatearMonto(factura.importe_total)}
            </span>{" "}
            · {nombreCliente ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {fechaLegible(factura.fecha)} · {esNota ? "Nota de crédito" : "Factura"}{" "}
            {factura.tipo_factura} n.º {factura.numero_factura}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Obra: {nombreObra ?? "Sin vincular"} · Centro de costos:{" "}
            {nombreCentro ?? "Sin imputar"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">
            Neto: {formatearMonto(factura.importe_neto)} · IVA: {formatearMonto(factura.iva)} ·
            Otros impuestos: {formatearMonto(factura.otros_impuestos)}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Cargada por {factura.creado_por_email ?? "desconocido"} el{" "}
            {new Date(factura.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            factura.estado_cobro === "cobrada"
              ? "bg-green-100 text-green-800"
              : "bg-yellow-100 text-yellow-800"
          }`}
        >
          {factura.estado_cobro === "cobrada" ? "Cobrada" : "Pendiente"}
        </span>
        <div className="flex gap-3">
          <button
            onClick={handleToggleEstado}
            disabled={guardando}
            className="text-xs font-medium text-zinc-500 hover:text-primary hover:underline disabled:opacity-50"
          >
            Marcar {factura.estado_cobro === "pendiente" ? "cobrada" : "pendiente"}
          </button>
          <button
            onClick={iniciarEdicion}
            className="text-xs font-medium text-zinc-500 hover:text-primary hover:underline"
          >
            Editar
          </button>
          <button
            onClick={handleBorrar}
            disabled={guardando}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            Borrar
          </button>
        </div>
      </div>

      {error && (
        <p className="w-full rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}
    </div>
  );
}

const FORM_INICIAL = {
  tipo_documento: "factura",
  cliente_id: "",
  tipo_factura: "A",
  numero_factura: "",
  fecha: hoyISO(),
  importe_neto: "",
  iva: "",
  otros_impuestos: "0",
  importe_total: "",
  estado_cobro: "pendiente",
  obra_id: "",
  centro_costo_id: "",
};

// Facturación de un año: por mes y por cliente. Se recalcula al vuelo con
// una consulta liviana (solo las columnas que hacen falta) cada vez que
// cambia el año elegido — no se guarda nada de esto en la base, mismo
// criterio que "Costos por período" en Centros de costos.
function ResumenFacturacion({ clientes }) {
  const [anio, setAnio] = useState(anioActual());
  const [cargando, setCargando] = useState(true);
  const [porMes, setPorMes] = useState(Array(12).fill(0));
  const [porCliente, setPorCliente] = useState([]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);

    supabase
      .from("facturas_venta")
      .select("fecha, cliente_id, importe_total, tipo_documento")
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
      .then(({ data }) => {
        if (cancelado) return;

        const mensual = Array(12).fill(0);
        const porClienteMapa = {};

        for (const f of data ?? []) {
          const monto = montoFirmado(f);
          const mesIndex = Number(f.fecha.slice(5, 7)) - 1;
          mensual[mesIndex] += monto;
          porClienteMapa[f.cliente_id] = (porClienteMapa[f.cliente_id] ?? 0) + monto;
        }

        const listaClientes = Object.entries(porClienteMapa)
          .map(([clienteId, total]) => ({
            clienteId,
            nombre: clientes.find((c) => c.id === clienteId)?.nombre ?? "(cliente eliminado)",
            total,
          }))
          .sort((a, b) => b.total - a.total);

        setPorMes(mensual);
        setPorCliente(listaClientes);
        setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [anio, clientes]);

  const totalAnio = porMes.reduce((a, b) => a + b, 0);

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">Facturación por mes y por cliente</h2>
        <input
          type="number"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>

      {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && (
        <>
          <p className="mt-3 text-sm text-zinc-600">
            Total del año: <span className="font-semibold text-zinc-900">{formatearMonto(totalAnio)}</span>
          </p>

          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-zinc-700">Por mes</h3>
              <div className="mt-2 divide-y divide-zinc-100">
                {MESES.map((nombreMes, i) => (
                  <div key={nombreMes} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-zinc-600">{nombreMes}</span>
                    <span className="font-medium text-zinc-900">{formatearMonto(porMes[i])}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-700">Por cliente</h3>
              {porCliente.length === 0 && (
                <p className="mt-2 text-sm text-zinc-500">Sin facturación en este año.</p>
              )}
              <div className="mt-2 max-h-80 divide-y divide-zinc-100 overflow-y-auto">
                {porCliente.map((c) => (
                  <div key={c.clienteId} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-zinc-600">{c.nombre}</span>
                    <span className="font-medium text-zinc-900">{formatearMonto(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function FacturasVenta() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";

  const inputComprobanteRef = useRef(null);

  const [clientes, setClientes] = useState([]);
  const [obras, setObras] = useState([]);
  const [centros, setCentros] = useState([]);

  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipoDocumento, setFiltroTipoDocumento] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  const [facturas, setFacturas] = useState([]);
  const [urls, setUrls] = useState({});
  const [limite, setLimite] = useState(PAGINA);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [totalRegistrado, setTotalRegistrado] = useState(0);
  const [totalPendiente, setTotalPendiente] = useState(0);
  const [totalCobrado, setTotalCobrado] = useState(0);

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevo, setNuevo] = useState(FORM_INICIAL);
  const [comprobante, setComprobante] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  const cargarClientes = useCallback(async () => {
    const { data } = await supabase.from("clientes").select("id, nombre").order("nombre");
    setClientes(data ?? []);
  }, []);

  useEffect(() => {
    cargarClientes();
    supabase
      .from("obras_visibles")
      .select("id, direccion")
      .order("direccion")
      .then(({ data }) => setObras(data ?? []));
    supabase
      .from("centros_costo")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setCentros(data ?? []));
  }, [cargarClientes]);

  const cargarFacturas = useCallback(async () => {
    setCargando(true);

    let query = supabase
      .from("facturas_venta")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite + 1);

    if (filtroCliente) query = query.eq("cliente_id", filtroCliente);
    if (filtroEstado) query = query.eq("estado_cobro", filtroEstado);
    if (filtroTipoDocumento) query = query.eq("tipo_documento", filtroTipoDocumento);
    if (filtroDesde) query = query.gte("fecha", filtroDesde);
    if (filtroHasta) query = query.lte("fecha", filtroHasta);

    const { data, error } = await query;

    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }

    setError(null);
    setHayMas(data.length > limite);
    const visibles = data.slice(0, limite);
    setFacturas(visibles);

    const rutas = visibles.map((f) => f.comprobante_ruta).filter(Boolean);
    if (rutas.length === 0) {
      setUrls({});
    } else {
      const { data: firmadas } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(rutas, 3600);
      const mapa = {};
      for (const f of firmadas ?? []) {
        if (f.signedUrl) mapa[f.path] = f.signedUrl;
      }
      setUrls(mapa);
    }

    setCargando(false);
  }, [limite, filtroCliente, filtroEstado, filtroTipoDocumento, filtroDesde, filtroHasta]);

  // Los totales reflejan cliente y fecha (para que "pendiente" siga
  // teniendo sentido aunque se esté mirando solo "cobradas"), pidiendo
  // solo las columnas que hacen falta — sin paginar.
  const cargarTotales = useCallback(async () => {
    let query = supabase
      .from("facturas_venta")
      .select("importe_total, estado_cobro, tipo_documento");
    if (filtroCliente) query = query.eq("cliente_id", filtroCliente);
    if (filtroDesde) query = query.gte("fecha", filtroDesde);
    if (filtroHasta) query = query.lte("fecha", filtroHasta);

    const { data } = await query;
    setTotalRegistrado(sumaFirmada(data ?? []));
    setTotalPendiente(sumaFirmada((data ?? []).filter((f) => f.estado_cobro === "pendiente")));
    setTotalCobrado(sumaFirmada((data ?? []).filter((f) => f.estado_cobro === "cobrada")));
  }, [filtroCliente, filtroDesde, filtroHasta]);

  useEffect(() => {
    setLimite(PAGINA);
  }, [filtroCliente, filtroEstado, filtroTipoDocumento, filtroDesde, filtroHasta]);

  useEffect(() => {
    cargarFacturas();
  }, [cargarFacturas]);

  useEffect(() => {
    cargarTotales();
  }, [cargarTotales]);

  async function handleAgregar(e) {
    e.preventDefault();
    if (
      !nuevo.cliente_id ||
      !nuevo.numero_factura.trim() ||
      nuevo.importe_neto === "" ||
      nuevo.iva === "" ||
      nuevo.otros_impuestos === "" ||
      nuevo.importe_total === ""
    ) {
      return;
    }

    setGuardando(true);
    setErrorGuardado(null);

    const facturaId = crypto.randomUUID();
    let comprobanteRuta = null;

    if (comprobante) {
      comprobanteRuta = `${facturaId}/${crypto.randomUUID()}-${comprobante.name}`;
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(comprobanteRuta, comprobante);

      if (errSubida) {
        setErrorGuardado(`No se pudo subir el comprobante: ${errSubida.message}`);
        setGuardando(false);
        return;
      }
    }

    const { error } = await supabase.from("facturas_venta").insert({
      id: facturaId,
      tipo_documento: nuevo.tipo_documento,
      cliente_id: nuevo.cliente_id,
      tipo_factura: nuevo.tipo_factura,
      numero_factura: nuevo.numero_factura.trim(),
      fecha: nuevo.fecha,
      importe_neto: Number(nuevo.importe_neto),
      iva: Number(nuevo.iva),
      otros_impuestos: Number(nuevo.otros_impuestos),
      importe_total: Number(nuevo.importe_total),
      estado_cobro: nuevo.estado_cobro,
      obra_id: nuevo.obra_id || null,
      centro_costo_id: nuevo.centro_costo_id || null,
      comprobante_ruta: comprobanteRuta,
    });

    if (error) {
      if (comprobanteRuta) await supabase.storage.from(BUCKET).remove([comprobanteRuta]);
      setErrorGuardado(
        error.code === "23505"
          ? "Ya existe un documento cargado con ese cliente, tipo de documento, tipo y número."
          : error.message
      );
      setGuardando(false);
      return;
    }

    setNuevo(FORM_INICIAL);
    setComprobante(null);
    if (inputComprobanteRef.current) inputComprobanteRef.current.value = "";
    setGuardando(false);
    setMostrarNuevo(false);
    await Promise.all([cargarFacturas(), cargarTotales()]);
  }

  async function recargarTodo() {
    await Promise.all([cargarFacturas(), cargarTotales()]);
  }

  async function handleImportado() {
    await Promise.all([cargarClientes(), recargarTodo()]);
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
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-primary">Facturas de venta</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Registro de lo que la empresa factura a sus clientes. No tiene fines fiscales ni
          contables.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs font-medium text-zinc-500">Saldo (registrado)</p>
            <p className="mt-1 text-2xl font-semibold text-primary">
              {formatearMonto(totalRegistrado)}
            </p>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <p className="text-xs font-medium text-yellow-700">Pendiente de cobro</p>
            <p className="mt-1 text-2xl font-semibold text-yellow-800">
              {formatearMonto(totalPendiente)}
            </p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-xs font-medium text-green-700">Cobrado</p>
            <p className="mt-1 text-2xl font-semibold text-green-800">
              {formatearMonto(totalCobrado)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Estos tres valores se ajustan solos con los filtros de abajo (cliente y fechas).
        </p>

        {!mostrarNuevo && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setMostrarNuevo(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              + Cargar factura o nota de crédito
            </button>
          </div>
        )}

        {mostrarNuevo && (
          <form
            onSubmit={handleAgregar}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary">Nuevo documento</h2>
              <button
                type="button"
                onClick={() => setMostrarNuevo(false)}
                className="text-sm text-zinc-500 hover:text-zinc-800"
              >
                Cancelar
              </button>
            </div>

            <div className="mt-4">
              <CamposFacturaVenta
                form={nuevo}
                setForm={setNuevo}
                clientes={clientes}
                obras={obras}
                centros={centros}
              />

              <div className="mt-3">
                <label className="block text-xs font-medium text-zinc-700">
                  Comprobante (foto o PDF, opcional)
                </label>
                <input
                  ref={inputComprobanteRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp,image/heic"
                  onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
                />
              </div>
            </div>

            {errorGuardado && (
              <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                {errorGuardado}
              </p>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Agregar documento"}
            </button>
          </form>
        )}

        <ImportarComprobantesArcaVenta onImportado={handleImportado} />

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">Facturas y notas de crédito</h2>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <select
              value={filtroTipoDocumento}
              onChange={(e) => setFiltroTipoDocumento(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Facturas y notas de crédito</option>
              <option value="factura">Solo facturas</option>
              <option value="nota_credito">Solo notas de crédito</option>
            </select>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Todos los clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="cobrada">Cobrada</option>
            </select>
            <input
              type="date"
              value={filtroDesde}
              onChange={(e) => setFiltroDesde(e.target.value)}
              placeholder="Desde"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
            <input
              type="date"
              value={filtroHasta}
              onChange={(e) => setFiltroHasta(e.target.value)}
              placeholder="Hasta"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>

          {error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
          )}

          {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

          {!cargando && !error && facturas.length === 0 && (
            <p className="mt-4 text-sm text-zinc-600">No hay facturas para mostrar.</p>
          )}

          {!cargando && facturas.length > 0 && (
            <div className="mt-2 divide-y divide-zinc-100">
              {facturas.map((factura) => (
                <FacturaVenta
                  key={factura.id}
                  factura={factura}
                  clientes={clientes}
                  obras={obras}
                  centros={centros}
                  url={factura.comprobante_ruta ? urls[factura.comprobante_ruta] : null}
                  onCambio={recargarTodo}
                />
              ))}
            </div>
          )}

          {hayMas && (
            <button
              onClick={() => setLimite((l) => l + PAGINA)}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              Ver facturas más viejas
            </button>
          )}
        </div>

        <ResumenFacturacion clientes={clientes} />
      </div>
    </div>
  );
}
