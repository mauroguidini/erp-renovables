"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

const TIPOS = [
  { value: "maquina", label: "Máquina" },
  { value: "camion", label: "Camión" },
  { value: "grua", label: "Grúa" },
  { value: "flete", label: "Flete" },
];

function etiquetaTipo(tipo) {
  return TIPOS.find((t) => t.value === tipo)?.label ?? tipo;
}

function formatearMonto(monto) {
  return Number(monto ?? 0).toLocaleString("es-AR", {
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

function ComponentesCosto({ maquinaId, puedeGestionar, onCambio }) {
  const [componentes, setComponentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("maquina_componentes_costo")
      .select("*")
      .eq("maquina_id", maquinaId)
      .order("created_at");
    setComponentes(data ?? []);
    setCargando(false);
  }, [maquinaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleAgregar(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const { error } = await supabase.from("maquina_componentes_costo").insert({
      maquina_id: maquinaId,
      nombre: nombre.trim(),
      monto_por_hora: monto,
    });

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    setNombre("");
    setMonto("");
    setGuardando(false);
    await cargar();
    onCambio();
  }

  async function handleEditarMonto(comp, nuevoMonto) {
    setComponentes((prev) =>
      prev.map((c) => (c.id === comp.id ? { ...c, monto_por_hora: nuevoMonto } : c))
    );
    const { error } = await supabase
      .from("maquina_componentes_costo")
      .update({ monto_por_hora: nuevoMonto })
      .eq("id", comp.id);
    if (error) setError(error.message);
    onCambio();
  }

  async function handleQuitar(comp) {
    const { error } = await supabase.from("maquina_componentes_costo").delete().eq("id", comp.id);
    if (error) {
      setError(error.message);
      return;
    }
    await cargar();
    onCambio();
  }

  const total = componentes.reduce((acc, c) => acc + Number(c.monto_por_hora), 0);

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-primary">Componentes de costo por hora</h2>

      {cargando && <p className="mt-2 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && componentes.length === 0 && (
        <p className="mt-2 text-sm text-zinc-600">Todavía no hay componentes cargados.</p>
      )}

      {!cargando && componentes.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100">
          {componentes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-zinc-700">{c.nombre}</span>
              <div className="flex items-center gap-2">
                {puedeGestionar ? (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={c.monto_por_hora}
                    onBlur={(e) => handleEditarMonto(c, e.target.value)}
                    className="w-28 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm text-zinc-900"
                  />
                ) : (
                  <span className="text-sm text-zinc-700">{formatearMonto(c.monto_por_hora)}</span>
                )}
                {puedeGestionar && (
                  <button
                    onClick={() => handleQuitar(c)}
                    className="text-xs text-accent hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-2">
        <span className="text-sm font-medium text-zinc-700">Tarifa por hora (suma)</span>
        <span className="text-lg font-semibold text-primary">{formatearMonto(total)}</span>
      </div>

      {puedeGestionar && (
        <form onSubmit={handleAgregar} className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Componente</label>
            <input
              required
              type="text"
              placeholder="ej. Amortización"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">$/hora</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="mt-1 w-28 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "+ Agregar"}
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </div>
  );
}

function CostosReales({ maquinaId, onCambio }) {
  const [costos, setCostos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("maquina_costos_reales")
      .select("*")
      .eq("maquina_id", maquinaId)
      .order("fecha", { ascending: false });
    setCostos(data ?? []);
    setCargando(false);
  }, [maquinaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleAgregar(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const { error } = await supabase.from("maquina_costos_reales").insert({
      maquina_id: maquinaId,
      fecha,
      monto,
      descripcion: descripcion.trim() || null,
    });

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    setMonto("");
    setDescripcion("");
    setGuardando(false);
    await cargar();
    onCambio();
  }

  async function handleBorrar(costo) {
    const { error } = await supabase.from("maquina_costos_reales").delete().eq("id", costo.id);
    if (error) {
      setError(error.message);
      return;
    }
    await cargar();
    onCambio();
  }

  const total = costos.reduce((acc, c) => acc + Number(c.monto), 0);

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-primary">Costos reales</h2>
      <p className="text-sm text-zinc-500">Repuestos, arreglos, combustible — para comparar contra lo facturado a obras.</p>

      {cargando && <p className="mt-2 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && costos.length === 0 && (
        <p className="mt-2 text-sm text-zinc-600">Todavía no hay costos reales cargados.</p>
      )}

      {!cargando && costos.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100">
          {costos.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <span className="text-sm text-zinc-700">{fechaLegible(c.fecha)}</span>
                {c.descripcion && <span className="ml-2 text-sm text-zinc-500">{c.descripcion}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900">{formatearMonto(c.monto)}</span>
                <button onClick={() => handleBorrar(c)} className="text-xs text-accent hover:underline">
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-2">
        <span className="text-sm font-medium text-zinc-700">Total costos reales</span>
        <span className="text-lg font-semibold text-accent">{formatearMonto(total)}</span>
      </div>

      <form onSubmit={handleAgregar} className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Fecha</label>
          <input
            required
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Monto</label>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="mt-1 w-28 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Descripción</label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "+ Agregar"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </div>
  );
}

export default function DetalleMaquina() {
  const role = useRole();
  const puedeVer = role === "administrador" || role === "administracion" || role === "jefe_obra";
  const puedeGestionar = role === "administrador" || role === "administracion";
  const router = useRouter();
  const { id } = useParams();

  const [maquina, setMaquina] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [totalIngresos, setTotalIngresos] = useState(0);
  const [totalCostosReales, setTotalCostosReales] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargarMaquina = useCallback(async () => {
    const { data, error } = await supabase
      .from("maquinas_con_tarifa")
      .select("*")
      .eq("id", id)
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setMaquina(data);
  }, [id]);

  const cargarMovimientos = useCallback(async () => {
    const { data } = await supabase
      .from("maquina_movimientos")
      .select("*, obras(direccion)")
      .eq("maquina_id", id)
      .order("fecha", { ascending: false });
    setMovimientos(data ?? []);
    setTotalIngresos((data ?? []).reduce((acc, m) => acc + Number(m.monto), 0));
  }, [id]);

  const cargarCostosReales = useCallback(async () => {
    if (!puedeGestionar) return;
    const { data } = await supabase
      .from("maquina_costos_reales")
      .select("monto")
      .eq("maquina_id", id);
    setTotalCostosReales((data ?? []).reduce((acc, c) => acc + Number(c.monto), 0));
  }, [id, puedeGestionar]);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    await Promise.all([cargarMaquina(), cargarMovimientos(), cargarCostosReales()]);
    setCargando(false);
  }, [cargarMaquina, cargarMovimientos, cargarCostosReales]);

  useEffect(() => {
    if (!puedeVer) return;
    cargarTodo();
  }, [puedeVer, cargarTodo]);

  async function handleToggleActiva() {
    const { error } = await supabase
      .from("maquinas")
      .update({ activa: !maquina.activa })
      .eq("id", id);
    if (error) setError(error.message);
    else await cargarMaquina();
  }

  if (!puedeVer) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-accent">No tenés permiso para ver esta página.</p>
        </div>
      </div>
    );
  }

  if (cargando || !maquina) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">{error ?? "Cargando..."}</p>
        </div>
      </div>
    );
  }

  const rentabilidad = totalIngresos - totalCostosReales;

  return (
    <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/maquinas")}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Volver a máquinas
        </button>

        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-primary">{maquina.nombre}</h1>
            <p className="text-sm text-zinc-500">
              {etiquetaTipo(maquina.tipo)}
              {!maquina.activa && " · inactiva"}
            </p>
          </div>
          {puedeGestionar && (
            <button
              onClick={handleToggleActiva}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {maquina.activa ? "Desactivar" : "Reactivar"}
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-accent">{error}</p>}

        {maquina.tipo !== "flete" && (
          <ComponentesCosto
            maquinaId={id}
            puedeGestionar={puedeGestionar}
            onCambio={cargarMaquina}
          />
        )}

        {puedeGestionar && (
          <>
            <CostosReales maquinaId={id} onCambio={cargarCostosReales} />

            <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-primary">Análisis de rentabilidad</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Total facturado a obras</p>
                  <p className="mt-1 text-lg font-semibold text-green-700">
                    {formatearMonto(totalIngresos)}
                  </p>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Total costos reales</p>
                  <p className="mt-1 text-lg font-semibold text-accent">
                    {formatearMonto(totalCostosReales)}
                  </p>
                </div>
                <div className="rounded-md bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Rentabilidad</p>
                  <p
                    className={`mt-1 text-lg font-semibold ${
                      rentabilidad >= 0 ? "text-green-700" : "text-accent"
                    }`}
                  >
                    {formatearMonto(rentabilidad)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">Uso en obras</h2>
          {movimientos.length === 0 && (
            <p className="mt-2 text-sm text-zinc-600">Todavía no se usó en ninguna obra.</p>
          )}
          {movimientos.length > 0 && (
            <ul className="mt-3 divide-y divide-zinc-100">
              {movimientos.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-zinc-900">
                      {m.obras?.direccion ?? "—"}
                    </span>
                    <span className="ml-2 text-xs text-zinc-500">
                      {fechaLegible(m.fecha)}
                      {m.horas ? ` · ${m.horas} h × ${formatearMonto(m.tarifa_hora_usada)}/h` : ""}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-zinc-900">{formatearMonto(m.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
