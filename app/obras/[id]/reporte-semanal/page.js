"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../../RoleContext";

const DATOS_EMPRESA = {
  nombre: "Baluti Servicios Integrales SRL",
  cuit: "30-71829950-7",
  domicilio: "Av. 9 de Julio 950, Resistencia, Chaco (CP 3500)",
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(a, m - 1, d);
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function fechaLegible(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
}

function formatearMonto(monto) {
  return Number(monto ?? 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

const ETIQUETA_ESTADO_CERT = {
  cargado: "Cargado / pendiente de facturar",
  facturado: "Facturado",
  cobrado: "Cobrado",
};

function esOtVencida(ot) {
  const hoy = hoyISO();
  return (ot.estado === "pendiente" || ot.estado === "parcial") && ot.fecha_limite < hoy;
}

export default function ReporteSemanal() {
  const role = useRole();
  const puedeVer = role === "administrador" || role === "administracion";
  const router = useRouter();
  const { id: obraId } = useParams();

  const [desde, setDesde] = useState(sumarDias(hoyISO(), -6));
  const [hasta, setHasta] = useState(hoyISO());

  const [obra, setObra] = useState(null);
  const [emailUsuario, setEmailUsuario] = useState(null);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    const hastaExclusivo = sumarDias(hasta, 1);

    const [
      sesionRes,
      obraRes,
      trabajoDiarioRes,
      otHistorialRes,
      otSnapshotRes,
      asistenciaRes,
      materialRes,
      hitosHistorialRes,
      certCargadosRes,
      certHistorialRes,
    ] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from("obras_visibles").select("id, direccion, estado").eq("id", obraId).single(),
      supabase
        .from("trabajo_diario")
        .select("*, trabajo_diario_fotos(id)")
        .eq("obra_id", obraId)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false }),
      supabase
        .from("ot_historial_estados")
        .select(
          "estado, usuario_email, created_at, ordenes_trabajo!inner(numero, descripcion, obra_id, motivo_incumplimiento, motivo_detalle)"
        )
        .eq("ordenes_trabajo.obra_id", obraId)
        .gte("created_at", desde)
        .lt("created_at", hastaExclusivo)
        .order("created_at"),
      supabase
        .from("ordenes_trabajo")
        .select("id, numero, descripcion, estado, fecha_limite")
        .eq("obra_id", obraId),
      supabase
        .from("partes_asistencia")
        .select(
          "id, fecha, estado, partes_asistencia_detalle(presente, llego_tarde, se_fue_antes, obreros(nombre))"
        )
        .eq("obra_id", obraId)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha"),
      supabase
        .from("movimientos_material_items")
        .select("descripcion, categoria, cantidad, movimientos_material!inner(obra_id, tipo, fecha)")
        .eq("movimientos_material.obra_id", obraId)
        .gte("movimientos_material.fecha", desde)
        .lte("movimientos_material.fecha", hasta)
        .order("fecha", { foreignTable: "movimientos_material", ascending: false }),
      supabase
        .from("hitos_historial_estados")
        .select("estado, usuario_email, created_at, hitos!inner(nombre, obra_id)")
        .eq("hitos.obra_id", obraId)
        .gte("created_at", desde)
        .lt("created_at", hastaExclusivo)
        .order("created_at"),
      supabase
        .from("certificaciones")
        .select("numero, monto_certificado, estado, creado_por_email, created_at")
        .eq("obra_id", obraId)
        .gte("created_at", desde)
        .lt("created_at", hastaExclusivo),
      supabase
        .from("certificaciones_historial_estados")
        .select("estado, usuario_email, created_at, certificaciones!inner(numero, monto_certificado, obra_id)")
        .eq("certificaciones.obra_id", obraId)
        .gte("created_at", desde)
        .lt("created_at", hastaExclusivo)
        .order("created_at"),
    ]);

    if (obraRes.error) {
      setError(obraRes.error.message);
      setCargando(false);
      return;
    }

    setEmailUsuario(sesionRes.data.session?.user?.email ?? null);
    setObra(obraRes.data);

    const otSnapshot = otSnapshotRes.data ?? [];

    setDatos({
      trabajoDiario: trabajoDiarioRes.data ?? [],
      otHistorial: otHistorialRes.data ?? [],
      otPendientes: otSnapshot.filter((o) => o.estado === "pendiente"),
      otVencidas: otSnapshot.filter(esOtVencida),
      asistencia: asistenciaRes.data ?? [],
      material: materialRes.data ?? [],
      hitosHistorial: hitosHistorialRes.data ?? [],
      certCargados: certCargadosRes.data ?? [],
      certHistorial: certHistorialRes.data ?? [],
    });

    const primerError = [
      trabajoDiarioRes,
      otHistorialRes,
      otSnapshotRes,
      asistenciaRes,
      materialRes,
      hitosHistorialRes,
      certCargadosRes,
      certHistorialRes,
    ].find((r) => r.error);
    if (primerError) setError(primerError.error.message);

    setCargando(false);
  }, [obraId, desde, hasta]);

  useEffect(() => {
    if (!puedeVer) return;
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer]);

  if (!puedeVer) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-accent">No tenés permiso para ver esta página.</p>
        </div>
      </div>
    );
  }

  if (cargando && !datos) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error && !obra) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-accent">{error}</p>
        </div>
      </div>
    );
  }

  const otCumplidas = datos.otHistorial.filter((h) => h.estado === "cumplida");
  const otNoCumplidas = datos.otHistorial.filter((h) => h.estado === "no_cumplida");

  const diasConParte = datos.asistencia.length;
  const partesAbiertos = datos.asistencia.filter((p) => p.estado === "abierto").length;
  const incidentesAsistencia = datos.asistencia.flatMap((p) =>
    (p.partes_asistencia_detalle ?? [])
      .filter((d) => d.llego_tarde || d.se_fue_antes)
      .map((d) => ({
        fecha: p.fecha,
        obrero: d.obreros?.nombre ?? "—",
        llegoTarde: d.llego_tarde,
        seFueAntes: d.se_fue_antes,
      }))
  );

  const materialIngresos = datos.material.filter((m) => m.movimientos_material.tipo === "ingreso");
  const materialSalidas = datos.material.filter((m) => m.movimientos_material.tipo === "salida");

  const certificacionesEventos = [
    ...datos.certCargados.map((c) => ({
      tipo: "cargado",
      numero: c.numero,
      monto: c.monto_certificado,
      usuario: c.creado_por_email,
      fecha: c.created_at,
    })),
    ...datos.certHistorial.map((h) => ({
      tipo: h.estado,
      numero: h.certificaciones.numero,
      monto: h.certificaciones.monto_certificado,
      usuario: h.usuario_email,
      fecha: h.created_at,
    })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  return (
    <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push(`/obras/${obraId}`)}
          className="text-sm text-zinc-500 hover:text-zinc-800 print:hidden"
        >
          ← Volver a la obra
        </button>

        <div className="mt-4 hidden print:block">
          <h1 className="text-xl font-bold">{DATOS_EMPRESA.nombre}</h1>
          <p className="text-sm">CUIT: {DATOS_EMPRESA.cuit}</p>
          <p className="text-sm">{DATOS_EMPRESA.domicilio}</p>
          <hr className="my-3" />
        </div>

        <div className="mt-2 flex items-center justify-between print:mt-0">
          <div>
            <h1 className="text-2xl font-semibold text-primary print:text-lg">
              Reporte semanal — {obra.direccion}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Período: {fechaLegible(desde)} al {fechaLegible(hasta)}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 print:hidden"
          >
            Imprimir / Descargar PDF
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 print:hidden">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {cargando ? "Generando..." : "Generar reporte"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent print:hidden">
            {error}
          </p>
        )}

        {/* Trabajo diario */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:mt-4 print:border-0 print:p-0">
          <h2 className="text-lg font-semibold text-primary">Trabajo diario</h2>
          {datos.trabajoDiario.length === 0 && (
            <p className="mt-2 text-sm text-zinc-600">Sin entradas en el período.</p>
          )}
          {datos.trabajoDiario.length > 0 && (
            <ul className="mt-3 divide-y divide-zinc-100">
              {datos.trabajoDiario.map((t) => (
                <li key={t.id} className="py-2">
                  <p className="text-sm font-medium text-zinc-900">{fechaLegible(t.fecha)}</p>
                  <p className="text-sm text-zinc-700">{t.descripcion}</p>
                  <p className="text-xs text-zinc-500">
                    {t.creado_por_email ?? "desconocido"}
                    {t.trabajo_diario_fotos?.length > 0
                      ? ` · ${t.trabajo_diario_fotos.length} foto(s) adjunta(s)`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Órdenes de trabajo */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:mt-4 print:border-0 print:p-0">
          <h2 className="text-lg font-semibold text-primary">Órdenes de trabajo</h2>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md bg-zinc-50 p-2">
              <p className="text-xs text-zinc-500">Cumplidas en el período</p>
              <p className="text-lg font-semibold text-green-700">{otCumplidas.length}</p>
            </div>
            <div className="rounded-md bg-zinc-50 p-2">
              <p className="text-xs text-zinc-500">No cumplidas en el período</p>
              <p className="text-lg font-semibold text-accent">{otNoCumplidas.length}</p>
            </div>
            <div className="rounded-md bg-zinc-50 p-2">
              <p className="text-xs text-zinc-500">Pendientes (hoy)</p>
              <p className="text-lg font-semibold text-zinc-700">{datos.otPendientes.length}</p>
            </div>
            <div className="rounded-md bg-zinc-50 p-2">
              <p className="text-xs text-zinc-500">Vencidas (hoy)</p>
              <p className="text-lg font-semibold text-accent">{datos.otVencidas.length}</p>
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Las primeras dos columnas son eventos ocurridos en el período elegido. &quot;Pendientes&quot;
            y &quot;Vencidas&quot; son una foto del estado actual, no del período.
          </p>

          {otNoCumplidas.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-zinc-700">No cumplidas — motivo</p>
              <ul className="mt-1 space-y-1">
                {otNoCumplidas.map((h, i) => (
                  <li key={i} className="text-sm text-zinc-700">
                    OT #{h.ordenes_trabajo.numero} — {h.ordenes_trabajo.descripcion}:{" "}
                    {h.ordenes_trabajo.motivo_incumplimiento ?? "sin motivo registrado"}
                    {h.ordenes_trabajo.motivo_detalle ? ` (${h.ordenes_trabajo.motivo_detalle})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {otCumplidas.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-zinc-700">Cumplidas</p>
              <ul className="mt-1 space-y-1">
                {otCumplidas.map((h, i) => (
                  <li key={i} className="text-sm text-zinc-700">
                    OT #{h.ordenes_trabajo.numero} — {h.ordenes_trabajo.descripcion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Asistencia */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:mt-4 print:border-0 print:p-0">
          <h2 className="text-lg font-semibold text-primary">Asistencia</h2>
          <p className="mt-2 text-sm text-zinc-700">
            Días con parte cargado: <span className="font-medium">{diasConParte}</span>
            {partesAbiertos > 0 && (
              <span className="text-accent"> ({partesAbiertos} todavía sin cerrar)</span>
            )}
          </p>
          {incidentesAsistencia.length === 0 && (
            <p className="mt-1 text-sm text-zinc-600">Sin llegadas tarde ni retiros anticipados.</p>
          )}
          {incidentesAsistencia.length > 0 && (
            <ul className="mt-2 space-y-1">
              {incidentesAsistencia.map((inc, i) => (
                <li key={i} className="text-sm text-zinc-700">
                  {fechaLegible(inc.fecha)} — {inc.obrero}:{" "}
                  {[inc.llegoTarde && "llegó tarde", inc.seFueAntes && "se fue antes"]
                    .filter(Boolean)
                    .join(" y ")}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Material */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:mt-4 print:border-0 print:p-0">
          <h2 className="text-lg font-semibold text-primary">Ingresos y salidas de material</h2>
          {datos.material.length === 0 && (
            <p className="mt-2 text-sm text-zinc-600">Sin movimientos en el período.</p>
          )}
          {datos.material.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-green-700">
                  Ingresos ({materialIngresos.length})
                </p>
                <ul className="mt-1 space-y-1">
                  {materialIngresos.map((m, i) => (
                    <li key={i} className="text-sm text-zinc-700">
                      {fechaLegible(m.movimientos_material.fecha)} — {m.descripcion} ({m.cantidad}{" "}
                      {m.categoria})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-accent">Salidas ({materialSalidas.length})</p>
                <ul className="mt-1 space-y-1">
                  {materialSalidas.map((m, i) => (
                    <li key={i} className="text-sm text-zinc-700">
                      {fechaLegible(m.movimientos_material.fecha)} — {m.descripcion} ({m.cantidad}{" "}
                      {m.categoria})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Hitos */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:mt-4 print:border-0 print:p-0">
          <h2 className="text-lg font-semibold text-primary">Avance de hitos</h2>
          {datos.hitosHistorial.length === 0 && (
            <p className="mt-2 text-sm text-zinc-600">Sin cambios de estado de hitos en el período.</p>
          )}
          {datos.hitosHistorial.length > 0 && (
            <ul className="mt-2 space-y-1">
              {datos.hitosHistorial.map((h, i) => (
                <li key={i} className="text-sm text-zinc-700">
                  {h.hitos.nombre} → {h.estado === "cumplido" ? "Cumplido" : "Pendiente"} (
                  {new Date(h.created_at).toLocaleDateString()}, {h.usuario_email ?? "desconocido"})
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Certificaciones */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:mt-4 print:border-0 print:p-0">
          <h2 className="text-lg font-semibold text-primary">Certificaciones</h2>
          {certificacionesEventos.length === 0 && (
            <p className="mt-2 text-sm text-zinc-600">
              Sin certificados cargados ni cambios de estado en el período.
            </p>
          )}
          {certificacionesEventos.length > 0 && (
            <ul className="mt-2 space-y-1">
              {certificacionesEventos.map((ev, i) => (
                <li key={i} className="text-sm text-zinc-700">
                  Certificado #{ev.numero} ({formatearMonto(ev.monto)}) —{" "}
                  {ev.tipo === "cargado" ? "cargado" : `pasó a ${ETIQUETA_ESTADO_CERT[ev.tipo] ?? ev.tipo}`}
                  {" · "}
                  {new Date(ev.fecha).toLocaleDateString()} ({ev.usuario ?? "desconocido"})
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-6 text-xs text-zinc-400 print:mt-4">
          Generado el {new Date().toLocaleString()} por {emailUsuario ?? "—"}.
        </p>
      </div>
    </div>
  );
}
