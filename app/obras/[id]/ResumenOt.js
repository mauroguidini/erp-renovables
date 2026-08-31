"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function Tile({ label, valor, colorTexto, resaltado }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        resaltado ? "border-accent bg-accent/5" : "border-zinc-200 bg-white"
      }`}
    >
      <p className={`text-xs font-medium ${resaltado ? "text-accent" : "text-zinc-500"}`}>
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${colorTexto}`}>{valor}</p>
    </div>
  );
}

export default function ResumenOt({ obraId }) {
  const [ots, setOts] = useState(null);

  useEffect(() => {
    supabase
      .from("ordenes_trabajo")
      .select("estado, fecha_limite")
      .eq("obra_id", obraId)
      .then(({ data }) => setOts(data ?? []));
  }, [obraId]);

  if (ots === null) return null;
  if (ots.length === 0) return null;

  const hoy = new Date().toISOString().slice(0, 10);
  const contar = (pred) => ots.filter(pred).length;

  const total = ots.length;
  const porIniciar = contar((o) => o.estado === "pendiente");
  const iniciadas = contar((o) => o.estado === "parcial");
  const cumplidas = contar((o) => o.estado === "cumplida");
  const noCumplidas = contar((o) => o.estado === "no_cumplida");
  const reemplazadas = contar((o) => o.estado === "reemplazada");
  const vencidas = contar(
    (o) => (o.estado === "pendiente" || o.estado === "parcial") && o.fecha_limite < hoy
  );

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <Tile label="Total OT" valor={total} colorTexto="text-primary" />
      <Tile label="Por iniciar" valor={porIniciar} colorTexto="text-zinc-600" />
      <Tile label="Iniciadas" valor={iniciadas} colorTexto="text-yellow-600" />
      <Tile label="Cumplidas" valor={cumplidas} colorTexto="text-green-600" />
      <Tile label="No cumplidas" valor={noCumplidas} colorTexto="text-accent" />
      <Tile label="Reemplazadas" valor={reemplazadas} colorTexto="text-zinc-500" />
      <Tile label="Vencidas" valor={vencidas} colorTexto="text-accent" resaltado />
    </div>
  );
}
