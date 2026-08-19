"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ESTADO_COLOR = {
  presupuestada: "bg-zinc-100 text-zinc-800",
  aprobada: "bg-blue-100 text-blue-800",
  en_curso: "bg-yellow-100 text-yellow-800",
  finalizada: "bg-green-100 text-green-800",
  cancelada: "bg-accent/10 text-accent",
};

const BUCKET = "obras-archivos";
const CANTIDAD_FOTOS = 6;

export default function EstadoObraConsulta({ obraId }) {
  const router = useRouter();
  const [obra, setObra] = useState(null);
  const [hitos, setHitos] = useState([]);
  const [ots, setOts] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function cargar() {
      setCargando(true);

      const [obraRes, hitosRes, otsRes, archivosRes] = await Promise.all([
        supabase.from("obras_visibles").select("id, direccion, estado").eq("id", obraId).single(),
        supabase
          .from("hitos")
          .select("*")
          .eq("obra_id", obraId)
          .order("fecha_objetivo", { ascending: true, nullsFirst: false }),
        supabase.from("ordenes_trabajo").select("id, estado, hito_id").eq("obra_id", obraId),
        supabase.storage.from(BUCKET).list(obraId, {
          sortBy: { column: "created_at", order: "desc" },
        }),
      ]);

      if (obraRes.error) {
        setError(obraRes.error.message);
        setCargando(false);
        return;
      }

      setError(null);
      setObra(obraRes.data);
      setHitos(hitosRes.data ?? []);
      setOts(otsRes.data ?? []);

      const imagenes = (archivosRes.data ?? [])
        .filter((a) => (a.metadata?.mimetype ?? "").startsWith("image/"))
        .slice(0, CANTIDAD_FOTOS);

      const conUrl = await Promise.all(
        imagenes.map(async (img) => {
          const { data } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(`${obraId}/${img.name}`, 300);
          return { nombre: img.name, url: data?.signedUrl };
        })
      );
      setFotos(conUrl.filter((f) => f.url));

      setCargando(false);
    }

    cargar();
  }, [obraId]);

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

  const grupos = [
    ...hitos.map((h) => ({ hito: h, ots: ots.filter((o) => o.hito_id === h.id) })),
    { hito: null, ots: ots.filter((o) => !o.hito_id) },
  ].filter((g) => g.hito || g.ots.length > 0);

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
          <h1 className="text-2xl font-semibold text-primary">{obra.direccion}</h1>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              ESTADO_COLOR[obra.estado] ?? "bg-zinc-100 text-zinc-800"
            }`}
          >
            {obra.estado.replace("_", " ")}
          </span>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">Avance por hito</h2>

          {grupos.length === 0 && (
            <p className="mt-3 text-sm text-zinc-600">
              Todavía no hay órdenes de trabajo cargadas.
            </p>
          )}

          <div className="mt-3 divide-y divide-zinc-100">
            {grupos.map((grupo) => {
              const total = grupo.ots.length;
              const cumplidas = grupo.ots.filter((o) => o.estado === "cumplida").length;
              const porcentaje = total > 0 ? Math.round((cumplidas / total) * 100) : 0;

              return (
                <div key={grupo.hito?.id ?? "sin-hito"} className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-900">
                      {grupo.hito ? grupo.hito.nombre : "Sin hito"}
                    </span>
                    <span className="text-xs font-medium text-zinc-600">
                      {cumplidas}/{total} cumplidas · {porcentaje}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-200">
                    <div
                      className="h-1.5 rounded-full bg-green-600"
                      style={{ width: `${porcentaje}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">Últimas fotos</h2>

          {fotos.length === 0 && (
            <p className="mt-3 text-sm text-zinc-600">Todavía no hay fotos cargadas.</p>
          )}

          {fotos.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {fotos.map((foto) => (
                <a
                  key={foto.nombre}
                  href={foto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-md border border-zinc-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto.url} alt="" className="h-28 w-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
