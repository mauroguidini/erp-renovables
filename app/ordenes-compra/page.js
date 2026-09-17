"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";

function fechaLegible(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
}

export default function OrdenesCompra() {
  const role = useRole();
  const router = useRouter();
  const puedeGestionar = role === "administrador" || role === "administracion";

  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("ordenes_compra")
      .select("*, proveedores(nombre)")
      .order("numero", { ascending: false });
    if (error) setError(error.message);
    else setError(null);
    setOrdenes(data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
    supabase
      .from("proveedores_nombre")
      .select("id, nombre")
      .order("nombre")
      .then(({ data }) => setProveedores(data ?? []));
  }, [cargar]);

  async function handleCrear(e) {
    e.preventDefault();
    if (!proveedorId) return;

    setCreando(true);
    setErrorCrear(null);

    const { data, error } = await supabase
      .from("ordenes_compra")
      .insert({ proveedor_id: proveedorId, fecha })
      .select("id")
      .single();

    if (error) {
      setErrorCrear(error.message);
      setCreando(false);
      return;
    }

    router.push(`/ordenes-compra/${data.id}`);
  }

  if (!puedeGestionar) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">No tenés acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">Órdenes de compra</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Documento para mandarle al proveedor: qué se pide, cantidades y precios.
        </p>

        <form
          onSubmit={handleCrear}
          className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
        >
          <h2 className="text-lg font-semibold text-primary">Nueva orden de compra</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-700">Proveedor *</label>
              <select
                required
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">Elegí un proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Fecha *</label>
              <input
                required
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              />
            </div>
          </div>

          {errorCrear && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              {errorCrear}
            </p>
          )}

          <button
            type="submit"
            disabled={creando}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {creando ? "Creando..." : "Crear y agregar ítems"}
          </button>
        </form>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-primary">Todas las órdenes</h2>

          {error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
          )}

          {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

          {!cargando && ordenes.length === 0 && (
            <p className="mt-4 text-sm text-zinc-600">Todavía no hay órdenes de compra.</p>
          )}

          {!cargando && ordenes.length > 0 && (
            <ul className="mt-2 divide-y divide-zinc-100">
              {ordenes.map((o) => (
                <li key={o.id} className="py-3">
                  <Link
                    href={`/ordenes-compra/${o.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    OC #{o.numero} — {o.proveedores?.nombre ?? "—"}
                  </Link>
                  <p className="mt-0.5 text-xs text-zinc-500">{fechaLegible(o.fecha)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
