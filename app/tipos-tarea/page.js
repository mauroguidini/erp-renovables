"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";
import NuevoTipoTareaForm from "./NuevoTipoTareaForm";

export default function TiposTarea() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "jefe_obra";
  const [tipos, setTipos] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarTipos = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("tipos_tarea")
      .select("*")
      .order("nombre");

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setTipos(data);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarTipos();
  }, [cargarTipos]);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">Tipos de tarea</h1>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && tipos.length === 0 && (
          <p className="mt-6 text-zinc-600">Todavía no hay tipos de tarea cargados.</p>
        )}

        {!cargando && !error && tipos.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {tipos.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium text-primary">{t.nombre}</span>
                {!t.activo && <span className="text-xs text-zinc-400">inactivo</span>}
              </li>
            ))}
          </ul>
        )}

        {puedeGestionar && (
          <NuevoTipoTareaForm onTipoCreado={cargarTipos} />
        )}
      </div>
    </div>
  );
}
