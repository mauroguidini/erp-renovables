"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

const BUCKET = "obras-archivos";

export default function ZonaPeligrosaObra({ obra, onCambio }) {
  const role = useRole();
  const router = useRouter();
  const puedeArchivar = role === "administrador" || role === "jefe_obra";
  const esAdmin = role === "administrador";

  const [archivando, setArchivando] = useState(false);
  const [errorArchivar, setErrorArchivar] = useState(null);

  const [mostrarEliminar, setMostrarEliminar] = useState(false);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [confirmacionTexto, setConfirmacionTexto] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState(null);
  const [avisoArchivos, setAvisoArchivos] = useState(null);

  if (!puedeArchivar) return null;

  async function handleToggleArchivada() {
    setArchivando(true);
    setErrorArchivar(null);

    const { error } = await supabase
      .from("obras")
      .update({ archivada: !obra.archivada })
      .eq("id", obra.id);

    if (error) {
      setErrorArchivar(error.message);
    } else {
      await onCambio();
    }
    setArchivando(false);
  }

  function cerrarEliminar() {
    setMostrarEliminar(false);
    setResumen(null);
    setConfirmacionTexto("");
    setErrorEliminar(null);
    setAvisoArchivos(null);
  }

  async function handleAbrirEliminar() {
    setMostrarEliminar(true);
    setErrorEliminar(null);
    setCargandoResumen(true);

    const [otRes, remitosRes, hitosRes, archivosRes] = await Promise.all([
      supabase
        .from("ordenes_trabajo")
        .select("id", { count: "exact", head: true })
        .eq("obra_id", obra.id),
      supabase
        .from("remitos")
        .select("id", { count: "exact", head: true })
        .eq("obra_id", obra.id),
      supabase
        .from("hitos")
        .select("id", { count: "exact", head: true })
        .eq("obra_id", obra.id),
      supabase.storage.from(BUCKET).list(obra.id),
    ]);

    let movimientos = 0;
    if (obra.deposito_id) {
      const { count } = await supabase
        .from("movimientos_stock")
        .select("id", { count: "exact", head: true })
        .or(
          `deposito_origen_id.eq.${obra.deposito_id},deposito_destino_id.eq.${obra.deposito_id}`
        );
      movimientos = count ?? 0;
    }

    setResumen({
      ot: otRes.count ?? 0,
      remitos: remitosRes.count ?? 0,
      hitos: hitosRes.count ?? 0,
      movimientos,
      archivos: (archivosRes.data ?? []).length,
    });
    setCargandoResumen(false);
  }

  async function handleEliminarDefinitivo() {
    setEliminando(true);
    setErrorEliminar(null);
    setAvisoArchivos(null);

    const { error: errorRpc } = await supabase.rpc("eliminar_obra_definitivamente", {
      p_obra_id: obra.id,
    });

    if (errorRpc) {
      setErrorEliminar(errorRpc.message);
      setEliminando(false);
      return;
    }

    // La obra ya no existe en la base — de acá en más, cualquier problema
    // es solo de limpieza de archivos, no de pérdida de datos. Verificamos
    // con un listado posterior, no confiamos únicamente en lo que devuelve
    // remove().
    const { data: archivosAntes } = await supabase.storage.from(BUCKET).list(obra.id);
    if (archivosAntes && archivosAntes.length > 0) {
      const rutas = archivosAntes.map((a) => `${obra.id}/${a.name}`);
      await supabase.storage.from(BUCKET).remove(rutas);

      const { data: archivosRestantes } = await supabase.storage.from(BUCKET).list(obra.id);
      if (archivosRestantes && archivosRestantes.length > 0) {
        setAvisoArchivos(
          `La obra se eliminó de la base de datos correctamente. Pero quedaron ${archivosRestantes.length} archivo(s) SIN borrar del almacenamiento: ${archivosRestantes
            .map((a) => a.name)
            .join(", ")}. Podés borrarlos a mano, o pedirme que lo intente de nuevo.`
        );
        setEliminando(false);
        return;
      }
    }

    router.push("/obras");
  }

  const totalDatos = resumen
    ? resumen.ot + resumen.remitos + resumen.hitos + resumen.movimientos + resumen.archivos
    : 0;
  const requiereConfirmacionFuerte = resumen && totalDatos > 0;
  const puedeConfirmar =
    resumen && (!requiereConfirmacionFuerte || confirmacionTexto.trim() === obra.direccion);

  return (
    <div className="mt-6 rounded-lg border border-accent/30 bg-white p-5">
      <h2 className="text-lg font-semibold text-accent">Zona peligrosa</h2>

      <div className="mt-4 flex items-center justify-between rounded-md border border-zinc-200 p-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            {obra.archivada ? "Esta obra está archivada" : "Archivar obra"}
          </p>
          <p className="text-xs text-zinc-500">
            No se borra nada — se puede desarchivar en cualquier momento.
          </p>
        </div>
        <button
          onClick={handleToggleArchivada}
          disabled={archivando}
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {archivando ? "Guardando..." : obra.archivada ? "Desarchivar" : "Archivar"}
        </button>
      </div>
      {errorArchivar && <p className="mt-2 text-xs text-accent">{errorArchivar}</p>}

      {esAdmin && (
        <div className="mt-4 rounded-md border border-accent/30 p-3">
          <p className="text-sm font-medium text-zinc-900">Eliminar obra permanentemente</p>
          <p className="text-xs text-zinc-500">
            Solo administrador. Esta acción no se puede deshacer.
          </p>

          {!mostrarEliminar && (
            <button
              onClick={handleAbrirEliminar}
              className="mt-3 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10"
            >
              Eliminar obra...
            </button>
          )}

          {mostrarEliminar && (
            <div className="mt-3">
              {cargandoResumen && (
                <p className="text-sm text-zinc-600">Revisando qué tiene esta obra...</p>
              )}

              {resumen && (
                <div className="rounded-md bg-accent/10 p-3 text-sm text-accent">
                  <p className="font-medium">Esto se va a borrar junto con la obra:</p>
                  <ul className="mt-1 list-disc pl-5">
                    <li>{resumen.ot} orden(es) de trabajo</li>
                    <li>{resumen.remitos} remito(s)</li>
                    <li>{resumen.hitos} hito(s)</li>
                    <li>{resumen.movimientos} movimiento(s) de stock</li>
                    <li>{resumen.archivos} archivo(s) adjuntos</li>
                  </ul>

                  {requiereConfirmacionFuerte ? (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-accent">
                        Escribí la dirección exacta de la obra (&quot;{obra.direccion}&quot;) para
                        confirmar
                      </label>
                      <input
                        type="text"
                        value={confirmacionTexto}
                        onChange={(e) => setConfirmacionTexto(e.target.value)}
                        className="mt-1 w-full rounded-md border border-accent/50 bg-white px-2 py-1.5 text-sm text-zinc-900"
                      />
                    </div>
                  ) : (
                    <p className="mt-2">Esta obra no tiene datos asociados.</p>
                  )}
                </div>
              )}

              {avisoArchivos && (
                <p className="mt-3 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                  {avisoArchivos}
                </p>
              )}
              {errorEliminar && (
                <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                  {errorEliminar}
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleEliminarDefinitivo}
                  disabled={!puedeConfirmar || eliminando}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {eliminando ? "Eliminando..." : "Eliminar definitivamente"}
                </button>
                <button
                  type="button"
                  onClick={cerrarEliminar}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
