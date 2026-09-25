"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

const BUCKET = "certificaciones-archivos";

const ESTADOS = [
  { value: "cargado", label: "Cargado / pendiente de facturar", color: "bg-zinc-100 text-zinc-700" },
  { value: "facturado", label: "Facturado", color: "bg-blue-100 text-blue-800" },
  { value: "cobrado", label: "Cobrado", color: "bg-green-100 text-green-800" },
];

const valoresIniciales = {
  periodo_desde: "",
  periodo_hasta: "",
  monto_certificado: "",
  porcentaje_avance: "",
  avance_acumulado: "",
  hito_id: "",
  descripcion: "",
};

function etiquetaEstado(estado) {
  return ESTADOS.find((e) => e.value === estado)?.label ?? estado;
}

function colorEstado(estado) {
  return ESTADOS.find((e) => e.value === estado)?.color ?? "bg-zinc-100 text-zinc-700";
}

function formatearMonto(monto) {
  if (monto === null || monto === undefined) return "—";
  return Number(monto).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function fechaLegible(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
}

async function subirAdjunto({ obraId, certificacionId, prefijo, file }) {
  const ruta = `${obraId}/${certificacionId}/${prefijo}-${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, file);
  if (error) throw error;
  return ruta;
}

async function verAdjunto(ruta) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 60);
  if (error) {
    alert(`No se pudo abrir el archivo: ${error.message}`);
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function HistorialCertificacion({ certificacionId }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [eventos, setEventos] = useState(null);

  async function handleToggle() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    if (eventos !== null) return;

    setCargando(true);
    const { data } = await supabase
      .from("certificaciones_historial_estados")
      .select("estado, usuario_email, created_at")
      .eq("certificacion_id", certificacionId)
      .order("created_at");

    setEventos(data ?? []);
    setCargando(false);
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleToggle}
        className="text-xs font-medium text-zinc-500 hover:text-primary hover:underline"
      >
        {abierto ? "Ocultar historial" : "Ver historial"}
      </button>

      {abierto && (
        <div className="mt-1 rounded-md bg-zinc-50 p-2">
          {cargando && <p className="text-xs text-zinc-500">Cargando...</p>}
          {eventos && eventos.length === 0 && (
            <p className="text-xs text-zinc-500">Todavía no tiene cambios de estado registrados.</p>
          )}
          {eventos && eventos.length > 0 && (
            <ul className="space-y-1">
              {eventos.map((ev, i) => (
                <li key={i} className="text-xs text-zinc-600">
                  <span className="text-zinc-400">{new Date(ev.created_at).toLocaleString()}</span>{" "}
                  — pasó a &quot;{etiquetaEstado(ev.estado)}&quot; ({ev.usuario_email ?? "desconocido"})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CertificacionCard({ cert, obraId, esAdmin, puedeCargar, onCambio }) {
  const inputCertificadoRef = useRef(null);
  const inputFacturaRef = useRef(null);

  const [subiendoCertificado, setSubiendoCertificado] = useState(false);
  const [subiendoFactura, setSubiendoFactura] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);

  async function handleAdjuntarCertificado(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoCertificado(true);
    setError(null);
    try {
      const ruta = await subirAdjunto({ obraId, certificacionId: cert.id, prefijo: "certificado", file });
      const { error: errorUpdate } = await supabase
        .from("certificaciones")
        .update({ certificado_ruta: ruta })
        .eq("id", cert.id);
      if (errorUpdate) throw errorUpdate;
      await onCambio();
    } catch (err) {
      setError(err.message);
    }
    setSubiendoCertificado(false);
    if (inputCertificadoRef.current) inputCertificadoRef.current.value = "";
  }

  async function handleMarcarFacturado(e) {
    const file = e.target.files?.[0];
    setSubiendoFactura(true);
    setError(null);
    try {
      let ruta = null;
      if (file) {
        ruta = await subirAdjunto({ obraId, certificacionId: cert.id, prefijo: "factura", file });
      }
      const { error: errorRpc } = await supabase.rpc("marcar_certificado_facturado", {
        p_certificacion_id: cert.id,
        p_factura_ruta: ruta,
      });
      if (errorRpc) throw errorRpc;
      await onCambio();
    } catch (err) {
      setError(err.message);
    }
    setSubiendoFactura(false);
    if (inputFacturaRef.current) inputFacturaRef.current.value = "";
  }

  async function handleMarcarCobrado() {
    setProcesando(true);
    setError(null);
    const { error: errorRpc } = await supabase.rpc("marcar_certificado_cobrado", {
      p_certificacion_id: cert.id,
    });
    if (errorRpc) setError(errorRpc.message);
    else await onCambio();
    setProcesando(false);
  }

  async function handleRevertir() {
    if (!confirm(`¿Revertir el certificado #${cert.numero} a su estado anterior?`)) return;
    setProcesando(true);
    setError(null);
    const { error: errorRpc } = await supabase.rpc("revertir_estado_certificado", {
      p_certificacion_id: cert.id,
    });
    if (errorRpc) setError(errorRpc.message);
    else await onCambio();
    setProcesando(false);
  }

  return (
    <div className="rounded-md border border-zinc-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">
          <span className="text-zinc-400">#{cert.numero}</span>{" "}
          {formatearMonto(cert.monto_certificado)}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorEstado(cert.estado)}`}>
          {etiquetaEstado(cert.estado)}
        </span>
      </div>

      <p className="mt-1 text-xs text-zinc-500">
        {cert.periodo_desde || cert.periodo_hasta
          ? `Período: ${fechaLegible(cert.periodo_desde)} al ${fechaLegible(cert.periodo_hasta)}`
          : "Sin período especificado"}
        {cert.porcentaje_avance !== null ? ` · Avance del período: ${cert.porcentaje_avance}%` : ""}
        {cert.avance_acumulado !== null ? ` · Avance acumulado de obra: ${cert.avance_acumulado}%` : ""}
      </p>
      {cert.hitos && <p className="mt-0.5 text-xs text-zinc-500">Hito: {cert.hitos.nombre}</p>}
      {cert.descripcion && <p className="mt-1 text-sm text-zinc-700">{cert.descripcion}</p>}

      <p className="mt-1 text-xs text-zinc-400">
        Cargado por {cert.creado_por_email ?? "desconocido"} el{" "}
        {new Date(cert.created_at).toLocaleDateString()}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {cert.certificado_ruta ? (
          <button
            onClick={() => verAdjunto(cert.certificado_ruta)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver certificado
          </button>
        ) : (
          puedeCargar && (
            <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
              {subiendoCertificado ? "Subiendo..." : "+ Adjuntar certificado"}
              <input
                ref={inputCertificadoRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp,image/heic"
                onChange={handleAdjuntarCertificado}
                disabled={subiendoCertificado}
                className="hidden"
              />
            </label>
          )
        )}

        {cert.factura_ruta && (
          <button
            onClick={() => verAdjunto(cert.factura_ruta)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver factura
          </button>
        )}
      </div>

      {esAdmin && cert.estado === "cargado" && (
        <div className="mt-3 rounded-md bg-zinc-50 p-2.5">
          <label className="block text-xs font-medium text-zinc-600">
            Marcar como facturado{cert.factura_ruta ? "" : " (podés adjuntar el PDF de la factura)"}
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              ref={inputFacturaRef}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp,image/heic"
              className="text-xs text-zinc-600"
              disabled={subiendoFactura}
            />
            <button
              onClick={() => handleMarcarFacturado({ target: inputFacturaRef.current })}
              disabled={subiendoFactura}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {subiendoFactura ? "Guardando..." : "Marcar facturado"}
            </button>
          </div>
        </div>
      )}

      {esAdmin && cert.estado === "facturado" && (
        <div className="mt-3">
          <button
            onClick={handleMarcarCobrado}
            disabled={procesando}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {procesando ? "Guardando..." : "Marcar cobrado"}
          </button>
        </div>
      )}

      {esAdmin && cert.estado !== "cargado" && (
        <div className="mt-2">
          <button
            onClick={handleRevertir}
            disabled={procesando}
            className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
          >
            Revertir a estado anterior
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-accent">{error}</p>}

      <HistorialCertificacion certificacionId={cert.id} />
    </div>
  );
}

export default function Certificaciones({ obraId, hitos, obraNombre }) {
  const role = useRole();
  const esAdmin = role === "administrador";
  const puedeCargar = esAdmin || role === "jefe_obra";
  const puedeVer = puedeCargar;

  const [certificaciones, setCertificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(valoresIniciales);
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState(null);
  const inputArchivoRef = useRef(null);

  const cargarCertificaciones = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("certificaciones")
      .select("*, hitos(id, nombre)")
      .eq("obra_id", obraId)
      .order("numero");

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setCertificaciones(data ?? []);
    }
    setCargando(false);
  }, [obraId]);

  useEffect(() => {
    if (!puedeVer) return;
    cargarCertificaciones();
  }, [puedeVer, cargarCertificaciones]);

  if (!puedeVer) return null;

  async function handleCrear(e) {
    e.preventDefault();
    setGuardando(true);
    setErrorForm(null);

    const { data: creado, error } = await supabase
      .from("certificaciones")
      .insert({
        obra_id: obraId,
        periodo_desde: form.periodo_desde || null,
        periodo_hasta: form.periodo_hasta || null,
        monto_certificado: form.monto_certificado,
        porcentaje_avance: form.porcentaje_avance || null,
        avance_acumulado: form.avance_acumulado || null,
        hito_id: form.hito_id || null,
        descripcion: form.descripcion.trim() || null,
      })
      .select("id")
      .single();

    if (error) {
      setErrorForm(error.message);
      setGuardando(false);
      return;
    }

    if (archivo) {
      try {
        const ruta = await subirAdjunto({
          obraId,
          certificacionId: creado.id,
          prefijo: "certificado",
          file: archivo,
        });
        await supabase.from("certificaciones").update({ certificado_ruta: ruta }).eq("id", creado.id);
      } catch (err) {
        setErrorForm(
          `El certificado se creó, pero no se pudo subir el adjunto: ${err.message}. Lo podés adjuntar después.`
        );
      }
    }

    setForm(valoresIniciales);
    setArchivo(null);
    if (inputArchivoRef.current) inputArchivoRef.current.value = "";
    setMostrarForm(false);
    await cargarCertificaciones();
    setGuardando(false);
  }

  const totalCertificado = certificaciones.reduce((acc, c) => acc + Number(c.monto_certificado), 0);
  const totalFacturado = certificaciones
    .filter((c) => c.estado === "facturado" || c.estado === "cobrado")
    .reduce((acc, c) => acc + Number(c.monto_certificado), 0);
  const totalCobrado = certificaciones
    .filter((c) => c.estado === "cobrado")
    .reduce((acc, c) => acc + Number(c.monto_certificado), 0);
  const pendienteFacturar = certificaciones
    .filter((c) => c.estado === "cargado")
    .reduce((acc, c) => acc + Number(c.monto_certificado), 0);
  const pendienteCobrar = certificaciones
    .filter((c) => c.estado === "facturado")
    .reduce((acc, c) => acc + Number(c.monto_certificado), 0);

  return (
    <>
      {!cargando && !error && certificaciones.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <p className="text-xs font-medium text-zinc-500">Total certificado</p>
            <p className="mt-1 text-sm font-semibold text-primary">{formatearMonto(totalCertificado)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <p className="text-xs font-medium text-zinc-500">Total facturado</p>
            <p className="mt-1 text-sm font-semibold text-blue-700">{formatearMonto(totalFacturado)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <p className="text-xs font-medium text-zinc-500">Total cobrado</p>
            <p className="mt-1 text-sm font-semibold text-green-700">{formatearMonto(totalCobrado)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <p className="text-xs font-medium text-zinc-500">Pendiente de facturar</p>
            <p className="mt-1 text-sm font-semibold text-zinc-700">{formatearMonto(pendienteFacturar)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <p className="text-xs font-medium text-zinc-500">Pendiente de cobrar</p>
            <p className="mt-1 text-sm font-semibold text-zinc-700">{formatearMonto(pendienteCobrar)}</p>
          </div>
        </div>
      )}

      {puedeCargar && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {mostrarForm ? "Cancelar" : "+ Nuevo certificado"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      {mostrarForm && puedeCargar && (
        <form onSubmit={handleCrear} className="mt-4 rounded-md border border-zinc-200 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Monto certificado *
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                value={form.monto_certificado}
                onChange={(e) => setForm((f) => ({ ...f, monto_certificado: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Hito (opcional)
              </label>
              <select
                value={form.hito_id}
                onChange={(e) => setForm((f) => ({ ...f, hito_id: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                <option value="">— Sin hito —</option>
                {hitos.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Período desde
              </label>
              <input
                type="date"
                value={form.periodo_desde}
                onChange={(e) => setForm((f) => ({ ...f, periodo_desde: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Período hasta
              </label>
              <input
                type="date"
                value={form.periodo_hasta}
                onChange={(e) => setForm((f) => ({ ...f, periodo_hasta: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                % de avance del período (opcional)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.porcentaje_avance}
                onChange={(e) => setForm((f) => ({ ...f, porcentaje_avance: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                % de avance acumulado de la obra (opcional)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.avance_acumulado}
                onChange={(e) => setForm((f) => ({ ...f, avance_acumulado: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700">
                Descripción / detalle
              </label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                rows={2}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700">
                Certificado (PDF o foto, opcional — se puede adjuntar después)
              </label>
              <input
                ref={inputArchivoRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp,image/heic"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-zinc-600"
              />
            </div>
          </div>

          {errorForm && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{errorForm}</p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar certificado"}
          </button>
        </form>
      )}

      {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && certificaciones.length === 0 && (
        <p className="mt-4 text-sm text-zinc-600">
          Todavía no hay certificados cargados para esta obra{obraNombre ? ` (${obraNombre})` : ""}.
        </p>
      )}

      {!cargando && certificaciones.length > 0 && (
        <div className="mt-4 space-y-3">
          {certificaciones.map((cert) => (
            <CertificacionCard
              key={cert.id}
              cert={cert}
              obraId={obraId}
              esAdmin={esAdmin}
              puedeCargar={puedeCargar}
              onCambio={cargarCertificaciones}
            />
          ))}
        </div>
      )}
    </>
  );
}
