"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";
import Seccion from "../Seccion";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function fechaLegible(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
}

function formatearCantidad(n) {
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function FilaCatalogo({ item, puedeGestionar, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [descripcion, setDescripcion] = useState(item.descripcion);
  const [categoria, setCategoria] = useState(item.categoria);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function iniciarEdicion() {
    setDescripcion(item.descripcion);
    setCategoria(item.categoria);
    setError(null);
    setEditando(true);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    if (!descripcion.trim()) return;

    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("items_material_catalogo")
      .update({ descripcion: descripcion.trim(), categoria })
      .eq("id", item.id);

    if (error) {
      setError(
        error.code === "23505"
          ? "Ya existe un ítem guardado con ese nombre — borrá uno de los dos en vez de renombrar."
          : error.message
      );
      setGuardando(false);
      return;
    }

    setGuardando(false);
    setEditando(false);
    await onCambio();
  }

  async function handleBorrar() {
    const confirmado = window.confirm(
      `¿Borrar "${item.descripcion}" de la lista? Deja de aparecer como sugerencia — los movimientos ya cargados no cambian.`
    );
    if (!confirmado) return;

    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("items_material_catalogo").delete().eq("id", item.id);
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
      <form onSubmit={handleGuardar} className="flex flex-wrap items-end gap-2 py-2">
        <input
          type="text"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
        >
          <option value="material">Material</option>
          <option value="herramienta">Herramienta</option>
        </select>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancelar
        </button>
        {error && <p className="w-full text-xs text-accent">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="text-zinc-700">
        {item.descripcion}{" "}
        <span className="text-xs text-zinc-400">
          ({item.categoria === "herramienta" ? "herramienta" : "material"})
        </span>
      </span>
      {puedeGestionar && (
        <div className="flex gap-3">
          <button
            onClick={iniciarEdicion}
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
      {error && <p className="w-full text-xs text-accent">{error}</p>}
    </div>
  );
}

export default function MovimientosMaterial() {
  const role = useRole();
  const puedeVer =
    role === "administrador" ||
    role === "compras" ||
    role === "administracion" ||
    role === "capataz" ||
    role === "jefe_obra";
  const puedeGestionar =
    role === "administrador" || role === "compras" || role === "administracion";

  const [obras, setObras] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [exportando, setExportando] = useState(false);

  const [filtroObra, setFiltroObra] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");

  const cargarCatalogo = useCallback(async () => {
    setCargandoCatalogo(true);
    const { data } = await supabase
      .from("items_material_catalogo")
      .select("*")
      .order("descripcion");
    setCatalogo(data ?? []);
    setCargandoCatalogo(false);
  }, []);

  useEffect(() => {
    supabase
      .rpc("obras_para_material")
      .then(({ data }) => setObras(data ?? []));
    cargarCatalogo();
  }, [cargarCatalogo]);

  const cargar = useCallback(async () => {
    setCargando(true);

    let query = supabase
      .from("movimientos_material_items")
      .select("*, movimientos_material!inner(obra_id, tipo, fecha, creado_por_email)")
      .order("fecha", { foreignTable: "movimientos_material", ascending: false });

    if (filtroObra) query = query.eq("movimientos_material.obra_id", filtroObra);
    if (filtroTipo) query = query.eq("movimientos_material.tipo", filtroTipo);
    if (filtroCategoria) query = query.eq("categoria", filtroCategoria);
    if (filtroDesde) query = query.gte("movimientos_material.fecha", filtroDesde);
    if (filtroHasta) query = query.lte("movimientos_material.fecha", filtroHasta);

    const { data, error } = await query;

    if (error) setError(error.message);
    else setError(null);
    setFilas(data ?? []);
    setCargando(false);
  }, [filtroObra, filtroTipo, filtroCategoria, filtroDesde, filtroHasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function nombreObra(obraId) {
    return obras.find((o) => o.id === obraId)?.direccion ?? "—";
  }

  async function handleExportar() {
    if (filas.length === 0) return;
    setExportando(true);

    const XLSX = await import("xlsx");

    const datos = filas.map((f) => ({
      Obra: nombreObra(f.movimientos_material.obra_id),
      Fecha: new Date(`${f.movimientos_material.fecha}T00:00:00`),
      Tipo: f.movimientos_material.tipo === "ingreso" ? "Ingreso" : "Salida",
      Descripción: f.descripcion,
      Cantidad: Number(f.cantidad),
      Categoría: f.categoria === "herramienta" ? "Herramienta" : "Material",
      "Cargado por": f.movimientos_material.creado_por_email ?? "",
    }));

    const hoja = XLSX.utils.json_to_sheet(datos, { cellDates: true });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Movimientos");
    XLSX.writeFile(libro, `movimientos_material_${hoyISO()}.xlsx`);

    setExportando(false);
  }

  if (!puedeVer) {
    return (
      <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">No tenés acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-primary">Materiales y herramientas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Para cargar un ingreso o salida, entrá a la obra correspondiente.
        </p>

        <Seccion titulo={`Obras (${obras.length})`} defaultAbierto>
          {obras.length === 0 && (
            <p className="text-sm text-zinc-500">No hay obras para mostrar.</p>
          )}
          {obras.length > 0 && (
            <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
              {obras.map((o) => (
                <li key={o.id}>
                  <Link
                    href={
                      role === "compras" ? `/obras/${o.id}/movimientos-material` : `/obras/${o.id}`
                    }
                    className="block px-3 py-2 text-sm text-primary hover:bg-zinc-50 hover:underline"
                  >
                    {o.direccion}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Historial de movimientos" defaultAbierto>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              value={filtroObra}
              onChange={(e) => setFiltroObra(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Todas las obras</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.direccion}
                </option>
              ))}
            </select>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Ingresos y salidas</option>
              <option value="ingreso">Solo ingresos</option>
              <option value="salida">Solo salidas</option>
            </select>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="">Material y herramienta</option>
              <option value="material">Solo material</option>
              <option value="herramienta">Solo herramienta</option>
            </select>
            <input
              type="date"
              value={filtroDesde}
              onChange={(e) => setFiltroDesde(e.target.value)}
              placeholder="Desde"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
            <input
              type="date"
              value={filtroHasta}
              onChange={(e) => setFiltroHasta(e.target.value)}
              placeholder="Hasta"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleExportar}
              disabled={exportando || filas.length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {exportando ? "Exportando..." : `Exportar a Excel (${filas.length})`}
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
          )}

          {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

          {!cargando && filas.length === 0 && (
            <p className="mt-4 text-sm text-zinc-600">No hay movimientos para este filtro.</p>
          )}

          {!cargando && filas.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-zinc-500">
                    <th className="px-3 py-2 font-medium">Obra</th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Descripción</th>
                    <th className="px-3 py-2 font-medium">Cantidad</th>
                    <th className="px-3 py-2 font-medium">Categoría</th>
                    <th className="px-3 py-2 font-medium">Cargado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filas.map((f) => (
                    <tr key={f.id}>
                      <td className="px-3 py-2 text-primary">
                        <Link
                          href={
                            role === "compras"
                              ? `/obras/${f.movimientos_material.obra_id}/movimientos-material`
                              : `/obras/${f.movimientos_material.obra_id}`
                          }
                          className="hover:underline"
                        >
                          {nombreObra(f.movimientos_material.obra_id)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {fechaLegible(f.movimientos_material.fecha)}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {f.movimientos_material.tipo === "ingreso" ? "Ingreso" : "Salida"}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">{f.descripcion}</td>
                      <td className="px-3 py-2 text-zinc-700">{formatearCantidad(f.cantidad)}</td>
                      <td className="px-3 py-2 text-zinc-700">
                        {f.categoria === "herramienta" ? "Herramienta" : "Material"}
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {f.movimientos_material.creado_por_email ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </Seccion>

        <Seccion titulo={`Catálogo de ítems (${catalogo.length})`}>
          <p className="text-sm text-zinc-500">
            Se arma solo con el uso, al cargar movimientos. Acá podés renombrar o borrar una
            entrada — no cambia los movimientos ya cargados, solo las sugerencias de ahora en
            adelante.
          </p>

          {cargandoCatalogo && <p className="mt-3 text-sm text-zinc-600">Cargando...</p>}

          {!cargandoCatalogo && catalogo.length === 0 && (
            <p className="mt-3 text-sm text-zinc-600">
              Todavía no hay ítems guardados — se van a ir agregando solos.
            </p>
          )}

          {!cargandoCatalogo && catalogo.length > 0 && (
            <div className="mt-2 divide-y divide-zinc-100">
              {catalogo.map((item) => (
                <FilaCatalogo
                  key={item.id}
                  item={item}
                  puedeGestionar={puedeGestionar}
                  onCambio={cargarCatalogo}
                />
              ))}
            </div>
          )}
        </Seccion>
      </div>
    </div>
  );
}
