"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";

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

export default function Obras() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "jefe_obra";
  const searchParams = useSearchParams();
  const [obras, setObras] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState(
    searchParams.get("estado") ?? ""
  );
  const [filtroTipo, setFiltroTipo] = useState("");

  const [nombresClientes, setNombresClientes] = useState({});
  const [tiposObra, setTiposObra] = useState([]);

  useEffect(() => {
    async function cargarObras() {
      const { data, error } = await supabase
        .from("obras")
        .select("id, direccion, potencia_kwp, fecha_inicio, estado, cliente_id, tipo_obra_id")
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setError(null);
        setObras(data);
      }
      setCargando(false);
    }

    async function cargarNombresClientes() {
      const { data } = await supabase.from("clientes_nombre").select("id, nombre");
      const mapa = {};
      (data ?? []).forEach((c) => {
        mapa[c.id] = c.nombre;
      });
      setNombresClientes(mapa);
    }

    async function cargarTiposObra() {
      const { data } = await supabase
        .from("tipos_obra")
        .select("id, codigo, nombre")
        .order("nombre");
      setTiposObra(data ?? []);
    }

    cargarObras();
    cargarNombresClientes();
    cargarTiposObra();
  }, []);

  const obrasFiltradas = obras
    .filter((o) => !filtroEstado || o.estado === filtroEstado)
    .filter((o) => !filtroTipo || o.tipo_obra_id === filtroTipo);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">Obras</h1>
          {puedeGestionar && (
            <Link
              href="/obras/nueva"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              Nueva obra
            </Link>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e.replace("_", " ")}
              </option>
            ))}
          </select>

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">Todos los tipos</option>
            {tiposObra.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && obrasFiltradas.length === 0 && (
          <p className="mt-6 text-zinc-600">
            No hay obras que coincidan con el filtro.
          </p>
        )}

        {!cargando && !error && obrasFiltradas.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {obrasFiltradas.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/obras/${o.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
                >
                  <div>
                    <span className="font-medium text-primary">
                      {nombresClientes[o.cliente_id] ?? "(sin cliente)"}
                    </span>
                    <span className="ml-2 text-sm text-zinc-500">
                      {o.direccion}
                      {o.potencia_kwp != null ? ` · ${o.potencia_kwp} kWp` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {tiposObra.find((t) => t.id === o.tipo_obra_id)?.nombre ?? "—"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        ESTADO_COLOR[o.estado] ?? "bg-zinc-100 text-zinc-800"
                      }`}
                    >
                      {o.estado.replace("_", " ")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
