"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";
import Seccion from "../../Seccion";

const PAGINA = 20;
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function anioActual() {
  return new Date().getFullYear();
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

// Una nota de crédito resta en vez de sumar — mismo criterio que en
// Facturas de compra (052).
function montoFirmado(fila) {
  const monto = Number(fila.importe_total);
  return fila.tipo_documento === "nota_credito" ? -monto : monto;
}

function sumaFirmada(filas) {
  return filas.reduce((acc, f) => acc + montoFirmado(f), 0);
}

// Del año y mes elegidos (mes "" = todo el año) arma un rango de fechas —
// atajo para no tener que tipear "Desde"/"Hasta" a mano cuando alcanza con
// elegir un período. Mismo criterio que la pantalla principal de Centros
// de costos.
function rangoFechas(anio, mes) {
  if (mes === "") return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
  const mesNum = Number(mes);
  const ultimoDia = new Date(anio, mesNum, 0).getDate();
  const mm = String(mesNum).padStart(2, "0");
  return {
    desde: `${anio}-${mm}-01`,
    hasta: `${anio}-${mm}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

// OR a mano para el buscador: PostgREST no permite filtrar por columnas de
// una tabla relacionada (proveedor.nombre/cuit) dentro de un .or() salvo que
// esté embebida en el select, así que se resuelve del lado del cliente con
// la lista de proveedores que ya está en memoria. Mismo criterio que en
// Facturas de compra.
function condicionBusqueda(termino, proveedores) {
  const limpio = termino.replace(/[,()]/g, "").trim();
  if (!limpio) return null;
  const buscado = limpio.toLowerCase();
  const idsProveedor = proveedores
    .filter((p) => p.nombre.toLowerCase().includes(buscado) || (p.cuit ?? "").includes(limpio))
    .map((p) => p.id);
  const condiciones = [`numero_factura.ilike.%${limpio}%`];
  if (idsProveedor.length > 0) condiciones.push(`proveedor_id.in.(${idsProveedor.join(",")})`);
  return condiciones.join(",");
}

function Agrupado({ titulo, filas, vacio }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-700">{titulo}</h3>
      {filas.length === 0 && <p className="mt-2 text-sm text-zinc-500">{vacio}</p>}
      <div className="mt-2 max-h-80 divide-y divide-zinc-100 overflow-y-auto">
        {filas.map((f) => (
          <div key={f.id} className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-zinc-600">{f.nombre}</span>
            <span className="font-medium text-zinc-900">{formatearMonto(f.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Comprobante({ factura, nombreProveedor, nombreCategoria }) {
  const esNota = factura.tipo_documento === "nota_credito";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
      <div>
        <p className="font-medium text-zinc-900">
          <span className={esNota ? "text-accent" : ""}>
            {esNota ? "− " : ""}
            {formatearMonto(factura.importe_total)}
          </span>{" "}
          · {nombreProveedor ?? "—"}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {fechaLegible(factura.fecha)} · {esNota ? "Nota de crédito" : "Factura"}{" "}
          {factura.tipo_factura} n.º {factura.numero_factura} · {nombreCategoria ?? "Sin categoría"}
          {factura.centro_asignado_por_regla && (
            <span className="ml-1 text-zinc-400">· asignada por regla</span>
          )}
        </p>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          factura.estado_pago === "pagada"
            ? "bg-green-100 text-green-800"
            : "bg-yellow-100 text-yellow-800"
        }`}
      >
        {factura.estado_pago === "pagada" ? "Pagada" : "Pendiente"}
      </span>
    </div>
  );
}

function ProveedoresHabituales({ centroId, proveedores, puedeGestionar }) {
  const [habituales, setHabituales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const cargarHabituales = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("centros_costo_proveedores")
      .select("id, proveedor_id")
      .eq("centro_costo_id", centroId);
    if (error) setError(error.message);
    else setError(null);
    setHabituales(data ?? []);
    setCargando(false);
  }, [centroId]);

  useEffect(() => {
    cargarHabituales();
  }, [cargarHabituales]);

  const idsAsignados = new Set(habituales.map((h) => h.proveedor_id));
  const disponibles = proveedores.filter((p) => !idsAsignados.has(p.id));

  async function handleAgregar() {
    if (!seleccionado) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("centros_costo_proveedores")
      .insert({ centro_costo_id: centroId, proveedor_id: seleccionado });
    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }
    setSeleccionado("");
    setGuardando(false);
    await cargarHabituales();
  }

  async function handleQuitar(filaId) {
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("centros_costo_proveedores").delete().eq("id", filaId);
    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }
    setGuardando(false);
    await cargarHabituales();
  }

  return (
    <>
      <p className="text-sm text-zinc-500">
        Si una factura de uno de estos proveedores no tiene centro asignado a mano (al cargarla
        una por una o al importarla desde ARCA), y el proveedor es habitual de un solo centro, se
        imputa sola acá. Si es habitual de varios centros, o de ninguno, entra sin centro para
        clasificarla a mano.
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      {cargando && <p className="mt-3 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && habituales.length === 0 && (
        <p className="mt-3 text-sm text-zinc-600">
          Todavía no hay proveedores habituales para este centro.
        </p>
      )}

      {!cargando && habituales.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100">
          {habituales.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="text-zinc-700">
                {proveedores.find((p) => p.id === h.proveedor_id)?.nombre ?? "(proveedor eliminado)"}
              </span>
              {puedeGestionar && (
                <button
                  onClick={() => handleQuitar(h.id)}
                  disabled={guardando}
                  className="text-xs font-medium text-zinc-500 hover:text-accent hover:underline disabled:opacity-50"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeGestionar && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={seleccionado}
            onChange={(e) => setSeleccionado(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          >
            <option value="">Agregar proveedor...</option>
            {disponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAgregar}
            disabled={guardando || !seleccionado}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      )}
    </>
  );
}

export default function DetalleCentroCosto() {
  const role = useRole();
  const router = useRouter();
  const { id } = useParams();
  const puedeVer = role === "administrador" || role === "administracion";

  const [centro, setCentro] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [categorias, setCategorias] = useState([]);

  // --- Filtros ---
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipoDocumento, setFiltroTipoDocumento] = useState("");
  const [anio, setAnio] = useState(anioActual());
  const [mes, setMes] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroBusqueda, setFiltroBusqueda] = useState("");

  // Debounce: la búsqueda dispara la consulta 250ms después de que el
  // usuario deja de tipear, para no pegarle a la base en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setFiltroBusqueda(busqueda.trim()), 250);
    return () => clearTimeout(t);
  }, [busqueda]);

  // El selector de período (mes/año) es un atajo: al tocarlo, precarga
  // "Desde"/"Hasta" — que igual se pueden seguir ajustando a mano para un
  // rango que no coincida con un mes/año exacto.
  useEffect(() => {
    const { desde, hasta } = rangoFechas(anio, mes);
    setFiltroDesde(desde);
    setFiltroHasta(hasta);
  }, [anio, mes]);

  const [facturas, setFacturas] = useState([]);
  const [limite, setLimite] = useState(PAGINA);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [totalRegistrado, setTotalRegistrado] = useState(0);
  const [totalPendiente, setTotalPendiente] = useState(0);
  const [totalPagado, setTotalPagado] = useState(0);
  const [porProveedor, setPorProveedor] = useState([]);
  const [porCategoria, setPorCategoria] = useState([]);
  const [cargandoAgregados, setCargandoAgregados] = useState(true);

  useEffect(() => {
    supabase
      .from("centros_costo")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => setCentro(data ?? null));
    supabase
      .from("proveedores_nombre")
      .select("id, nombre, cuit")
      .order("nombre")
      .then(({ data }) => setProveedores(data ?? []));
    supabase
      .from("categorias_factura")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setCategorias(data ?? []));
  }, [id]);

  const cargarFacturas = useCallback(async () => {
    setCargando(true);

    // Con búsqueda activa se levanta el límite de paginación: el resultado
    // ya viene acotado por el texto tipeado, no tiene sentido esconderlo
    // detrás de "Ver comprobantes más viejos".
    const limiteEfectivo = filtroBusqueda ? 500 : limite;

    let query = supabase
      .from("facturas_compra")
      .select("*")
      .eq("centro_costo_id", id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limiteEfectivo + 1);

    if (filtroProveedor) query = query.eq("proveedor_id", filtroProveedor);
    if (filtroCategoria) query = query.eq("categoria_id", filtroCategoria);
    if (filtroEstado) query = query.eq("estado_pago", filtroEstado);
    if (filtroTipoDocumento) query = query.eq("tipo_documento", filtroTipoDocumento);
    if (filtroDesde) query = query.gte("fecha", filtroDesde);
    if (filtroHasta) query = query.lte("fecha", filtroHasta);
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
    setFacturas(data.slice(0, limiteEfectivo));
    setCargando(false);
  }, [
    id,
    limite,
    filtroProveedor,
    filtroCategoria,
    filtroEstado,
    filtroTipoDocumento,
    filtroDesde,
    filtroHasta,
    filtroBusqueda,
    proveedores,
  ]);

  // Consulta liviana (sin paginar, solo las columnas que hacen falta) que
  // sirve para tres cosas a la vez: el total recalculado y los subtotales
  // por proveedor y por categoría — se agrupa en un solo reduce en JS, sin
  // pedirle un group by a la base. A propósito NO filtra por estado de
  // pago, así "pendiente"/"pagado" siguen teniendo sentido aunque se esté
  // mirando un subconjunto (mismo criterio que Facturas de compra).
  const cargarAgregados = useCallback(async () => {
    setCargandoAgregados(true);

    let query = supabase
      .from("facturas_compra")
      .select("proveedor_id, categoria_id, importe_total, tipo_documento, estado_pago")
      .eq("centro_costo_id", id);

    if (filtroProveedor) query = query.eq("proveedor_id", filtroProveedor);
    if (filtroCategoria) query = query.eq("categoria_id", filtroCategoria);
    if (filtroTipoDocumento) query = query.eq("tipo_documento", filtroTipoDocumento);
    if (filtroDesde) query = query.gte("fecha", filtroDesde);
    if (filtroHasta) query = query.lte("fecha", filtroHasta);
    const condicion = condicionBusqueda(filtroBusqueda, proveedores);
    if (condicion) query = query.or(condicion);

    const { data } = await query;
    const filas = data ?? [];

    setTotalRegistrado(sumaFirmada(filas));
    setTotalPendiente(sumaFirmada(filas.filter((f) => f.estado_pago === "pendiente")));
    setTotalPagado(sumaFirmada(filas.filter((f) => f.estado_pago === "pagada")));

    const mapaProveedor = {};
    const mapaCategoria = {};
    for (const f of filas) {
      const monto = montoFirmado(f);
      mapaProveedor[f.proveedor_id] = (mapaProveedor[f.proveedor_id] ?? 0) + monto;
      const claveCategoria = f.categoria_id ?? "sin_categoria";
      mapaCategoria[claveCategoria] = (mapaCategoria[claveCategoria] ?? 0) + monto;
    }

    setPorProveedor(
      Object.entries(mapaProveedor)
        .map(([proveedorId, total]) => ({
          id: proveedorId,
          nombre: proveedores.find((p) => p.id === proveedorId)?.nombre ?? "(proveedor eliminado)",
          total,
        }))
        .sort((a, b) => b.total - a.total)
    );
    setPorCategoria(
      Object.entries(mapaCategoria)
        .map(([categoriaId, total]) => ({
          id: categoriaId,
          nombre:
            categoriaId === "sin_categoria"
              ? "Sin categoría"
              : categorias.find((c) => c.id === categoriaId)?.nombre ?? "(categoría eliminada)",
          total,
        }))
        .sort((a, b) => b.total - a.total)
    );

    setCargandoAgregados(false);
  }, [
    id,
    filtroProveedor,
    filtroCategoria,
    filtroTipoDocumento,
    filtroDesde,
    filtroHasta,
    filtroBusqueda,
    proveedores,
    categorias,
  ]);

  useEffect(() => {
    setLimite(PAGINA);
  }, [filtroProveedor, filtroCategoria, filtroEstado, filtroTipoDocumento, filtroDesde, filtroHasta, filtroBusqueda]);

  useEffect(() => {
    cargarFacturas();
  }, [cargarFacturas]);

  useEffect(() => {
    cargarAgregados();
  }, [cargarAgregados]);

  if (!puedeVer) {
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
        <button
          onClick={() => router.push("/centros-costo")}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Volver a centros de costos
        </button>

        <h1 className="mt-2 text-2xl font-semibold text-primary">
          {centro ? `${centro.numero} — ${centro.nombre}` : "Centro de costos"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Detalle de gastos (facturas de compra y notas de crédito) imputados a este centro.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs font-medium text-zinc-500">Total (según filtros)</p>
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
          Estos tres valores se ajustan solos con los filtros de abajo (menos el estado, para que
          &ldquo;pendiente&rdquo;/&ldquo;pagado&rdquo; sigan teniendo sentido).
        </p>

        <Seccion titulo="Filtros">
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
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
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
              <option value="pagada">Pagada</option>
            </select>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Período: todo el año</option>
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
            <input
              type="date"
              value={filtroDesde}
              onChange={(e) => setFiltroDesde(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
            <input
              type="date"
              value={filtroHasta}
              onChange={(e) => setFiltroHasta(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            El período (mes/año) es un atajo que precarga &ldquo;Desde&rdquo;/&ldquo;Hasta&rdquo; — se pueden seguir
            ajustando a mano para un rango que no coincida con un mes exacto.
          </p>
        </Seccion>

        <Seccion titulo="Proveedores habituales">
          <ProveedoresHabituales centroId={id} proveedores={proveedores} puedeGestionar={puedeVer} />
        </Seccion>

        <Seccion titulo="Subtotales (según filtros)">
          {cargandoAgregados && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

          {!cargandoAgregados && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Agrupado titulo="Por proveedor" filas={porProveedor} vacio="Sin gastos para este filtro." />
              <Agrupado titulo="Por categoría" filas={porCategoria} vacio="Sin gastos para este filtro." />
            </div>
          )}
        </Seccion>

        <Seccion titulo="Comprobantes" defaultAbierto>
          {error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
          )}

          {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

          {!cargando && !error && facturas.length === 0 && (
            <p className="mt-4 text-sm text-zinc-600">No hay comprobantes para este filtro.</p>
          )}

          {!cargando && facturas.length > 0 && (
            <div className="mt-2 divide-y divide-zinc-100">
              {facturas.map((f) => (
                <Comprobante
                  key={f.id}
                  factura={f}
                  nombreProveedor={proveedores.find((p) => p.id === f.proveedor_id)?.nombre}
                  nombreCategoria={categorias.find((c) => c.id === f.categoria_id)?.nombre}
                />
              ))}
            </div>
          )}

          {hayMas && (
            <button
              onClick={() => setLimite((l) => l + PAGINA)}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              Ver comprobantes más viejos
            </button>
          )}
        </Seccion>
      </div>
    </div>
  );
}
