"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";

const BUCKET = "caja-comprobantes";
const PAGINA = 20;

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function diaSiguiente(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(a, m - 1, d + 1);
  return fecha.toISOString().slice(0, 10);
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

function mensajeError(error) {
  // El bloqueo por período cerrado es una política de RLS, no una
  // excepción con mensaje propio — Postgres devuelve un texto genérico.
  // Se lo traduce acá para que tenga sentido en la pantalla.
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "No se pudo guardar: la fecha elegida cae dentro de un período ya cerrado.";
  }
  return error.message;
}

function Movimiento({ mov, url, obraNombre }) {
  const esEntrada = mov.tipo === "entrada";
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            <span className={esEntrada ? "text-green-700" : "text-accent"}>
              {esEntrada ? "+" : "−"} {formatearMonto(mov.monto)}
            </span>{" "}
            · {mov.concepto}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {fechaLegible(mov.fecha)}
            {obraNombre && ` · Obra: ${obraNombre}`}
            {mov.proveedor && ` · Proveedor: ${mov.proveedor}`}
            {mov.numero_factura && ` · Factura: ${mov.numero_factura}`}
          </p>
          {mov.ajusta_a && (
            <p className="mt-0.5 text-xs italic text-zinc-500">
              Ajusta a: {mov.ajusta_a.tipo === "entrada" ? "+" : "−"}{" "}
              {formatearMonto(mov.ajusta_a.monto)} · {mov.ajusta_a.concepto} (
              {fechaLegible(mov.ajusta_a.fecha)})
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-400">
            Cargado por {mov.creado_por_email ?? "desconocido"} el{" "}
            {new Date(mov.created_at).toLocaleString()}
          </p>
        </div>
        {mov.comprobante_ruta && url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt="Comprobante"
              className="h-16 w-16 rounded-md border border-zinc-200 object-cover"
            />
          </a>
        )}
      </div>
    </div>
  );
}

function Cierre({ cierre }) {
  const hayDiferencia = Number(cierre.diferencia) !== 0;
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">
          {cierre.tipo === "diario" ? "Diario" : "Semanal"} — {fechaLegible(cierre.fecha_desde)} al{" "}
          {fechaLegible(cierre.fecha_hasta)}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            hayDiferencia ? "bg-accent/10 text-accent" : "bg-green-100 text-green-800"
          }`}
        >
          {hayDiferencia ? `Diferencia: ${formatearMonto(cierre.diferencia)}` : "Sin diferencia"}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-600">
        Esperado: {formatearMonto(cierre.saldo_calculado)} · Contado:{" "}
        {formatearMonto(cierre.efectivo_contado)}
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Cerrado por {cierre.creado_por_email ?? "desconocido"} el{" "}
        {new Date(cierre.created_at).toLocaleString()}
      </p>
    </div>
  );
}

export default function CajaEfectivo() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";

  const inputComprobanteRef = useRef(null);

  const [saldo, setSaldo] = useState(null);
  const [obras, setObras] = useState([]);

  const [movimientos, setMovimientos] = useState([]);
  const [urls, setUrls] = useState({});
  const [limite, setLimite] = useState(PAGINA);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMovs, setCargandoMovs] = useState(true);
  const [errorMovs, setErrorMovs] = useState(null);

  const [cierres, setCierres] = useState([]);
  const [cargandoCierres, setCargandoCierres] = useState(true);

  // --- Formulario de carga de movimiento ---
  const [tipo, setTipo] = useState("entrada");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [obraId, setObraId] = useState("");
  const [comprobante, setComprobante] = useState(null);
  const [esAjuste, setEsAjuste] = useState(false);
  const [ajustaAId, setAjustaAId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  // --- Formulario de cierre ---
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [tipoCierre, setTipoCierre] = useState("diario");
  const [fechaDesdeCierre, setFechaDesdeCierre] = useState(hoyISO());
  const [fechaHastaCierre, setFechaHastaCierre] = useState(hoyISO());
  const [saldoEsperado, setSaldoEsperado] = useState(null);
  const [efectivoContado, setEfectivoContado] = useState("");
  const [cerrandoCaja, setCerrandoCaja] = useState(false);
  const [errorCierre, setErrorCierre] = useState(null);

  const ultimoCierre = cierres[0] ?? null;
  const fechaMinima = ultimoCierre ? diaSiguiente(ultimoCierre.fecha_hasta) : null;

  const cargarSaldo = useCallback(async () => {
    const { data } = await supabase.from("caja_saldo").select("saldo").single();
    setSaldo(data?.saldo ?? null);
  }, []);

  const cargarMovimientos = useCallback(async () => {
    setCargandoMovs(true);

    const { data, error } = await supabase
      .from("caja_movimientos")
      .select("*, ajusta_a:ajusta_a_id(fecha, concepto, tipo, monto), obras(direccion)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite + 1);

    if (error) {
      setErrorMovs(error.message);
      setCargandoMovs(false);
      return;
    }

    setErrorMovs(null);
    setHayMas(data.length > limite);
    const visibles = data.slice(0, limite);
    setMovimientos(visibles);

    const rutas = visibles.map((m) => m.comprobante_ruta).filter(Boolean);
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

    setCargandoMovs(false);
  }, [limite]);

  const cargarCierres = useCallback(async () => {
    setCargandoCierres(true);
    const { data } = await supabase
      .from("caja_cierres")
      .select("*")
      .order("fecha_hasta", { ascending: false });
    setCierres(data ?? []);
    setCargandoCierres(false);
  }, []);

  useEffect(() => {
    cargarSaldo();
    cargarCierres();
    supabase
      .from("obras_visibles")
      .select("id, direccion")
      .order("direccion")
      .then(({ data }) => setObras(data ?? []));
  }, [cargarSaldo, cargarCierres]);

  useEffect(() => {
    cargarMovimientos();
  }, [cargarMovimientos]);

  useEffect(() => {
    if (fechaMinima && fecha < fechaMinima) setFecha(fechaMinima);
  }, [fechaMinima, fecha]);

  useEffect(() => {
    if (!mostrarCierre) return;
    let cancelado = false;
    supabase.rpc("calcular_saldo_caja", { p_hasta: fechaHastaCierre }).then(({ data }) => {
      if (!cancelado) setSaldoEsperado(data ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, [mostrarCierre, fechaHastaCierre]);

  useEffect(() => {
    if (mostrarCierre && fechaMinima) {
      setFechaDesdeCierre(fechaMinima);
      if (fechaHastaCierre < fechaMinima) setFechaHastaCierre(hoyISO());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarCierre]);

  async function handleAgregar(e) {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0 || !concepto.trim()) return;
    if (esAjuste && !ajustaAId) return;

    setGuardando(true);
    setErrorGuardado(null);

    const movimientoId = crypto.randomUUID();
    let comprobanteRuta = null;

    if (comprobante) {
      comprobanteRuta = `${movimientoId}/${crypto.randomUUID()}-${comprobante.name}`;
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(comprobanteRuta, comprobante);

      if (errSubida) {
        setErrorGuardado(`No se pudo subir el comprobante: ${errSubida.message}`);
        setGuardando(false);
        return;
      }
    }

    const { error } = await supabase.from("caja_movimientos").insert({
      id: movimientoId,
      fecha,
      tipo,
      monto: montoNum,
      concepto: concepto.trim(),
      proveedor: proveedor.trim() || null,
      numero_factura: numeroFactura.trim() || null,
      obra_id: obraId || null,
      comprobante_ruta: comprobanteRuta,
      ajusta_a_id: esAjuste ? ajustaAId : null,
    });

    if (error) {
      if (comprobanteRuta) await supabase.storage.from(BUCKET).remove([comprobanteRuta]);
      setErrorGuardado(mensajeError(error));
      setGuardando(false);
      return;
    }

    setMonto("");
    setConcepto("");
    setProveedor("");
    setNumeroFactura("");
    setFecha(fechaMinima && fechaMinima > hoyISO() ? fechaMinima : hoyISO());
    setObraId("");
    setComprobante(null);
    setEsAjuste(false);
    setAjustaAId("");
    if (inputComprobanteRef.current) inputComprobanteRef.current.value = "";
    setGuardando(false);
    await Promise.all([cargarMovimientos(), cargarSaldo()]);
  }

  async function handleCerrar(e) {
    e.preventDefault();
    const efectivoNum = Number(efectivoContado);
    if (efectivoContado === "" || Number.isNaN(efectivoNum) || efectivoNum < 0) return;

    setCerrandoCaja(true);
    setErrorCierre(null);

    const { error } = await supabase.rpc("cerrar_caja", {
      p_tipo: tipoCierre,
      p_fecha_desde: fechaDesdeCierre,
      p_fecha_hasta: fechaHastaCierre,
      p_efectivo_contado: efectivoNum,
    });

    if (error) {
      setErrorCierre(error.message);
      setCerrandoCaja(false);
      return;
    }

    setEfectivoContado("");
    setMostrarCierre(false);
    setCerrandoCaja(false);
    await Promise.all([cargarCierres(), cargarMovimientos()]);
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-primary">Caja de efectivo</h1>
          <span className="rounded-full bg-primary/10 px-4 py-2 text-lg font-semibold text-primary">
            Saldo: {saldo != null ? formatearMonto(saldo) : "..."}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Registro interno de caja. No tiene fines fiscales ni contables.
        </p>

        {/* Carga de movimiento */}
        <form
          onSubmit={handleAgregar}
          className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
        >
          <h2 className="text-lg font-semibold text-primary">Nuevo movimiento</h2>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-700">Tipo *</label>
              <select
                required
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Monto *</label>
              <input
                required
                type="number"
                min="0.01"
                step="any"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Fecha *</label>
              <input
                required
                type="date"
                min={fechaMinima ?? undefined}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              />
              {fechaMinima && (
                <p className="mt-1 text-xs text-zinc-400">
                  No se puede cargar antes del {fechaLegible(fechaMinima)} (ya hay un cierre hasta esa fecha).
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Obra (opcional)</label>
              <select
                value={obraId}
                onChange={(e) => setObraId(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">Sin obra asociada</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.direccion}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700">Concepto *</label>
              <input
                required
                type="text"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej: Compra de combustible para la camioneta"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">
                Proveedor (opcional)
              </label>
              <input
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre o número de proveedor"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">
                N.º de factura (opcional)
              </label>
              <input
                type="text"
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                placeholder='Si no hay factura, poné "Sin aplicación"'
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700">
                Comprobante (opcional)
              </label>
              <input
                ref={inputComprobanteRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp,image/heic"
                onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
              />
            </div>

            <div className="sm:col-span-2 rounded-md border border-zinc-200 p-3">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={esAjuste}
                  onChange={(e) => {
                    setEsAjuste(e.target.checked);
                    if (!e.target.checked) setAjustaAId("");
                  }}
                />
                Este movimiento corrige un error de otro movimiento
              </label>
              {esAjuste && (
                <select
                  required
                  value={ajustaAId}
                  onChange={(e) => setAjustaAId(e.target.value)}
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                >
                  <option value="">Elegí el movimiento a corregir...</option>
                  {movimientos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {fechaLegible(m.fecha)} · {m.tipo === "entrada" ? "+" : "−"}{" "}
                      {formatearMonto(m.monto)} · {m.concepto}
                    </option>
                  ))}
                </select>
              )}
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
            {guardando ? "Guardando..." : "Agregar movimiento"}
          </button>
        </form>

        {/* Lista de movimientos */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">Movimientos</h2>

          {errorMovs && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              {errorMovs}
            </p>
          )}

          {cargandoMovs && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

          {!cargandoMovs && !errorMovs && movimientos.length === 0 && (
            <p className="mt-4 text-sm text-zinc-600">Todavía no hay movimientos cargados.</p>
          )}

          {!cargandoMovs && movimientos.length > 0 && (
            <div className="mt-2 divide-y divide-zinc-100">
              {movimientos.map((mov) => (
                <Movimiento
                  key={mov.id}
                  mov={mov}
                  url={mov.comprobante_ruta ? urls[mov.comprobante_ruta] : null}
                  obraNombre={mov.obras?.direccion}
                />
              ))}
            </div>
          )}

          {hayMas && (
            <button
              onClick={() => setLimite((l) => l + PAGINA)}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              Ver movimientos más viejos
            </button>
          )}
        </div>

        {/* Cierre de caja */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Cierres de caja</h2>
            {!mostrarCierre && (
              <button
                onClick={() => setMostrarCierre(true)}
                className="text-sm font-medium text-primary hover:underline"
              >
                + Cerrar caja
              </button>
            )}
          </div>

          {mostrarCierre && (
            <form
              onSubmit={handleCerrar}
              className="mt-4 rounded-md border border-zinc-200 p-3"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-700">Tipo *</label>
                  <select
                    required
                    value={tipoCierre}
                    onChange={(e) => setTipoCierre(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                  >
                    <option value="diario">Diario</option>
                    <option value="semanal">Semanal</option>
                  </select>
                </div>
                <div />
                <div>
                  <label className="block text-xs font-medium text-zinc-700">Desde *</label>
                  <input
                    required
                    type="date"
                    min={fechaMinima ?? undefined}
                    value={fechaDesdeCierre}
                    onChange={(e) => setFechaDesdeCierre(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700">Hasta *</label>
                  <input
                    required
                    type="date"
                    max={hoyISO()}
                    value={fechaHastaCierre}
                    onChange={(e) => setFechaHastaCierre(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                  />
                </div>
              </div>

              <p className="mt-3 text-sm text-zinc-700">
                Saldo que debería haber al {fechaLegible(fechaHastaCierre)}:{" "}
                <span className="font-semibold">
                  {saldoEsperado != null ? formatearMonto(saldoEsperado) : "..."}
                </span>
              </p>

              <div className="mt-2">
                <label className="block text-xs font-medium text-zinc-700">
                  Efectivo contado *
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={efectivoContado}
                  onChange={(e) => setEfectivoContado(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 sm:w-48"
                />
              </div>

              {errorCierre && (
                <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                  {errorCierre}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="submit"
                  disabled={cerrandoCaja}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {cerrandoCaja ? "Cerrando..." : "Confirmar cierre"}
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarCierre(false)}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {cargandoCierres && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

          {!cargandoCierres && cierres.length === 0 && (
            <p className="mt-4 text-sm text-zinc-600">Todavía no se cerró ningún período.</p>
          )}

          {!cargandoCierres && cierres.length > 0 && (
            <div className="mt-2 divide-y divide-zinc-100">
              {cierres.map((c) => (
                <Cierre key={c.id} cierre={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
