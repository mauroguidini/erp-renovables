"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ESTADOS, MOTIVOS, TIPOS } from "../../otConstants";
import { useRole } from "../../RoleContext";
import ImportarPlanTrabajo from "./ImportarPlanTrabajo";

const valoresIniciales = {
  descripcion: "",
  responsable_id: "",
  hito_id: "",
  fecha_inicio: "",
  fecha_limite: new Date().toISOString().slice(0, 10),
};

// "Vencida" nunca se guarda en ningún lado — se calcula al vuelo cada vez
// que se muestra. Una OT pendiente o parcial cuya fecha límite ya pasó.
// No cumplida/no_cumplida no cuentan (ya están cerradas de una forma u otra).
function esOtVencida(ot) {
  const hoy = new Date().toISOString().slice(0, 10);
  return (ot.estado === "pendiente" || ot.estado === "parcial") && ot.fecha_limite < hoy;
}

function OtCard({
  ot,
  empleados,
  hitos,
  puedeGestionar,
  puedeMarcarEstado,
  esAdmin,
  onCambiarEstado,
  onCambiarMotivo,
  onGuardarDetalle,
  onCambiarResponsable,
  onCambiarHito,
  onReprogramar,
}) {
  const [nuevaFecha, setNuevaFecha] = useState(ot.fecha_limite);
  const nombreResponsable = ot.empleados?.nombre ?? ot.responsable;
  const otCerrada = ot.estado === "cumplida" && !esAdmin;
  const vencida = esOtVencida(ot);

  return (
    <div
      className={`rounded-md border p-4 ${
        vencida ? "border-accent bg-accent/5" : "border-zinc-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">{ot.descripcion}</p>
        <div className="flex shrink-0 gap-1">
          {vencida && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">
              Vencida
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              TIPOS.find((t) => t.value === ot.tipo)?.color ?? "bg-zinc-100 text-zinc-700"
            }`}
          >
            {TIPOS.find((t) => t.value === ot.tipo)?.label ?? ot.tipo}
          </span>
        </div>
      </div>
      <p className={`mt-1 text-xs ${vencida ? "font-medium text-accent" : "text-zinc-500"}`}>
        {ot.fecha_inicio ? `Desde: ${ot.fecha_inicio} · ` : ""}
        Vence: {ot.fecha_limite}
        {!puedeGestionar && nombreResponsable ? ` · ${nombreResponsable}` : ""}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400">Creado por: {ot.creado_por}</p>

      {vencida && puedeGestionar && !otCerrada && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onReprogramar(ot, nuevaFecha);
          }}
          className="mt-2 flex flex-wrap items-end gap-2 rounded-md bg-accent/10 p-2"
        >
          <div>
            <label className="block text-xs font-medium text-accent">
              Reprogramar a
            </label>
            <input
              required
              type="date"
              value={nuevaFecha}
              onChange={(e) => setNuevaFecha(e.target.value)}
              className="mt-1 rounded-md border border-accent/50 bg-white px-2 py-1 text-sm text-zinc-900"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
          >
            Reprogramar
          </button>
        </form>
      )}

      {otCerrada && (
        <div className="mt-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
          <p className="font-medium">Esta OT está cumplida y cerrada.</p>
          <p className="mt-0.5 text-xs">
            {ot.cumplidaPor
              ? `Marcada por ${ot.cumplidaPor.email} el ${new Date(
                  ot.cumplidaPor.fecha
                ).toLocaleString()}. `
              : ""}
            Solo un administrador puede reabrirla o modificarla — pedíselo por fuera del
            sistema.
          </p>
        </div>
      )}

      {puedeGestionar && !otCerrada && (
        <div className="mt-2 flex flex-wrap gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500">
              Responsable
            </label>
            <select
              value={ot.responsable_id ?? ""}
              onChange={(e) => onCambiarResponsable(ot, e.target.value)}
              className="mt-1 w-full max-w-xs rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">
                {ot.responsable_id ? "— Sin asignar —" : ot.responsable || "— Sin asignar —"}
              </option>
              {empleados.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre}
                </option>
              ))}
            </select>
          </div>

          {hitos.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-zinc-500">Hito</label>
              <select
                value={ot.hito_id ?? ""}
                onChange={(e) => onCambiarHito(ot, e.target.value)}
                className="mt-1 w-full max-w-xs rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">— Sin hito —</option>
                {hitos.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {puedeMarcarEstado && !otCerrada ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {ESTADOS.map((e) => {
            const activo = ot.estado === e.value;
            return (
              <button
                key={e.value}
                onClick={() => onCambiarEstado(ot, e.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  activo ? e.activo : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {e.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-3">
          <span
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              ESTADOS.find((e) => e.value === ot.estado)?.activo ?? "bg-zinc-100 text-zinc-700"
            }`}
          >
            {ESTADOS.find((e) => e.value === ot.estado)?.label ?? ot.estado}
          </span>
        </div>
      )}

      {ot.estado === "no_cumplida" && (
        <div className="mt-3 rounded-md bg-accent/10 p-3">
          <label className="block text-xs font-medium text-accent">Motivo</label>
          {puedeMarcarEstado && !otCerrada ? (
            <>
              <select
                value={ot.motivo_incumplimiento ?? ""}
                onChange={(e) => onCambiarMotivo(ot, e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="" disabled>
                  Elegir motivo...
                </option>
                {MOTIVOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {ot.motivo_incumplimiento === "otro" && (
                <input
                  type="text"
                  defaultValue={ot.motivo_detalle ?? ""}
                  onBlur={(e) => onGuardarDetalle(ot, e.target.value)}
                  placeholder="Detalle del motivo..."
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                />
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-zinc-700">
              {MOTIVOS.find((m) => m.value === ot.motivo_incumplimiento)?.label ??
                ot.motivo_incumplimiento}
              {ot.motivo_detalle ? ` — ${ot.motivo_detalle}` : ""}
            </p>
          )}
        </div>
      )}

      <HistorialOt otId={ot.id} />
    </div>
  );
}

function HistorialOt({ otId }) {
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
    const [estadosRes, fechasRes] = await Promise.all([
      supabase
        .from("ot_historial_estados")
        .select("estado, usuario_email, created_at")
        .eq("ot_id", otId),
      supabase
        .from("ot_historial_fechas")
        .select("fecha_limite_anterior, fecha_limite_nueva, usuario_email, created_at")
        .eq("ot_id", otId),
    ]);

    const lista = [
      ...(estadosRes.data ?? []).map((e) => ({
        fecha: e.created_at,
        usuario: e.usuario_email,
        texto: `Estado cambiado a "${ESTADOS.find((x) => x.value === e.estado)?.label ?? e.estado}"`,
      })),
      ...(fechasRes.data ?? []).map((f) => ({
        fecha: f.created_at,
        usuario: f.usuario_email,
        texto: `Fecha límite: ${f.fecha_limite_anterior ?? "(sin fecha)"} → ${f.fecha_limite_nueva}`,
      })),
    ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    setEventos(lista);
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
            <p className="text-xs text-zinc-500">Todavía no tiene cambios registrados.</p>
          )}
          {eventos && eventos.length > 0 && (
            <ul className="space-y-1">
              {eventos.map((ev, i) => (
                <li key={i} className="text-xs text-zinc-600">
                  <span className="text-zinc-400">
                    {new Date(ev.fecha).toLocaleString()}
                  </span>{" "}
                  — {ev.texto} ({ev.usuario ?? "desconocido"})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function GrupoHito({ hito, ots, ...cardProps }) {
  const total = ots.length;
  const cumplidas = ots.filter((o) => o.estado === "cumplida").length;
  const porcentaje = total > 0 ? Math.round((cumplidas / total) * 100) : 0;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-primary">
            {hito ? hito.nombre : "Sin hito"}
          </h3>
          {hito && (
            <p className="text-xs text-zinc-500">
              {hito.fecha_objetivo ?? "sin fecha"} ·{" "}
              <span
                className={
                  hito.estado === "cumplido" ? "text-green-700" : "text-zinc-500"
                }
              >
                {hito.estado}
              </span>
            </p>
          )}
        </div>
        {hito && (
          <div className="w-32 shrink-0 text-right">
            <span className="text-xs font-medium text-zinc-600">
              {cumplidas}/{total} · {porcentaje}%
            </span>
            <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-200">
              <div
                className="h-1.5 rounded-full bg-green-600"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 space-y-3">
        {ots.map((ot) => (
          <OtCard key={ot.id} ot={ot} {...cardProps} />
        ))}
      </div>
    </div>
  );
}

export default function OrdenesTrabajo({ obraId, hitos, onHitosCambio }) {
  const role = useRole();
  const esAdmin = role === "administrador";
  const puedeGestionar = role === "administrador" || role === "jefe_obra";
  const puedeMarcarEstado =
    role === "administrador" || role === "capataz" || role === "jefe_obra";

  const [ots, setOts] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(valoresIniciales);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState(null);

  const cargarOts = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("ordenes_trabajo")
      .select("*, empleados(id, nombre)")
      .eq("obra_id", obraId)
      .order("fecha_limite");

    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }

    setError(null);

    const idsCumplidas = (data ?? []).filter((o) => o.estado === "cumplida").map((o) => o.id);
    if (idsCumplidas.length === 0) {
      setOts(data);
      setCargando(false);
      return;
    }

    const { data: historial } = await supabase
      .from("ot_historial_estados")
      .select("ot_id, usuario_email, created_at")
      .eq("estado", "cumplida")
      .in("ot_id", idsCumplidas)
      .order("created_at", { ascending: false });

    const cumplidaPorId = {};
    (historial ?? []).forEach((h) => {
      if (!cumplidaPorId[h.ot_id]) {
        cumplidaPorId[h.ot_id] = { email: h.usuario_email, fecha: h.created_at };
      }
    });

    setOts(data.map((o) => ({ ...o, cumplidaPor: cumplidaPorId[o.id] ?? null })));
    setCargando(false);
  }, [obraId]);

  useEffect(() => {
    cargarOts();
  }, [cargarOts]);

  useEffect(() => {
    if (!puedeGestionar) return;
    supabase
      .from("empleados")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setEmpleados(data ?? []));
  }, [puedeGestionar]);

  async function handleCambiarEstado(ot, nuevoEstado) {
    const cambios = { estado: nuevoEstado };
    if (nuevoEstado !== "no_cumplida") {
      cambios.motivo_incumplimiento = null;
      cambios.motivo_detalle = null;
    }

    setOts((prev) =>
      prev.map((o) => (o.id === ot.id ? { ...o, ...cambios } : o))
    );

    const { error } = await supabase.rpc("marcar_estado_ot", {
      p_ot_id: ot.id,
      p_estado: nuevoEstado,
      p_motivo_incumplimiento: cambios.motivo_incumplimiento ?? ot.motivo_incumplimiento,
      p_motivo_detalle: cambios.motivo_detalle ?? ot.motivo_detalle,
    });

    if (error) {
      setError(error.message);
      cargarOts();
    }
  }

  async function handleCambiarMotivo(ot, motivo) {
    const cambios = {
      motivo_incumplimiento: motivo,
      motivo_detalle: motivo === "otro" ? ot.motivo_detalle : null,
    };
    setOts((prev) =>
      prev.map((o) => (o.id === ot.id ? { ...o, ...cambios } : o))
    );

    const { error } = await supabase.rpc("marcar_estado_ot", {
      p_ot_id: ot.id,
      p_estado: ot.estado,
      p_motivo_incumplimiento: cambios.motivo_incumplimiento,
      p_motivo_detalle: cambios.motivo_detalle,
    });

    if (error) {
      setError(error.message);
      cargarOts();
    }
  }

  async function handleGuardarDetalle(ot, detalle) {
    setOts((prev) =>
      prev.map((o) => (o.id === ot.id ? { ...o, motivo_detalle: detalle } : o))
    );

    const { error } = await supabase.rpc("marcar_estado_ot", {
      p_ot_id: ot.id,
      p_estado: ot.estado,
      p_motivo_incumplimiento: ot.motivo_incumplimiento,
      p_motivo_detalle: detalle,
    });

    if (error) {
      setError(error.message);
      cargarOts();
    }
  }

  async function handleCambiarResponsable(ot, empleadoId) {
    setOts((prev) =>
      prev.map((o) =>
        o.id === ot.id
          ? {
              ...o,
              responsable_id: empleadoId || null,
              empleados: empleados.find((e) => e.id === empleadoId) ?? null,
            }
          : o
      )
    );

    const { error } = await supabase
      .from("ordenes_trabajo")
      .update({ responsable_id: empleadoId || null })
      .eq("id", ot.id);

    if (error) {
      setError(error.message);
      cargarOts();
    }
  }

  async function handleCambiarHito(ot, hitoId) {
    setOts((prev) =>
      prev.map((o) => (o.id === ot.id ? { ...o, hito_id: hitoId || null } : o))
    );

    const { error } = await supabase
      .from("ordenes_trabajo")
      .update({ hito_id: hitoId || null })
      .eq("id", ot.id);

    if (error) {
      setError(error.message);
      cargarOts();
    }
  }

  async function handleReprogramar(ot, nuevaFecha) {
    setOts((prev) =>
      prev.map((o) => (o.id === ot.id ? { ...o, fecha_limite: nuevaFecha } : o))
    );

    const { error } = await supabase
      .from("ordenes_trabajo")
      .update({ fecha_limite: nuevaFecha })
      .eq("id", ot.id);

    if (error) {
      setError(error.message);
      cargarOts();
    }
  }

  async function handleCrearOt(e) {
    e.preventDefault();
    setGuardando(true);
    setErrorForm(null);

    const { data: sesion } = await supabase.auth.getSession();

    const { error } = await supabase.from("ordenes_trabajo").insert({
      obra_id: obraId,
      descripcion: form.descripcion.trim(),
      responsable_id: form.responsable_id || null,
      hito_id: form.hito_id || null,
      fecha_inicio: form.fecha_inicio || null,
      fecha_limite: form.fecha_limite,
      creado_por: sesion.session?.user?.email ?? "desconocido",
    });

    if (error) {
      setErrorForm(error.message);
    } else {
      setForm(valoresIniciales);
      setMostrarForm(false);
      await cargarOts();
    }
    setGuardando(false);
  }

  const cardProps = {
    empleados,
    hitos,
    puedeGestionar,
    puedeMarcarEstado,
    esAdmin,
    onCambiarEstado: handleCambiarEstado,
    onCambiarMotivo: handleCambiarMotivo,
    onGuardarDetalle: handleGuardarDetalle,
    onCambiarResponsable: handleCambiarResponsable,
    onCambiarHito: handleCambiarHito,
    onReprogramar: handleReprogramar,
  };

  const grupos =
    hitos.length === 0
      ? null
      : [
          ...hitos.map((h) => ({ hito: h, ots: ots.filter((o) => o.hito_id === h.id) })),
          { hito: null, ots: ots.filter((o) => !o.hito_id) },
        ].filter((g) => g.hito || g.ots.length > 0);

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-primary">
          Órdenes de trabajo
        </h2>
        {puedeGestionar && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {mostrarForm ? "Cancelar" : "+ Nueva OT"}
          </button>
        )}
      </div>

      {puedeGestionar && (
        <ImportarPlanTrabajo
          obraId={obraId}
          hitos={hitos}
          onImportado={cargarOts}
          onHitosCreados={onHitosCambio}
        />
      )}

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      {mostrarForm && puedeGestionar && (
        <form
          onSubmit={handleCrearOt}
          className="mt-4 rounded-md border border-zinc-200 p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700">
                Descripción de la tarea *
              </label>
              <textarea
                required
                value={form.descripcion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, descripcion: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Responsable
              </label>
              <select
                value={form.responsable_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, responsable_id: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                <option value="">— Sin asignar —</option>
                {empleados.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombre}
                  </option>
                ))}
              </select>
            </div>
            {hitos.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Hito
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
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Fecha de inicio
              </label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fecha_inicio: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Fecha límite *
              </label>
              <input
                required
                type="date"
                value={form.fecha_limite}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fecha_limite: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              />
            </div>
          </div>

          {errorForm && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              {errorForm}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar OT"}
          </button>
        </form>
      )}

      {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && ots.length === 0 && (
        <p className="mt-4 text-sm text-zinc-600">
          Todavía no hay órdenes de trabajo para esta obra.
        </p>
      )}

      {!cargando && ots.length > 0 && grupos === null && (
        <div className="mt-4 space-y-3">
          {ots.map((ot) => (
            <OtCard key={ot.id} ot={ot} {...cardProps} />
          ))}
        </div>
      )}

      {!cargando && grupos !== null && (
        <div className="divide-y divide-zinc-100">
          {grupos.map((grupo) => (
            <GrupoHito
              key={grupo.hito?.id ?? "sin-hito"}
              hito={grupo.hito}
              ots={grupo.ots}
              {...cardProps}
            />
          ))}
        </div>
      )}
    </div>
  );
}
