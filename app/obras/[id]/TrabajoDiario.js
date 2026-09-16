"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

const BUCKET = "obras-archivos";
const PAGINA = 20;

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function fechaLegible(iso) {
  // iso viene como "2026-09-15"; se arma la fecha a mano para que no la
  // corra un día el huso horario.
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function nombreArchivo(obraNombre, sufijo) {
  // Simplifica el nombre de la obra a algo apto para nombre de archivo:
  // saca tildes/ñ vía normalize + reemplaza cualquier otro caracter raro.
  const base = (obraNombre ?? "obra")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `${sufijo}_${base}_${hoyISO()}.xlsx`;
}

// La pantalla pagina de a 20 para no traer de más en la vista normal — pero
// el Excel tiene que llevar la bitácora completa, así que esto vuelve a
// pedirle a la base TODAS las entradas de la obra en el momento de
// descargar, sin el límite de la pantalla.
async function descargarExcel({ obraId, obraNombre }) {
  const { data, error } = await supabase
    .from("trabajo_diario")
    .select("*, trabajo_diario_fotos(id)")
    .eq("obra_id", obraId)
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    window.alert(`No se pudo generar el Excel: ${error.message}`);
    return;
  }

  const XLSX = await import("xlsx");

  const filas = (data ?? []).map((e) => ({
    Fecha: new Date(`${e.fecha}T00:00:00`),
    Descripción: e.descripcion,
    Fotos: (e.trabajo_diario_fotos ?? []).length,
    "Cargado por": e.creado_por_email ?? "",
    "Cargado el": new Date(e.created_at),
  }));

  const hoja = XLSX.utils.json_to_sheet(filas, { cellDates: true });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Trabajo diario");

  XLSX.writeFile(libro, nombreArchivo(obraNombre, "trabajo_diario"));
}

function Fotos({ fotos, urls }) {
  if (!fotos || fotos.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {fotos.map((foto) => {
        const url = urls[foto.ruta];
        if (!url) return null;
        return (
          <a key={foto.id} href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt="Foto del trabajo del día"
              className="h-20 w-20 rounded-md border border-zinc-200 object-cover"
            />
          </a>
        );
      })}
    </div>
  );
}

function Entrada({ entrada, urls, puedeEditar, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [descripcion, setDescripcion] = useState(entrada.descripcion);
  const [fecha, setFecha] = useState(entrada.fecha);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function handleGuardar(e) {
    e.preventDefault();
    if (!descripcion.trim()) return;

    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("trabajo_diario")
      .update({ descripcion: descripcion.trim(), fecha })
      .eq("id", entrada.id);

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    setGuardando(false);
    setEditando(false);
    await onCambio();
  }

  async function handleBorrar() {
    const confirmado = window.confirm(
      "¿Borrar esta entrada de la bitácora? También se borran sus fotos. No se puede deshacer."
    );
    if (!confirmado) return;

    setGuardando(true);
    setError(null);

    const rutas = (entrada.trabajo_diario_fotos ?? []).map((f) => f.ruta);
    if (rutas.length > 0) {
      await supabase.storage.from(BUCKET).remove(rutas);
    }

    // Borrar la entrada arrastra sus filas de fotos (on delete cascade).
    const { error } = await supabase
      .from("trabajo_diario")
      .delete()
      .eq("id", entrada.id);

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    setGuardando(false);
    await onCambio();
  }

  if (editando) {
    return (
      <form onSubmit={handleGuardar} className="py-3">
        <input
          required
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
        <textarea
          required
          rows={3}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
        />

        {error && (
          <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}

        <div className="mt-2 flex gap-2">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDescripcion(entrada.descripcion);
              setFecha(entrada.fecha);
              setEditando(false);
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium capitalize text-zinc-900">
          {fechaLegible(entrada.fecha)}
        </p>
        {puedeEditar && (
          <div className="flex gap-3">
            <button
              onClick={() => setEditando(true)}
              className="text-xs font-medium text-zinc-500 hover:text-primary hover:underline"
            >
              Editar
            </button>
            <button
              onClick={handleBorrar}
              disabled={guardando}
              className="text-xs text-accent hover:underline disabled:opacity-50"
            >
              Borrar
            </button>
          </div>
        )}
      </div>

      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
        {entrada.descripcion}
      </p>

      <Fotos fotos={entrada.trabajo_diario_fotos} urls={urls} />

      <p className="mt-1.5 text-xs text-zinc-400">
        Cargado por {entrada.creado_por_email ?? "desconocido"} el{" "}
        {new Date(entrada.created_at).toLocaleString()}
      </p>

      {error && (
        <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

export default function TrabajoDiario({ obraId, obraNombre }) {
  const role = useRole();
  const esAdmin = role === "administrador";
  const puedeRegistrar =
    role === "administrador" || role === "capataz" || role === "jefe_obra";

  const inputFotosRef = useRef(null);

  const [entradas, setEntradas] = useState([]);
  const [urls, setUrls] = useState({});
  const [limite, setLimite] = useState(PAGINA);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [usuarioId, setUsuarioId] = useState(null);

  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState("");
  const [fotos, setFotos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioId(data?.user?.id ?? null));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);

    // Se pide una entrada de más que el límite para saber si hay más para
    // mostrar, sin tener que hacer una segunda consulta de conteo.
    const { data, error } = await supabase
      .from("trabajo_diario")
      .select("*, trabajo_diario_fotos(id, ruta)")
      .eq("obra_id", obraId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite + 1);

    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }

    setError(null);
    setHayMas(data.length > limite);

    const visibles = data.slice(0, limite);
    setEntradas(visibles);

    const rutas = visibles.flatMap((e) =>
      (e.trabajo_diario_fotos ?? []).map((f) => f.ruta)
    );

    if (rutas.length === 0) {
      setUrls({});
    } else {
      // Una sola llamada a Storage para todas las fotos de la página.
      const { data: firmadas } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(rutas, 3600);

      const mapa = {};
      for (const f of firmadas ?? []) {
        if (f.signedUrl) mapa[f.path] = f.signedUrl;
      }
      setUrls(mapa);
    }

    setCargando(false);
  }, [obraId, limite]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleAgregar(e) {
    e.preventDefault();
    if (!descripcion.trim()) return;

    setGuardando(true);
    setErrorGuardado(null);

    // El id lo genera el celular, no la base: cuando exista la carga sin
    // señal, reintentar el envío de una entrada ya guardada no la duplica.
    const entradaId = crypto.randomUUID();

    const { error: errEntrada } = await supabase.from("trabajo_diario").insert({
      id: entradaId,
      obra_id: obraId,
      fecha,
      descripcion: descripcion.trim(),
    });

    if (errEntrada) {
      setErrorGuardado(errEntrada.message);
      setGuardando(false);
      return;
    }

    const fallidas = [];
    for (const file of fotos) {
      const ruta = `${obraId}/trabajo-diario/${entradaId}/${crypto.randomUUID()}-${file.name}`;
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, file);

      if (errSubida) {
        fallidas.push(file.name);
        continue;
      }

      const { error: errFila } = await supabase
        .from("trabajo_diario_fotos")
        .insert({ entrada_id: entradaId, ruta });

      if (errFila) {
        // La fila no quedó: se saca el archivo para no dejarlo huérfano.
        await supabase.storage.from(BUCKET).remove([ruta]);
        fallidas.push(file.name);
      }
    }

    if (fallidas.length > 0) {
      setErrorGuardado(
        `La entrada se guardó, pero no se pudieron subir estas fotos: ${fallidas.join(", ")}.`
      );
    }

    setDescripcion("");
    setFecha(hoyISO());
    setFotos([]);
    if (inputFotosRef.current) inputFotosRef.current.value = "";
    setGuardando(false);
    await cargar();
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-primary">Trabajo diario</h2>
        {!cargando && !error && entradas.length > 0 && (
          <button
            onClick={() => descargarExcel({ obraId, obraNombre })}
            className="text-sm font-medium text-primary hover:underline"
          >
            Descargar Excel
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Bitácora de lo que se hizo en la obra, día por día.
      </p>

      {puedeRegistrar && (
        <form
          onSubmit={handleAgregar}
          className="mt-4 rounded-md border border-zinc-200 p-3"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-700">
              Día del trabajo
            </label>
            <input
              required
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-zinc-700">
              ¿Qué se hizo?
            </label>
            <textarea
              required
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Se montaron 12 paneles en el sector norte y se tendió la canalización hasta el inversor."
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            />
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-zinc-700">
              Fotos (opcional)
            </label>
            <input
              ref={inputFotosRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/heic"
              onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
              className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
            />
            {fotos.length > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                {fotos.length} {fotos.length === 1 ? "foto elegida" : "fotos elegidas"}
              </p>
            )}
          </div>

          {errorGuardado && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              {errorGuardado}
            </p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Agregar entrada"}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && !error && entradas.length === 0 && (
        <p className="mt-4 text-sm text-zinc-600">
          Todavía no hay entradas cargadas para esta obra.
        </p>
      )}

      {!cargando && entradas.length > 0 && (
        <div className="mt-4 divide-y divide-zinc-100">
          {entradas.map((entrada) => (
            <Entrada
              key={entrada.id}
              entrada={entrada}
              urls={urls}
              puedeEditar={
                esAdmin || (puedeRegistrar && entrada.creado_por === usuarioId)
              }
              onCambio={cargar}
            />
          ))}
        </div>
      )}

      {hayMas && (
        <button
          onClick={() => setLimite((l) => l + PAGINA)}
          className="mt-3 text-sm font-medium text-primary hover:underline"
        >
          Ver entradas más viejas
        </button>
      )}
    </div>
  );
}
