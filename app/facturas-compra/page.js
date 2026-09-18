"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";
import Seccion from "../Seccion";
import ImportarComprobantesArca from "./ImportarComprobantesArca";
import CamposFactura, { fechaLegible, formatearMonto } from "./CamposFactura";

const BUCKET = "facturas-compra";
const PAGINA = 20;
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function anioActual() {
  return new Date().getFullYear();
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

// OR a mano para el buscador: PostgREST no permite filtrar por columnas de
// una tabla relacionada (proveedor.nombre/cuit) dentro de un .or() salvo que
// esté embebida en el select, así que se resuelve del lado del cliente con
// la lista de proveedores que ya está en memoria.
function condicionBusqueda(termino, proveedores) {
  const limpio = termino.replace(/[,()]/g, "").trim();
  if (!limpio) return null;
  const buscado = limpio.toLowerCase();
  const idsProveedor = proveedores
    .filter(
      (p) => p.nombre.toLowerCase().includes(buscado) || (p.cuit ?? "").includes(limpio)
    )
    .map((p) => p.id);
  const condiciones = [`numero_factura.ilike.%${limpio}%`];
  if (idsProveedor.length > 0) condiciones.push(`proveedor_id.in.(${idsProveedor.join(",")})`);
  return condiciones.join(",");
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
            {factura.centro_asignado_por_regla && (
              <span className="ml-1 text-zinc-400">· asignado por regla</span>
            )}
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

// Facturación de un año: por mes y por proveedor. Se recalcula al vuelo
// con una consulta liviana (solo las columnas que hacen falta) cada vez
// que cambia el año elegido — no se guarda nada de esto en la base, mismo
// criterio que "Costos por período" en Centros de costos.
function ResumenFacturacion({ proveedores }) {
  const [anio, setAnio] = useState(anioActual());
  const [cargando, setCargando] = useState(true);
  const [porMes, setPorMes] = useState(Array(12).fill(0));
  const [porProveedor, setPorProveedor] = useState([]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);

    supabase
      .from("facturas_compra")
      .select("fecha, proveedor_id, importe_total, tipo_documento")
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
      .then(({ data }) => {
        if (cancelado) return;

        const mensual = Array(12).fill(0);
        const porProveedorMapa = {};

        for (const f of data ?? []) {
          const monto = montoFirmado(f);
          const mesIndex = Number(f.fecha.slice(5, 7)) - 1;
          mensual[mesIndex] += monto;
          porProveedorMapa[f.proveedor_id] = (porProveedorMapa[f.proveedor_id] ?? 0) + monto;
        }

        const listaProveedores = Object.entries(porProveedorMapa)
          .map(([proveedorId, total]) => ({
            proveedorId,
            nombre:
              proveedores.find((p) => p.id === proveedorId)?.nombre ?? "(proveedor eliminado)",
            total,
          }))
          .sort((a, b) => b.total - a.total);

        setPorMes(mensual);
        setPorProveedor(listaProveedores);
        setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [anio, proveedores]);

  const totalAnio = porMes.reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm text-zinc-600">Año</label>
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
              <h3 className="text-sm font-medium text-zinc-700">Por proveedor</h3>
              {porProveedor.length === 0 && (
                <p className="mt-2 text-sm text-zinc-500">Sin facturas en este año.</p>
              )}
              <div className="mt-2 max-h-80 divide-y divide-zinc-100 overflow-y-auto">
                {porProveedor.map((p) => (
                  <div key={p.proveedorId} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-zinc-600">{p.nombre}</span>
                    <span className="font-medium text-zinc-900">{formatearMonto(p.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function FacturasCompra() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";

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
  const [filtroAsignacion, setFiltroAsignacion] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroBusqueda, setFiltroBusqueda] = useState("");

  // Debounce: la búsqueda dispara la consulta 250ms después de que el
  // usuario deja de tipear, para no pegarle a la base en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setFiltroBusqueda(busqueda.trim()), 250);
    return () => clearTimeout(id);
  }, [busqueda]);

  const [facturas, setFacturas] = useState([]);
  const [urls, setUrls] = useState({});
  const [limite, setLimite] = useState(PAGINA);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [totalRegistrado, setTotalRegistrado] = useState(0);
  const [totalPendiente, setTotalPendiente] = useState(0);
  const [totalPagado, setTotalPagado] = useState(0);

  const cargarProveedores = useCallback(async () => {
    const { data } = await supabase
      .from("proveedores_nombre")
      .select("id, nombre, cuit")
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
      .then(({ data }) => setCategorias(data ?? []));
    supabase
      .from("centros_costo")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setCentros(data ?? []));
  }, [cargarProveedores]);

  const cargarFacturas = useCallback(async () => {
    setCargando(true);

    // Con búsqueda activa se levanta el límite de paginación: el resultado
    // ya viene acotado por el texto tipeado, no tiene sentido esconderlo
    // detrás de "Ver facturas más viejas".
    const limiteEfectivo = filtroBusqueda ? 500 : limite;

    let query = supabase
      .from("facturas_compra")
      .select(
        "*, factura_relacionada:factura_id(tipo_factura, numero_factura, fecha), orden_compra:orden_compra_id(numero)"
      )
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limiteEfectivo + 1);

    if (filtroProveedor) query = query.eq("proveedor_id", filtroProveedor);
    if (filtroEstado) query = query.eq("estado_pago", filtroEstado);
    if (filtroCentro) query = query.eq("centro_costo_id", filtroCentro);
    if (filtroTipoDocumento) query = query.eq("tipo_documento", filtroTipoDocumento);
    if (filtroDesde) query = query.gte("fecha", filtroDesde);
    if (filtroHasta) query = query.lte("fecha", filtroHasta);
    if (filtroAsignacion === "regla") query = query.eq("centro_asignado_por_regla", true);
    const condicion = condicionBusqueda(filtroBusqueda, proveedores);
    if (condicion) query = query.or(condicion);

    const { data, error } = await query;

    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }

    setError(null);
    setHayMas(data.length > limiteEfectivo);
    const visibles = data.slice(0, limiteEfectivo);
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
  }, [
    limite,
    filtroProveedor,
    filtroEstado,
    filtroCentro,
    filtroTipoDocumento,
    filtroDesde,
    filtroHasta,
    filtroAsignacion,
    filtroBusqueda,
    proveedores,
  ]);

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
    const condicion = condicionBusqueda(filtroBusqueda, proveedores);
    if (condicion) query = query.or(condicion);

    const { data } = await query;
    setTotalRegistrado(sumaFirmada(data ?? []));
    setTotalPendiente(sumaFirmada((data ?? []).filter((f) => f.estado_pago === "pendiente")));
    setTotalPagado(sumaFirmada((data ?? []).filter((f) => f.estado_pago === "pagada")));
  }, [filtroProveedor, filtroCentro, filtroDesde, filtroHasta, filtroBusqueda, proveedores]);

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
  }, [
    filtroProveedor,
    filtroEstado,
    filtroCentro,
    filtroTipoDocumento,
    filtroDesde,
    filtroHasta,
    filtroAsignacion,
    filtroBusqueda,
  ]);

  useEffect(() => {
    cargarFacturas();
  }, [cargarFacturas]);

  useEffect(() => {
    cargarTotales();
  }, [cargarTotales]);

  useEffect(() => {
    cargarOpPorFactura();
  }, [cargarOpPorFactura]);

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
      <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">No tenés acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
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

        <div className="mt-4 flex justify-end sm:mt-6">
          <Link
            href="/facturas-compra/nueva"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            + Cargar factura o nota de crédito
          </Link>
        </div>

        <ImportarComprobantesArca onImportado={handleImportado} />

        <Seccion titulo="Facturas y notas de crédito" defaultAbierto>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por proveedor, CUIT o N.º de factura..."
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          />

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
            <select
              value={filtroAsignacion}
              onChange={(e) => setFiltroAsignacion(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Cualquier imputación</option>
              <option value="regla">Asignadas por regla (revisar)</option>
            </select>
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
        </Seccion>

        <Seccion titulo="Facturación por mes y por proveedor">
          <ResumenFacturacion proveedores={proveedores} />
        </Seccion>
      </div>
    </div>
  );
}
