"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

const BUCKET = "obras-archivos";
const PREFIJO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

function nombreLegible(nombreArchivo) {
  return nombreArchivo.replace(PREFIJO_UUID, "");
}

function formatearTamano(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArchivosObra({ obraId }) {
  const role = useRole();
  const puedeGestionar =
    role === "administrador" || role === "jefe_obra" || role === "capataz";

  const inputRef = useRef(null);

  const [archivos, setArchivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState(null);

  const cargarArchivos = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.storage.from(BUCKET).list(obraId, {
      sortBy: { column: "created_at", order: "desc" },
    });

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setArchivos(data ?? []);
    }
    setCargando(false);
  }, [obraId]);

  useEffect(() => {
    cargarArchivos();
  }, [cargarArchivos]);

  async function handleSubir(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendo(true);
    setErrorSubida(null);

    const ruta = `${obraId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(ruta, file);

    if (error) {
      setErrorSubida(error.message);
    } else {
      await cargarArchivos();
    }
    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleVer(archivo) {
    const ruta = `${obraId}/${archivo.name}`;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(ruta, 60);

    if (error) {
      setError(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleBorrar(archivo) {
    const ruta = `${obraId}/${archivo.name}`;
    const { error } = await supabase.storage.from(BUCKET).remove([ruta]);
    if (error) {
      setError(error.message);
    } else {
      await cargarArchivos();
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-primary">Archivos</h2>
        {puedeGestionar && (
          <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
            {subiendo ? "Subiendo..." : "+ Subir archivo"}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp,image/heic"
              onChange={handleSubir}
              disabled={subiendo}
              className="hidden"
            />
          </label>
        )}
      </div>

      {errorSubida && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          Error al subir: {errorSubida}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && !error && archivos.length === 0 && (
        <p className="mt-4 text-sm text-zinc-600">
          Todavía no hay archivos cargados para esta obra.
        </p>
      )}

      {!cargando && archivos.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-200">
          {archivos.map((archivo) => (
            <li key={archivo.id ?? archivo.name} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {nombreLegible(archivo.name)}
                </p>
                <p className="text-xs text-zinc-500">
                  {formatearTamano(archivo.metadata?.size)} ·{" "}
                  {new Date(archivo.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleVer(archivo)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Ver
                </button>
                {puedeGestionar && (
                  <button
                    onClick={() => handleBorrar(archivo)}
                    className="text-sm text-accent hover:underline"
                  >
                    Borrar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
