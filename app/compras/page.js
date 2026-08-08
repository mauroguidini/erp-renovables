"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function Compras() {
  const [compras, setCompras] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargarCompras() {
      const { data, error } = await supabase
        .from("compras")
        .select("id, fecha, estado, proveedores(nombre), depositos(nombre)")
        .order("fecha", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setError(null);
        setCompras(data);
      }
      setCargando(false);
    }

    cargarCompras();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900">Compras</h1>
          <Link
            href="/compras/nueva"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Nueva compra
          </Link>
        </div>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && compras.length === 0 && (
          <p className="mt-6 text-zinc-600">Todavía no hay compras cargadas.</p>
        )}

        {!cargando && !error && compras.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {compras.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/compras/${c.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
                >
                  <div>
                    <span className="font-medium text-zinc-900">
                      {c.proveedores?.nombre ?? "(sin proveedor)"}
                    </span>
                    <span className="ml-2 text-sm text-zinc-500">
                      → {c.depositos?.nombre ?? "(sin depósito)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-500">{c.fecha}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.estado === "confirmada"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {c.estado}
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
