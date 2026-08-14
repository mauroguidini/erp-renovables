"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import NuevoDepositoForm from "./NuevoDepositoForm";

export default function Depositos() {
  const [depositos, setDepositos] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarDepositos = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("depositos")
      .select("*")
      .order("nombre");

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setDepositos(data);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarDepositos();
  }, [cargarDepositos]);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">Depósitos</h1>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && depositos.length === 0 && (
          <p className="mt-6 text-zinc-600">Todavía no hay depósitos cargados.</p>
        )}

        {!cargando && !error && depositos.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {depositos.map((d) => (
              <li key={d.id} className="flex justify-between px-4 py-3">
                <div>
                  <span className="font-medium text-primary">{d.nombre}</span>
                  {d.responsable && (
                    <span className="ml-2 text-sm text-zinc-500">
                      ({d.responsable})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!d.activo && (
                    <span className="text-xs text-zinc-400">inactivo</span>
                  )}
                  <span className="text-zinc-500">{d.tipo}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <NuevoDepositoForm onDepositoCreado={cargarDepositos} />
      </div>
    </div>
  );
}
