"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function Entregas() {
  const [remitos, setRemitos] = useState([]);
  const [obras, setObras] = useState({});
  const [depositos, setDepositos] = useState({});
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargarTodo() {
      const [remitosRes, obrasRes, depositosRes] = await Promise.all([
        supabase.from("remitos").select("*").order("created_at", { ascending: false }),
        supabase.from("obras_para_entrega").select("id, direccion, cliente_nombre"),
        supabase.from("depositos_origen").select("id, nombre"),
      ]);

      if (remitosRes.error) {
        setError(remitosRes.error.message);
      } else {
        setError(null);
        setRemitos(remitosRes.data ?? []);
      }

      const mapaObras = {};
      (obrasRes.data ?? []).forEach((o) => {
        mapaObras[o.id] = o.cliente_nombre ? `${o.cliente_nombre} — ${o.direccion}` : o.direccion;
      });
      setObras(mapaObras);

      const mapaDepositos = {};
      (depositosRes.data ?? []).forEach((d) => {
        mapaDepositos[d.id] = d.nombre;
      });
      setDepositos(mapaDepositos);

      setCargando(false);
    }

    cargarTodo();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">Entregas a obra</h1>
          <Link
            href="/entregas/nueva"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Nuevo remito
          </Link>
        </div>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && remitos.length === 0 && (
          <p className="mt-6 text-zinc-600">Todavía no hay remitos cargados.</p>
        )}

        {!cargando && !error && remitos.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {remitos.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/entregas/${r.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50"
                >
                  <div>
                    <span className="font-medium text-primary">
                      {obras[r.obra_id] ?? "(obra)"}
                    </span>
                    <span className="ml-2 text-sm text-zinc-500">
                      desde {depositos[r.deposito_origen_id] ?? "(depósito)"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.estado === "confirmado"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {r.estado}
                    </span>
                    {r.estado === "confirmado" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.firmada
                            ? "bg-blue-100 text-blue-800"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {r.firmada ? "firmado" : "sin firmar"}
                      </span>
                    )}
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
