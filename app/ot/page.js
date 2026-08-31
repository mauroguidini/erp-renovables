"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ESTADOS, MOTIVOS, TIPOS } from "../otConstants";
import { useRole } from "../RoleContext";

const ESTADO_SELECT_COLOR = {
  pendiente: "bg-zinc-600 text-white",
  cumplida: "bg-green-600 text-white",
  parcial: "bg-yellow-500 text-white",
  no_cumplida: "bg-accent text-white",
};

// Igual criterio que en el detalle de obra: "vencida" no se guarda en
// ningún lado, se calcula al vuelo cada vez que se muestra.
function esOtVencida(ot) {
  const hoy = new Date().toISOString().slice(0, 10);
  return (ot.estado === "pendiente" || ot.estado === "parcial") && ot.fecha_limite < hoy;
}

export default function PanelOt() {
  const role = useRole();
  const esAdmin = role === "administrador";
  const puedeGestionar = role === "administrador" || role === "jefe_obra";
  const puedeMarcarEstado =
    role === "administrador" || role === "capataz" || role === "jefe_obra";

  const searchParams = useSearchParams();
  const [ots, setOts] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [nombresClientes, setNombresClientes] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [filtroObra, setFiltroObra] = useState("");
  const [filtroResponsable, setFiltroResponsable] = useState("");
  const [filtroEstado, setFiltroEstado] = useState(
    searchParams.get("estado") ?? ""
  );
  const [filtroTipo, setFiltroTipo] = useState("");

  const cargarOts = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("ordenes_trabajo")
      .select(
        "*, obras(id, direccion, cliente_id), empleados(id, nombre)"
      )
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
  }, []);

  useEffect(() => {
    cargarOts();
    supabase
      .from("clientes_nombre")
      .select("id, nombre")
      .then(({ data }) => {
        const mapa = {};
        (data ?? []).forEach((c) => {
          mapa[c.id] = c.nombre;
        });
        setNombresClientes(mapa);
      });
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

  const obras = useMemo(() => {
    const mapa = new Map();
    ots.forEach((ot) => {
      if (ot.obras) mapa.set(ot.obras.id, ot.obras);
    });
    return Array.from(mapa.values());
  }, [ots]);

  const responsables = useMemo(() => {
    const set = new Set(
      ots
        .map((ot) => ot.empleados?.nombre ?? ot.responsable)
        .filter((r) => r && r.trim())
    );
    return Array.from(set).sort();
  }, [ots]);

  const otsFiltradas = ots.filter((ot) => {
    const nombreResponsable = ot.empleados?.nombre ?? ot.responsable;
    if (filtroObra && ot.obras?.id !== filtroObra) return false;
    if (filtroResponsable && nombreResponsable !== filtroResponsable) return false;
    if (filtroEstado && ot.estado !== filtroEstado) return false;
    if (filtroTipo && ot.tipo !== filtroTipo) return false;
    return true;
  });

  function actualizarOtLocal(id, cambios) {
    setOts((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...cambios } : o))
    );
  }

  async function handleCambiarEstado(ot, nuevoEstado) {
    const cambios = { estado: nuevoEstado };
    if (nuevoEstado !== "no_cumplida") {
      cambios.motivo_incumplimiento = null;
      cambios.motivo_detalle = null;
    }
    actualizarOtLocal(ot.id, cambios);

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
    actualizarOtLocal(ot.id, cambios);

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
    actualizarOtLocal(ot.id, { motivo_detalle: detalle });

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
    actualizarOtLocal(ot.id, {
      responsable_id: empleadoId || null,
      empleados: empleados.find((e) => e.id === empleadoId) ?? null,
    });

    const { error } = await supabase
      .from("ordenes_trabajo")
      .update({ responsable_id: empleadoId || null })
      .eq("id", ot.id);

    if (error) {
      setError(error.message);
      cargarOts();
    }
  }

  async function handleReprogramar(ot, nuevaFecha) {
    actualizarOtLocal(ot.id, { fecha_limite: nuevaFecha });

    const { error } = await supabase
      .from("ordenes_trabajo")
      .update({ fecha_limite: nuevaFecha })
      .eq("id", ot.id);

    if (error) {
      setError(error.message);
      cargarOts();
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-primary">
          Órdenes de trabajo
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Vista general de todas las obras. Marcá el estado directo desde acá.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <select
            value={filtroObra}
            onChange={(e) => setFiltroObra(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Todas las obras</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {nombresClientes[o.cliente_id] ? `${nombresClientes[o.cliente_id]} — ` : ""}
                {o.direccion}
              </option>
            ))}
          </select>

          <select
            value={filtroResponsable}
            onChange={(e) => setFiltroResponsable(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Todos los responsables</option>
            {responsables.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {!cargando && otsFiltradas.length === 0 && (
          <p className="mt-6 text-zinc-600">
            No hay órdenes de trabajo que coincidan con los filtros.
          </p>
        )}

        {!cargando && otsFiltradas.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="px-4 py-2 font-medium">N°</th>
                  <th className="px-4 py-2 font-medium">Obra</th>
                  <th className="px-4 py-2 font-medium">Descripción</th>
                  <th className="px-4 py-2 font-medium">Responsable</th>
                  <th className="px-4 py-2 font-medium">Fecha límite</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {otsFiltradas.map((ot) => {
                  const nombreResponsable = ot.empleados?.nombre ?? ot.responsable;
                  const otCerrada =
                    (ot.estado === "cumplida" || ot.estado === "reemplazada") && !esAdmin;
                  const vencida = esOtVencida(ot);
                  return (
                    <tr key={ot.id}>
                      <td className="px-4 py-3 text-zinc-400">#{ot.numero}</td>
                      <td className="px-4 py-3 text-zinc-900">
                        <Link
                          href={`/obras/${ot.obras?.id}`}
                          className="hover:underline"
                        >
                          {ot.obras?.cliente_id && nombresClientes[ot.obras.cliente_id]
                            ? `${nombresClientes[ot.obras.cliente_id]} — `
                            : ""}
                          {ot.obras?.direccion ?? "(obra eliminada)"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-900">
                        {ot.descripcion}
                      </td>
                      <td className="px-4 py-3 text-zinc-900">
                        {puedeGestionar && !otCerrada ? (
                          <select
                            value={ot.responsable_id ?? ""}
                            onChange={(e) =>
                              handleCambiarResponsable(ot, e.target.value)
                            }
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
                          >
                            <option value="">
                              {ot.responsable_id
                                ? "— Sin asignar —"
                                : ot.responsable || "— Sin asignar —"}
                            </option>
                            {empleados.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.nombre}
                              </option>
                            ))}
                          </select>
                        ) : (
                          nombreResponsable ?? "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-900">
                        <span className={vencida ? "font-medium text-accent" : ""}>
                          {ot.fecha_limite}
                        </span>
                        {vencida && (
                          <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">
                            Vencida
                          </span>
                        )}
                        {vencida && puedeGestionar && !otCerrada && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleReprogramar(ot, e.target.elements.nuevaFecha.value);
                            }}
                            className="mt-1 flex items-center gap-1"
                          >
                            <input
                              required
                              type="date"
                              name="nuevaFecha"
                              defaultValue={ot.fecha_limite}
                              className="rounded-md border border-accent/50 bg-white px-1 py-0.5 text-xs text-zinc-900"
                            />
                            <button
                              type="submit"
                              className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-white hover:bg-accent/90"
                            >
                              Reprogramar
                            </button>
                          </form>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            TIPOS.find((t) => t.value === ot.tipo)?.color ??
                            "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {TIPOS.find((t) => t.value === ot.tipo)?.label ??
                            ot.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {puedeMarcarEstado && !otCerrada && ot.estado !== "reemplazada" ? (
                          <select
                            value={ot.estado}
                            onChange={(e) =>
                              handleCambiarEstado(ot, e.target.value)
                            }
                            className={`rounded-full border-0 px-3 py-1.5 text-xs font-medium ${
                              ESTADO_SELECT_COLOR[ot.estado] ?? "bg-zinc-100 text-zinc-700"
                            }`}
                          >
                            {ESTADOS.map((e) => (
                              <option key={e.value} value={e.value}>
                                {e.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                              ESTADO_SELECT_COLOR[ot.estado] ?? "bg-zinc-100 text-zinc-700"
                            }`}
                          >
                            {ESTADOS.find((e) => e.value === ot.estado)?.label ??
                              (ot.estado === "reemplazada" ? "Reemplazada" : ot.estado)}
                          </span>
                        )}

                        {otCerrada && ot.estado === "cumplida" && (
                          <p className="mt-1 text-xs text-zinc-500">
                            Cerrada
                            {ot.cumplidaPor
                              ? ` por ${ot.cumplidaPor.email} el ${new Date(
                                  ot.cumplidaPor.fecha
                                ).toLocaleDateString()}`
                              : ""}
                            . Solo admin puede reabrirla.
                          </p>
                        )}

                        {ot.estado === "reemplazada" && (
                          <p className="mt-1 text-xs text-zinc-500">
                            Reemplazada. Ver detalle en la obra para más información.
                          </p>
                        )}

                        {ot.estado === "no_cumplida" && (
                          <div className="mt-2">
                            {puedeMarcarEstado ? (
                              <>
                                <select
                                  value={ot.motivo_incumplimiento ?? ""}
                                  onChange={(e) =>
                                    handleCambiarMotivo(ot, e.target.value)
                                  }
                                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
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
                                    onBlur={(e) =>
                                      handleGuardarDetalle(ot, e.target.value)
                                    }
                                    placeholder="Detalle..."
                                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900"
                                  />
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-zinc-600">
                                {MOTIVOS.find(
                                  (m) => m.value === ot.motivo_incumplimiento
                                )?.label ?? ot.motivo_incumplimiento}
                                {ot.motivo_detalle ? ` — ${ot.motivo_detalle}` : ""}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
