"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import NuevoProveedorForm from "./NuevoProveedorForm";

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarProveedores = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("proveedores")
      .select("*")
      .order("nombre");

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setProveedores(data);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarProveedores();
  }, [cargarProveedores]);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-zinc-900">Proveedores</h1>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && proveedores.length === 0 && (
          <p className="mt-6 text-zinc-600">Todavía no hay proveedores cargados.</p>
        )}

        {!cargando && !error && proveedores.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {proveedores.map((p) => (
              <li key={p.id} className="flex flex-col px-4 py-3">
                <span className="font-medium text-zinc-900">{p.nombre}</span>
                <span className="text-sm text-zinc-500">
                  {[p.contacto_telefono, p.contacto_email, p.cuit]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}

        <NuevoProveedorForm onProveedorCreado={cargarProveedores} />
      </div>
    </div>
  );
}
