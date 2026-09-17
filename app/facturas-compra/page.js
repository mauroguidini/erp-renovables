"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";
import ImportarComprobantesArca from "./ImportarComprobantesArca";

const BUCKET = "facturas-compra";
const PAGINA = 20;
const TIPOS_FACTURA = ["A", "B", "C", "otro"];

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

// Una nota de crédito resta en vez de sumar — el signo se aplica acá, no
// en la base (la base guarda siempre un importe_total positivo).
function montoFirmado(fila) {
  const monto = Number(fila.importe_total);
  return fila.tipo_documento === "nota_credito" ? -monto : monto;
}

function sumaFirmada(filas) {
  return filas.reduce((acc, f) => acc + montoFirmado(f), 0);
}

function CamposFactura({ form, setForm, proveedores, categorias, centros }) {
  const [totalTocado, setTotalTocado] = useState(false);
  const [facturasDelProveedor, setFacturasDelProveedor] = useState([]);
  const [ordenesCompraDelProveedor, setOrdenesCompraDelProveedor] = useState([]);

  // Solo tiene sentido elegir "a qué factura corrige" una vez que se sabe
  // el proveedor — y solo se muestran facturas de ESE proveedor (nunca
  // otras notas de crédito, ver 052).
  useEffect(() => {
    if (form.tipo_documento !== "nota_credito" || !form.proveedor_id) {
      setFacturasDelProveedor([]);
      return;
    }
    let cancelado = false;
    supabase
      .from("facturas_compra")
      .select("id, tipo_factura, numero_factura, fecha, importe_total")
      .eq("proveedor_id", form.proveedor_id)
      .eq("tipo_documento", "factura")
      .order("fecha", { ascending: false })
      .then(({ data }) => {
        if (!cancelado) setFacturasDelProveedor(data ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, [form.tipo_documento, form.proveedor_id]);

  // Igual criterio para elegir la orden de compra que originó la factura:
  // solo de ese mismo proveedor.
  useEffect(() => {
    if (form.tipo_documento !== "factura" || !form.proveedor_id) {
      setOrdenesCompraDelProveedor([]);
      return;
    }
    let cancelado = false;
    supabase
      .from("ordenes_compra")
      .select("id, numero, fecha")
      .eq("proveedor_id", form.proveedor_id)
      .order("numero", { ascending: false })
      .then(({ data }) => {
        if (!cancelado) setOrdenesCompraDelProveedor(data ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, [form.tipo_documento, form.proveedor_id]);

  function actualizar(campo, valor) {
    setForm((f) => {
      const siguiente = { ...f, [campo]: valor };
      if (campo === "tipo_documento" && valor === "factura") siguiente.factura_id = "";
      if (campo === "tipo_documento" && valor === "nota_credito") siguiente.orden_compra_id = "";
      if (campo === "proveedor_id") {
        siguiente.factura_id = "";
        siguiente.orden_compra_id = "";
      }
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
        <label className="block text-xs font-medium text-zinc-700">Proveedor *</label>
        <select
          required
          value={form.proveedor_id}
          onChange={(e) => actualizar("proveedor_id", e.target.value)}
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
        <p className="mt-1 text-xs text-zinc-400">Percepciones, IIBB, etc. Si no hay, poné 0.</p>
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
        <label className="block text-xs font-medium text-zinc-700">Categoría *</label>
        <select
          required
          value={form.categoria_id}
          onChange={(e) => actualizar("categoria_id", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Estado de pago *</label>
        <select
          required
          value={form.estado_pago}
          onChange={(e) => actualizar("estado_pago", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="pendiente">Pendiente</option>
          <option value="pagada">Pagada</option>
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
      {form.tipo_documento === "factura" && (
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-700">
            Orden de compra que la originó (opcional)
          </label>
          <select
            value={form.orden_compra_id}
            onChange={(e) => actualizar("orden_compra_id", e.target.value)}
            disabled={!form.proveedor_id}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:bg-zinc-100"
          >
            <option value="">Sin vincular</option>
            {ordenesCompraDelProveedor.map((oc) => (
              <option key={oc.id} value={oc.id}>
                OC #{oc.numero} — {fechaLegible(oc.fecha)}
              </option>
            ))}
          </select>
          {!form.proveedor_id && (
            <p className="mt-1 text-xs text-zinc-400">
              Elegí un proveedor para ver sus órdenes de compra.
            </p>
          )}
        </div>
      )}
      {form.tipo_documento === "nota_credito" && (
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-700">
            Factura que corrige (opcional)
          </label>
          <select
            value={form.factura_id}
            onChange={(e) => actualizar("factura_id", e.target.value)}
            disabled={!form.proveedor_id}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:bg-zinc-100"
          >
            <option value="">Nota suelta, sin factura asociada</option>
            {facturasDelProveedor.map((f) => (
              <option key={f.id} value={f.id}>
                Factura {f.tipo_factura} n.º {f.numero_factura} — {fechaLegible(f.fecha)} —{" "}
                {formatearMonto(f.importe_total)}
              </option>
            ))}
          </select>
          {!form.proveedor_id && (
            <p className="mt-1 text-xs text-zinc-400">Elegí un proveedor para ver sus facturas.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Factura({ factura, proveedores, categorias, centros, url, opNumero, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function iniciarEdicion() {
    setForm({
      tipo_documento: factura.tipo_documento,
      proveedor_id: factura.proveedor_id,
      tipo_factura: factura.tipo_factura,
      numero_factura: factura.numero_factura,
      fecha: factura.fecha,
      importe_neto: String(factura.importe_neto),
      iva: String(factura.iva),
      otros_impuestos: String(factura.otros_impuestos),
      importe_total: String(factura.importe_total),
      categoria_id: factura.categoria_id,
      estado_pago: factura.estado_pago,
      centro_costo_id: factura.centro_costo_id ?? "",
      factura_id: factura.factura_id ?? "",
      orden_compra_id: factura.orden_compra_id ?? "",
    });
    setError(null);
    setEditando(true);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("facturas_compra")
      .update({
        tipo_documento: form.tipo_documento,
        proveedor_id: form.proveedor_id,
        tipo_factura: form.tipo_factura,
        numero_factura: form.numero_factura.trim(),
        fecha: form.fecha,
        importe_neto: Number(form.importe_neto),
        iva: Number(form.iva),
        otros_impuestos: Number(form.otros_impuestos),
        importe_total: Number(form.importe_total),
        categoria_id: form.categoria_id,
        estado_pago: form.estado_pago,
        centro_costo_id: form.centro_costo_id || null,
        factura_id: form.tipo_documento === "nota_credito" ? form.factura_id || null : null,
        orden_compra_id: form.tipo_documento === "factura" ? form.orden_compra_id || null : null,
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

    const { error } = await supabase.from("facturas_compra").delete().eq("id", factura.id);

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    setGuardando(false);
    await onCambio();
  }

  async function handleToggleEstado() {
    const nuevoEstado = factura.estado_pago === "pendiente" ? "pagada" : "pendiente";
    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("facturas_compra")
      .update({ estado_pago: nuevoEstado })
      .eq("id", factura.id);

    if (error) {
      setError(error.message);
    }
    setGuardando(false);
    await onCambio();
  }

  const nombreProveedor = proveedores.find((p) => p.id === factura.proveedor_id)?.nombre;
  const nombreCategoria = categorias.find((c) => c.id === factura.categoria_id)?.nombre;
  const nombreCentro = centros.find((c) => c.id === factura.centro_costo_id)?.nombre;
  const esNota = factura.tipo_documento === "nota_credito";

  if (editando) {
    return (
      <form onSubmit={handleGuardar} className="py-3">
        <CamposFactura
          form={form}
          setForm={setForm}
          proveedores={proveedores}
          categorias={categorias}
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
            · {nombreProveedor ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {fechaLegible(factura.fecha)} · {esNota ? "Nota de crédito" : "Factura"}{" "}
            {factura.tipo_factura} n.º {factura.numero_factura} · {nombreCategoria ?? "—"}
          </p>
          {esNota && (
            <p className="mt-0.5 text-xs italic text-zinc-500">
              {factura.factura_relacionada
                ? `Corrige: Factura ${factura.factura_relacionada.tipo_factura} n.º ${factura.factura_relacionada.numero_factura} (${fechaLegible(factura.factura_relacionada.fecha)})`
                : "Nota suelta, sin factura asociada"}
            </p>
          )}
          <p className="mt-0.5 text-xs text-zinc-500">
            Centro de costos: {nombreCentro ?? "Sin imputar"}
          </p>
          {!esNota && factura.orden_compra && (
            <p className="mt-0.5 text-xs text-zinc-500">
              Originada en: OC #{factura.orden_compra.numero}
            </p>
          )}
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
            factura.estado_pago === "pagada"
              ? "bg-green-100 text-green-800"
              : "bg-yellow-100 text-yellow-800"
          }`}
        >
          {factura.estado_pago === "pagada" ? "Pagada" : "Pendiente"}
        </span>
        {opNumero && (
          <p className="text-xs text-zinc-400">
            Pagada por OP #{opNumero} — anulá la OP para revertirlo
          </p>
        )}
        <div className="flex gap-3">
          {!opNumero && (
            <button
              onClick={handleToggleEstado}
              disabled={guardando}
              className="text-xs font-medium text-zinc-500 hover:text-primary hover:underline disabled:opacity-50"
            >
              Marcar {factura.estado_pago === "pendiente" ? "pagada" : "pendiente"}
            </button>
          )}
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
  proveedor_id: "",
  tipo_factura: "A",
  numero_factura: "",
  fecha: hoyISO(),
  importe_neto: "",
  iva: "",
  otros_impuestos: "0",
  importe_total: "",
  categoria_id: "",
  estado_pago: "pendiente",
  centro_costo_id: "",
  factura_id: "",
  orden_compra_id: "",
};

export default function FacturasCompra() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";

  const inputComprobanteRef = useRef(null);

  const [proveedores, setProveedores] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [centros, setCentros] = useState([]);
  // Qué facturas están pagadas por una Orden de pago CONFIRMADA (factura_id
  // -> número de OP) — mientras estén ahí, el toggle manual queda
  // bloqueado (ver el trigger validar_estado_pago_bajo_op en 054).
  const [opPorFactura, setOpPorFactura] = useState({});

  // --- Filtros ---
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCentro, setFiltroCentro] = useState("");
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
  const [totalPagado, setTotalPagado] = useState(0);

  const [nuevo, setNuevo] = useState(FORM_INICIAL);
  const [comprobante, setComprobante] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  const cargarProveedores = useCallback(async () => {
    const { data } = await supabase
      .from("proveedores_nombre")
      .select("id, nombre")
      .order("nombre");
    setProveedores(data ?? []);
  }, []);

  useEffect(() => {
    cargarProveedores();
    supabase
      .from("categorias_factura")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        setCategorias(data ?? []);
        setNuevo((f) => ({ ...f, categoria_id: f.categoria_id || data?.[0]?.id || "" }));
      });
    supabase
      .from("centros_costo")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setCentros(data ?? []));
  }, [cargarProveedores]);

  const cargarFacturas = useCallback(async () => {
    setCargando(true);

    let query = supabase
      .from("facturas_compra")
      .select(
        "*, factura_relacionada:factura_id(tipo_factura, numero_factura, fecha), orden_compra:orden_compra_id(numero)"
      )
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite + 1);

    if (filtroProveedor) query = query.eq("proveedor_id", filtroProveedor);
    if (filtroEstado) query = query.eq("estado_pago", filtroEstado);
    if (filtroCentro) query = query.eq("centro_costo_id", filtroCentro);
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
  }, [limite, filtroProveedor, filtroEstado, filtroCentro, filtroTipoDocumento, filtroDesde, filtroHasta]);

  // Los totales reflejan proveedor, centro y fecha (para que "pendiente"
  // siga teniendo sentido aunque se esté mirando solo "pagadas", o solo
  // notas de crédito), pidiendo solo las columnas que hacen falta — no
  // toda la fila — sin paginar. Una nota de crédito resta (montoFirmado).
  const cargarTotales = useCallback(async () => {
    let query = supabase
      .from("facturas_compra")
      .select("importe_total, estado_pago, tipo_documento");
    if (filtroProveedor) query = query.eq("proveedor_id", filtroProveedor);
    if (filtroCentro) query = query.eq("centro_costo_id", filtroCentro);
    if (filtroDesde) query = query.gte("fecha", filtroDesde);
    if (filtroHasta) query = query.lte("fecha", filtroHasta);

    const { data } = await query;
    setTotalRegistrado(sumaFirmada(data ?? []));
    setTotalPendiente(sumaFirmada((data ?? []).filter((f) => f.estado_pago === "pendiente")));
    setTotalPagado(sumaFirmada((data ?? []).filter((f) => f.estado_pago === "pagada")));
  }, [filtroProveedor, filtroCentro, filtroDesde, filtroHasta]);

  // Qué facturas están pagadas por una Orden de pago CONFIRMADA (factura_id
  // -> número de OP) — mientras estén ahí, el toggle manual queda
  // bloqueado (ver el trigger validar_estado_pago_bajo_op en 054).
  const cargarOpPorFactura = useCallback(async () => {
    const { data } = await supabase
      .from("ordenes_pago_facturas")
      .select("factura_id, ordenes_pago!inner(numero, estado)")
      .eq("ordenes_pago.estado", "confirmada");

    const mapa = {};
    for (const fila of data ?? []) {
      mapa[fila.factura_id] = fila.ordenes_pago.numero;
    }
    setOpPorFactura(mapa);
  }, []);

  useEffect(() => {
    setLimite(PAGINA);
  }, [filtroProveedor, filtroEstado, filtroCentro, filtroTipoDocumento, filtroDesde, filtroHasta]);

  useEffect(() => {
    cargarFacturas();
  }, [cargarFacturas]);

  useEffect(() => {
    cargarTotales();
  }, [cargarTotales]);

  useEffect(() => {
    cargarOpPorFactura();
  }, [cargarOpPorFactura]);

  async function handleAgregar(e) {
    e.preventDefault();
    if (
      !nuevo.proveedor_id ||
      !nuevo.numero_factura.trim() ||
      !nuevo.categoria_id ||
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

    const { error } = await supabase.from("facturas_compra").insert({
      id: facturaId,
      tipo_documento: nuevo.tipo_documento,
      proveedor_id: nuevo.proveedor_id,
      tipo_factura: nuevo.tipo_factura,
      numero_factura: nuevo.numero_factura.trim(),
      fecha: nuevo.fecha,
      importe_neto: Number(nuevo.importe_neto),
      iva: Number(nuevo.iva),
      otros_impuestos: Number(nuevo.otros_impuestos),
      importe_total: Number(nuevo.importe_total),
      categoria_id: nuevo.categoria_id,
      estado_pago: nuevo.estado_pago,
      centro_costo_id: nuevo.centro_costo_id || null,
      factura_id: nuevo.tipo_documento === "nota_credito" ? nuevo.factura_id || null : null,
      orden_compra_id: nuevo.tipo_documento === "factura" ? nuevo.orden_compra_id || null : null,
      comprobante_ruta: comprobanteRuta,
    });

    if (error) {
      if (comprobanteRuta) await supabase.storage.from(BUCKET).remove([comprobanteRuta]);
      setErrorGuardado(
        error.code === "23505"
          ? "Ya existe un documento cargado con ese proveedor, tipo de documento, tipo y número."
          : error.message
      );
      setGuardando(false);
      return;
    }

    setNuevo((f) => ({ ...FORM_INICIAL, categoria_id: f.categoria_id }));
    setComprobante(null);
    if (inputComprobanteRef.current) inputComprobanteRef.current.value = "";
    setGuardando(false);
    await Promise.all([cargarFacturas(), cargarTotales(), cargarOpPorFactura()]);
  }

  async function recargarTodo() {
    await Promise.all([cargarFacturas(), cargarTotales(), cargarOpPorFactura()]);
  }

  async function handleImportado() {
    // La importación puede haber creado proveedores nuevos — hay que
    // refrescar ese catálogo además del resto.
    await Promise.all([cargarProveedores(), recargarTodo()]);
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
        <h1 className="text-2xl font-semibold text-primary">Facturas de compra</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Registro interno para no perder facturas y notas de crédito. No tiene fines fiscales
          ni contables.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs font-medium text-zinc-500">Saldo (registrado)</p>
            <p className="mt-1 text-2xl font-semibold text-primary">
              {formatearMonto(totalRegistrado)}
            </p>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <p className="text-xs font-medium text-yellow-700">Pendiente de pago</p>
            <p className="mt-1 text-2xl font-semibold text-yellow-800">
              {formatearMonto(totalPendiente)}
            </p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-xs font-medium text-green-700">Pagado</p>
            <p className="mt-1 text-2xl font-semibold text-green-800">
              {formatearMonto(totalPagado)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Estos tres valores se ajustan solos con los filtros de abajo (proveedor, centro de
          costos y fechas).
        </p>

        {/* Carga de factura */}
        <form
          onSubmit={handleAgregar}
          className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
        >
          <h2 className="text-lg font-semibold text-primary">Nuevo documento</h2>

          <div className="mt-4">
            <CamposFactura
              form={nuevo}
              setForm={setNuevo}
              proveedores={proveedores}
              categorias={categorias}
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

        <ImportarComprobantesArca onImportado={handleImportado} />

        {/* Filtros y listado */}
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
              value={filtroProveedor}
              onChange={(e) => setFiltroProveedor(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Todos los proveedores</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
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
              <option value="pagada">Pagada</option>
            </select>
            <select
              value={filtroCentro}
              onChange={(e) => setFiltroCentro(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Todos los centros</option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
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
                <Factura
                  key={factura.id}
                  factura={factura}
                  proveedores={proveedores}
                  categorias={categorias}
                  centros={centros}
                  url={factura.comprobante_ruta ? urls[factura.comprobante_ruta] : null}
                  opNumero={opPorFactura[factura.id]}
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
      </div>
    </div>
  );
}
