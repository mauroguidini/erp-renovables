"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

const ETIQUETAS_CAMPO = {
  presente: "Presente",
  llego_tarde: "Llegó tarde",
  se_fue_antes: "Se fue antes",
  hora_inicio: "Hora de inicio",
  hora_cierre: "Hora de cierre",
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function ObrerosObra({ obraId, puedeGestionar }) {
  const [obreros, setObreros] = useState([]);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from("obreros")
      .select("*")
      .eq("obra_id", obraId)
      .order("nombre");
    setObreros(data ?? []);
  }, [obraId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleAgregar(e) {
    e.preventDefault();
    if (!nombreNuevo.trim()) return;
    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("obreros")
      .insert({ obra_id: obraId, nombre: nombreNuevo.trim() });

    if (error) {
      setError(error.message);
    } else {
      setNombreNuevo("");
      await cargar();
    }
    setGuardando(false);
  }

  async function handleActivo(obrero, activo) {
    setObreros((prev) => prev.map((o) => (o.id === obrero.id ? { ...o, activo } : o)));
    const { error } = await supabase.from("obreros").update({ activo }).eq("id", obrero.id);
    if (error) {
      setError(error.message);
      cargar();
    }
  }

  return (
    <details className="mt-4 rounded-md border border-zinc-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-zinc-700">
        Obreros de la obra ({obreros.filter((o) => o.activo).length} activos)
      </summary>

      {error && (
        <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      <ul className="mt-2 divide-y divide-zinc-100">
        {obreros.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className={`text-sm ${o.activo ? "text-zinc-900" : "text-zinc-400 line-through"}`}>
              {o.nombre}
            </span>
            {puedeGestionar && (
              <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                <input
                  type="checkbox"
                  checked={o.activo}
                  onChange={(e) => handleActivo(o, e.target.checked)}
                />
                Activo
              </label>
            )}
          </li>
        ))}
        {obreros.length === 0 && (
          <li className="py-1.5 text-sm text-zinc-500">Todavía no hay obreros cargados.</li>
        )}
      </ul>

      {puedeGestionar && (
        <form onSubmit={handleAgregar} className="mt-2 flex gap-2">
          <input
            type="text"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre del obrero"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
      )}
    </details>
  );
}

function HistorialParte({ parteId }) {
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
      .from("partes_asistencia_historial")
      .select("*, obreros(nombre)")
      .eq("parte_id", parteId)
      .order("created_at", { ascending: false });
    setEventos(data ?? []);
    setCargando(false);
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleToggle}
        className="text-xs font-medium text-zinc-500 hover:text-primary hover:underline"
      >
        {abierto ? "Ocultar historial de correcciones" : "Ver historial de correcciones"}
      </button>

      {abierto && (
        <div className="mt-1 rounded-md bg-zinc-50 p-2">
          {cargando && <p className="text-xs text-zinc-500">Cargando...</p>}
          {eventos && eventos.length === 0 && (
            <p className="text-xs text-zinc-500">Sin correcciones registradas.</p>
          )}
          {eventos && eventos.length > 0 && (
            <ul className="space-y-1">
              {eventos.map((ev) => (
                <li key={ev.id} className="text-xs text-zinc-600">
                  <span className="text-zinc-400">
                    {new Date(ev.created_at).toLocaleString()}
                  </span>
                  {" — "}
                  {ev.obreros ? `${ev.obreros.nombre}: ` : ""}
                  {ETIQUETAS_CAMPO[ev.campo] ?? ev.campo} de "{ev.valor_anterior ?? "—"}" a "
                  {ev.valor_nuevo}" ({ev.usuario_email ?? "desconocido"})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function ParteAsistencia({ obraId }) {
  const role = useRole();
  const esAdmin = role === "administrador";
  const puedeRegistrar =
    role === "administrador" || role === "capataz" || role === "jefe_obra";

  const [fecha, setFecha] = useState(hoyISO());
  const [parte, setParte] = useState(undefined);
  const [detalle, setDetalle] = useState([]);
  const [error, setError] = useState(null);

  const [horaInicioForm, setHoraInicioForm] = useState("08:00");
  const [horaCierreForm, setHoraCierreForm] = useState("17:00");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    setParte(undefined);

    const { data: parteData, error: errParte } = await supabase
      .from("partes_asistencia")
      .select("*")
      .eq("obra_id", obraId)
      .eq("fecha", fecha)
      .maybeSingle();

    if (errParte) {
      setError(errParte.message);
      setParte(null);
      return;
    }

    setParte(parteData ?? null);

    if (!parteData) {
      setDetalle([]);
      return;
    }

    const { data: detalleData } = await supabase
      .from("partes_asistencia_detalle")
      .select("*, obreros(id, nombre)")
      .eq("parte_id", parteData.id);

    setDetalle(
      [...(detalleData ?? [])].sort((a, b) =>
        (a.obreros?.nombre ?? "").localeCompare(b.obreros?.nombre ?? "")
      )
    );
  }, [obraId, fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleAbrir(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const { error } = await supabase.rpc("crear_parte_asistencia", {
      p_obra_id: obraId,
      p_fecha: fecha,
      p_hora_inicio: horaInicioForm,
    });

    if (error) {
      setError(error.message);
    } else {
      await cargar();
    }
    setGuardando(false);
  }

  async function handleCerrar(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const { error } = await supabase.rpc("cerrar_parte_asistencia", {
      p_parte_id: parte.id,
      p_hora_cierre: horaCierreForm,
    });

    if (error) {
      setError(error.message);
    } else {
      await cargar();
    }
    setGuardando(false);
  }

  async function handleToggleCampo(fila, campo, valor) {
    const cambios = { [campo]: valor };
    if (campo === "presente" && !valor) {
      cambios.llego_tarde = false;
      cambios.se_fue_antes = false;
    }

    setDetalle((prev) =>
      prev.map((d) => (d.id === fila.id ? { ...d, ...cambios } : d))
    );

    const { error } = await supabase
      .from("partes_asistencia_detalle")
      .update(cambios)
      .eq("id", fila.id);

    if (error) {
      setError(error.message);
      cargar();
    }
  }

  const puedeEditar = !!parte && (esAdmin || (puedeRegistrar && parte.estado === "abierto"));

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-primary">Parte de asistencia</h2>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-primary"
        />
      </div>

      <ObrerosObra obraId={obraId} puedeGestionar={puedeRegistrar} />

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      {parte === undefined && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {parte === null && puedeRegistrar && (
        <form
          onSubmit={handleAbrir}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 p-3"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-700">
              Hora de inicio de la jornada
            </label>
            <input
              required
              type="time"
              value={horaInicioForm}
              onChange={(e) => setHoraInicioForm(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Abriendo..." : "Abrir parte de este día"}
          </button>
        </form>
      )}

      {parte === null && !puedeRegistrar && (
        <p className="mt-4 text-sm text-zinc-600">
          No se cargó parte de asistencia para esta fecha.
        </p>
      )}

      {parte && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                parte.estado === "cerrado"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {parte.estado === "cerrado" ? "Cerrado" : "Abierto"}
            </span>
            <span>Inicio: {parte.hora_inicio}</span>
            {parte.hora_cierre && <span>· Cierre: {parte.hora_cierre}</span>}
          </div>
          {parte.estado === "cerrado" && (
            <p className="mt-1 text-xs text-zinc-400">
              Cerrado por {parte.cerrado_por_email} el{" "}
              {new Date(parte.cerrado_en).toLocaleString()}
            </p>
          )}

          {parte.estado === "cerrado" && !esAdmin && (
            <div className="mt-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
              Este parte ya está cerrado. Solo un administrador puede corregirlo.
            </div>
          )}

          <div className="mt-3 divide-y divide-zinc-100">
            {detalle.map((fila) => (
              <div
                key={fila.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="text-sm text-zinc-900">{fila.obreros?.nombre}</span>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5 text-zinc-700">
                    <input
                      type="checkbox"
                      checked={fila.presente}
                      disabled={!puedeEditar}
                      onChange={(e) =>
                        handleToggleCampo(fila, "presente", e.target.checked)
                      }
                    />
                    Presente
                  </label>
                  <label
                    className={`flex items-center gap-1.5 ${
                      fila.presente ? "text-zinc-700" : "text-zinc-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={fila.llego_tarde}
                      disabled={!puedeEditar || !fila.presente}
                      onChange={(e) =>
                        handleToggleCampo(fila, "llego_tarde", e.target.checked)
                      }
                    />
                    Llegó tarde
                  </label>
                  <label
                    className={`flex items-center gap-1.5 ${
                      fila.presente ? "text-zinc-700" : "text-zinc-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={fila.se_fue_antes}
                      disabled={!puedeEditar || !fila.presente}
                      onChange={(e) =>
                        handleToggleCampo(fila, "se_fue_antes", e.target.checked)
                      }
                    />
                    Se fue antes
                  </label>
                </div>
              </div>
            ))}
            {detalle.length === 0 && (
              <p className="py-2 text-sm text-zinc-500">
                No hay obreros activos cargados para esta obra.
              </p>
            )}
          </div>

          {parte.estado === "abierto" && puedeRegistrar && (
            <form
              onSubmit={handleCerrar}
              className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 p-3"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-700">
                  Hora de cierre de la jornada
                </label>
                <input
                  required
                  type="time"
                  value={horaCierreForm}
                  onChange={(e) => setHoraCierreForm(e.target.value)}
                  className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                />
              </div>
              <button
                type="submit"
                disabled={guardando}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {guardando ? "Cerrando..." : "Cerrar parte"}
              </button>
            </form>
          )}

          <HistorialParte parteId={parte.id} />
        </div>
      )}
    </div>
  );
}
