"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";
import OrdenesTrabajo from "./OrdenesTrabajo";
import RemitosObra from "./RemitosObra";
import Hitos from "./Hitos";
import ArchivosObra from "./ArchivosObra";

const ESTADOS = [
  "presupuestada",
  "aprobada",
  "en_curso",
  "finalizada",
  "cancelada",
];

const ESTADO_COLOR = {
  presupuestada: "bg-zinc-100 text-zinc-800",
  aprobada: "bg-blue-100 text-blue-800",
  en_curso: "bg-yellow-100 text-yellow-800",
  finalizada: "bg-green-100 text-green-800",
  cancelada: "bg-accent/10 text-accent",
};

function Dato({ etiqueta, valor }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {etiqueta}
      </dt>
      <dd className="mt-1 text-sm text-primary">{valor ?? "—"}</dd>
    </div>
  );
}

export default function DetalleObra() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "jefe_obra";
  const { id } = useParams();
  const router = useRouter();
  const [obra, setObra] = useState(null);
  const [clienteDetalle, setClienteDetalle] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const [guardandoEstado, setGuardandoEstado] = useState(false);
  const [errorEstado, setErrorEstado] = useState(null);

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState(null);

  const [hitos, setHitos] = useState([]);

  const cargarHitos = useCallback(async () => {
    const { data } = await supabase
      .from("hitos")
      .select("*")
      .eq("obra_id", id)
      .order("fecha_objetivo", { ascending: true, nullsFirst: false });
    setHitos(data ?? []);
  }, [id]);

  const cargarObra = useCallback(async () => {
    const { data, error } = await supabase
      .from("obras_visibles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }

    setError(null);
    setObra(data);

    if (data.cliente_id) {
      const { data: cliente } = await supabase
        .from("clientes")
        .select("nombre, contacto_telefono, contacto_email, direccion, cuit")
        .eq("id", data.cliente_id)
        .maybeSingle();
      setClienteDetalle(cliente ?? null);
    } else {
      setClienteDetalle(null);
    }

    setCargando(false);
  }, [id]);

  useEffect(() => {
    cargarObra();
    cargarHitos();
    supabase
      .from("clientes_nombre")
      .select("id, nombre")
      .order("nombre")
      .then(({ data }) => setClientes(data ?? []));
  }, [cargarObra, cargarHitos]);

  async function handleCambiarEstado(nuevoEstado) {
    setGuardandoEstado(true);
    setErrorEstado(null);

    const { error } = await supabase
      .from("obras")
      .update({ estado: nuevoEstado })
      .eq("id", id);

    if (error) {
      setErrorEstado(error.message);
    } else {
      await cargarObra();
    }
    setGuardandoEstado(false);
  }

  function iniciarEdicion() {
    setForm({
      cliente_id: obra.cliente_id,
      direccion: obra.direccion,
      potencia_kwp: String(obra.potencia_kwp),
      fecha_inicio: obra.fecha_inicio ?? "",
      fecha_fin_estimada: obra.fecha_fin_estimada ?? "",
      presupuesto: obra.presupuesto != null ? String(obra.presupuesto) : "",
    });
    setErrorEdicion(null);
    setEditando(true);
  }

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    setGuardandoEdicion(true);
    setErrorEdicion(null);

    const { error } = await supabase
      .from("obras")
      .update({
        cliente_id: form.cliente_id,
        direccion: form.direccion.trim(),
        potencia_kwp: Number(form.potencia_kwp),
        fecha_inicio: form.fecha_inicio || null,
        fecha_fin_estimada: form.fecha_fin_estimada || null,
        presupuesto: form.presupuesto ? Number(form.presupuesto) : null,
      })
      .eq("id", id);

    if (error) {
      setErrorEdicion(error.message);
    } else {
      await cargarObra();
      setEditando(false);
    }
    setGuardandoEdicion(false);
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo cargar la obra.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/obras")}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Volver a obras
        </button>

        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">
            {obra.direccion}
          </h1>

          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                ESTADO_COLOR[obra.estado] ?? "bg-zinc-100 text-zinc-800"
              }`}
            >
              {obra.estado.replace("_", " ")}
            </span>
            {puedeGestionar && (
              <select
                value={obra.estado}
                disabled={guardandoEstado}
                onChange={(e) => handleCambiarEstado(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-primary disabled:opacity-50"
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e.replace("_", " ")}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {errorEstado && (
          <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
            Error al cambiar el estado: {errorEstado}
          </p>
        )}

        {!editando && (
          <>
            <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-primary">Obra</h2>
                {puedeGestionar && (
                  <button
                    onClick={iniciarEdicion}
                    className="text-sm font-medium text-zinc-600 hover:text-primary"
                  >
                    Editar
                  </button>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Dato etiqueta="Potencia instalada" valor={`${obra.potencia_kwp} kWp`} />
                <Dato
                  etiqueta="Presupuesto"
                  valor={obra.presupuesto != null ? `$${obra.presupuesto}` : null}
                />
                <Dato etiqueta="Fecha de inicio" valor={obra.fecha_inicio} />
                <Dato etiqueta="Fecha de fin estimada" valor={obra.fecha_fin_estimada} />
              </dl>
            </div>

            <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-primary">Cliente</h2>
              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Dato
                  etiqueta="Nombre"
                  valor={
                    clienteDetalle?.nombre ??
                    clientes.find((c) => c.id === obra.cliente_id)?.nombre
                  }
                />
                <Dato etiqueta="Teléfono" valor={clienteDetalle?.contacto_telefono} />
                <Dato etiqueta="Email" valor={clienteDetalle?.contacto_email} />
                <Dato etiqueta="Dirección" valor={clienteDetalle?.direccion} />
                <Dato etiqueta="CUIT / DNI" valor={clienteDetalle?.cuit} />
              </dl>
            </div>
          </>
        )}

        {editando && (
          <form
            onSubmit={handleGuardarEdicion}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold text-primary">Editar obra</h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">
                  Cliente *
                </label>
                <select
                  required
                  value={form.cliente_id}
                  onChange={(e) => actualizarCampo("cliente_id", e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                >
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">
                  Dirección de la obra *
                </label>
                <input
                  required
                  type="text"
                  value={form.direccion}
                  onChange={(e) => actualizarCampo("direccion", e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Potencia instalada (kWp) *
                </label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="any"
                  value={form.potencia_kwp}
                  onChange={(e) => actualizarCampo("potencia_kwp", e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Presupuesto
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.presupuesto}
                  onChange={(e) => actualizarCampo("presupuesto", e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) => actualizarCampo("fecha_inicio", e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Fecha de fin estimada
                </label>
                <input
                  type="date"
                  value={form.fecha_fin_estimada}
                  onChange={(e) =>
                    actualizarCampo("fecha_fin_estimada", e.target.value)
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>
            </div>

            {errorEdicion && (
              <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                Error al guardar: {errorEdicion}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="submit"
                disabled={guardandoEdicion}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <ArchivosObra obraId={id} />

        <RemitosObra obraId={id} />

        <Hitos obraId={id} hitos={hitos} onCambio={cargarHitos} />

        <OrdenesTrabajo obraId={id} hitos={hitos} />
      </div>
    </div>
  );
}
