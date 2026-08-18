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

function OtCard({
  ot,
  empleados,
  hitos,
  puedeGestionar,
  puedeMarcarEstado,
  onCambiarEstado,
  onCambiarMotivo,
  onGuardarDetalle,
  onCambiarResponsable,
  onCambiarHito,
}) {
  const nombreResponsable = ot.empleados?.nombre ?? ot.responsable;

  return (
    <div className="rounded-md border border-zinc-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">{ot.descripcion}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            TIPOS.find((t) => t.value === ot.tipo)?.color ?? "bg-zinc-100 text-zinc-700"
          }`}
        >
          {TIPOS.find((t) => t.value === ot.tipo)?.label ?? ot.tipo}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {ot.fecha_inicio ? `Desde: ${ot.fecha_inicio} · ` : ""}
        Vence: {ot.fecha_limite}
        {!puedeGestionar && nombreResponsable ? ` · ${nombreResponsable}` : ""}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400">Creado por: {ot.creado_por}</p>

      {puedeGestionar && (
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

      {puedeMarcarEstado ? (
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
          {puedeMarcarEstado ? (
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
    } else {
      setError(null);
      setOts(data);
    }
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
    onCambiarEstado: handleCambiarEstado,
    onCambiarMotivo: handleCambiarMotivo,
    onGuardarDetalle: handleGuardarDetalle,
    onCambiarResponsable: handleCambiarResponsable,
    onCambiarHito: handleCambiarHito,
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
