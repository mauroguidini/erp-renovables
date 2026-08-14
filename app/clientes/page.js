"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import NuevoClienteForm from "./NuevoClienteForm";

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarClientes = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("nombre");

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setClientes(data);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">Clientes</h1>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && clientes.length === 0 && (
          <p className="mt-6 text-zinc-600">Todavía no hay clientes cargados.</p>
        )}

        {!cargando && !error && clientes.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {clientes.map((c) => (
              <li key={c.id} className="flex flex-col px-4 py-3">
                <span className="font-medium text-primary">{c.nombre}</span>
                <span className="text-sm text-zinc-500">
                  {[c.contacto_telefono, c.contacto_email, c.cuit]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}

        <NuevoClienteForm onClienteCreado={cargarClientes} />
      </div>
    </div>
  );
}
