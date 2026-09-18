"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";

const BUCKET = "obras-archivos";

const FORMAS_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "cuenta_corriente", label: "Cuenta corriente" },
];

const ETIQUETA_FORMA_PAGO = Object.fromEntries(
  FORMAS_PAGO.map((f) => [f.value, f.label])
);

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatearMonto(monto) {
  return Number(monto).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function fechaLegible(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
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

async function descargarExcel({ gastos, categorias, obraNombre }) {
  const XLSX = await import("xlsx");

  const filas = gastos.map((g) => ({
    Fecha: new Date(`${g.fecha}T00:00:00`),
    Proveedor: g.proveedor,
    Categoría: categorias.find((c) => c.id === g.categoria_id)?.nombre ?? "",
    "Forma de pago": ETIQUETA_FORMA_PAGO[g.forma_pago] ?? g.forma_pago,
    "Monto (ARS)": Number(g.monto),
    "Tiene factura": g.foto_ruta ? "Sí" : "No",
    "Cargado por": g.creado_por_email ?? "",
    "Cargado el": new Date(g.created_at),
  }));

  const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
  filas.push({});
  filas.push({ "Forma de pago": "TOTAL GENERAL", "Monto (ARS)": total });

  const hojaDetalle = XLSX.utils.json_to_sheet(filas, { cellDates: true });

  const porCategoria = categorias
    .map((c) => {
      const deLaCategoria = gastos.filter((g) => g.categoria_id === c.id);
      return {
        Categoría: c.nombre,
        Cantidad: deLaCategoria.length,
        "Monto (ARS)": deLaCategoria.reduce((acc, g) => acc + Number(g.monto), 0),
      };
    })
    .filter((fila) => fila.Cantidad > 0);
  porCategoria.push({ Categoría: "TOTAL GENERAL", Cantidad: gastos.length, "Monto (ARS)": total });

  const hojaResumen = XLSX.utils.json_to_sheet(porCategoria);

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen por categoría");
  XLSX.utils.book_append_sheet(libro, hojaDetalle, "Detalle");

  XLSX.writeFile(libro, nombreArchivo(obraNombre, "rendiciones"));
}

function Gasto({ gasto, categorias, url, puedeEditar, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function iniciarEdicion() {
    setForm({
      monto: String(gasto.monto),
      proveedor: gasto.proveedor,
      fecha: gasto.fecha,
      categoria_id: gasto.categoria_id,
      forma_pago: gasto.forma_pago,
    });
    setError(null);
    setEditando(true);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    const montoNum = Number(form.monto);
    if (!montoNum || montoNum <= 0 || !form.proveedor.trim()) return;

    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("gastos")
      .update({
        monto: montoNum,
        proveedor: form.proveedor.trim(),
        fecha: form.fecha,
        categoria_id: form.categoria_id,
        forma_pago: form.forma_pago,
      })
      .eq("id", gasto.id);

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
      "¿Borrar este gasto? También se borra la foto de factura si tiene. No se puede deshacer."
    );
    if (!confirmado) return;

    setGuardando(true);
    setError(null);

    if (gasto.foto_ruta) {
      await supabase.storage.from(BUCKET).remove([gasto.foto_ruta]);
    }

    const { error } = await supabase.from("gastos").delete().eq("id", gasto.id);

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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            required
            type="number"
            min="0.01"
            step="any"
            value={form.monto}
            onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
          <input
            required
            type="text"
            value={form.proveedor}
            onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))}
            placeholder="Proveedor"
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
          <input
            required
            type="date"
            value={form.fecha}
            onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
          <select
            required
            value={form.categoria_id}
            onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select
            required
            value={form.forma_pago}
            onChange={(e) => setForm((f) => ({ ...f, forma_pago: e.target.value }))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 sm:col-span-2"
          >
            {FORMAS_PAGO.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

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
            onClick={() => setEditando(false)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  const nombreCategoria = categorias.find((c) => c.id === gasto.categoria_id)?.nombre;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="flex items-start gap-3">
        {gasto.foto_ruta && url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt="Foto de la factura"
              className="h-16 w-16 rounded-md border border-zinc-200 object-cover"
            />
          </a>
        )}
        <div>
          <p className="text-sm font-medium text-zinc-900">
            {formatearMonto(gasto.monto)} · {gasto.proveedor}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {fechaLegible(gasto.fecha)} · {nombreCategoria ?? "—"} ·{" "}
            {ETIQUETA_FORMA_PAGO[gasto.forma_pago] ?? gasto.forma_pago}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Cargado por {gasto.creado_por_email ?? "desconocido"} el{" "}
            {new Date(gasto.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      {puedeEditar && (
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

      {error && (
        <p className="w-full rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

export default function GastosObra({ obraId, obraNombre }) {
  const role = useRole();
  const esAdmin = role === "administrador";
  const puedeRegistrar =
    role === "administrador" || role === "capataz" || role === "jefe_obra";

  const inputFotoRef = useRef(null);

  const [categorias, setCategorias] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [urls, setUrls] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [usuarioId, setUsuarioId] = useState(null);

  const [monto, setMonto] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [categoriaId, setCategoriaId] = useState("");
  const [formaPago, setFormaPago] = useState("efectivo");
  const [foto, setFoto] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUsuarioId(data?.user?.id ?? null));
    supabase
      .from("categorias_gasto")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => {
        setCategorias(data ?? []);
        setCategoriaId((actual) => actual || data?.[0]?.id || "");
      });
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);

    const { data, error } = await supabase
      .from("gastos")
      .select("*")
      .eq("obra_id", obraId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setCargando(false);
      return;
    }

    setError(null);
    setGastos(data ?? []);

    const rutas = (data ?? []).map((g) => g.foto_ruta).filter(Boolean);

    if (rutas.length === 0) {
      setUrls({});
    } else {
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
  }, [obraId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleAgregar(e) {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0 || !proveedor.trim() || !categoriaId) return;

    setGuardando(true);
    setErrorGuardado(null);

    const gastoId = crypto.randomUUID();
    let fotoRuta = null;

    if (foto) {
      fotoRuta = `${obraId}/gastos/${gastoId}/${crypto.randomUUID()}-${foto.name}`;
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(fotoRuta, foto);

      if (errSubida) {
        setErrorGuardado(`No se pudo subir la foto de la factura: ${errSubida.message}`);
        setGuardando(false);
        return;
      }
    }

    const { error } = await supabase.from("gastos").insert({
      id: gastoId,
      obra_id: obraId,
      monto: montoNum,
      proveedor: proveedor.trim(),
      fecha,
      categoria_id: categoriaId,
      forma_pago: formaPago,
      foto_ruta: fotoRuta,
    });

    if (error) {
      if (fotoRuta) await supabase.storage.from(BUCKET).remove([fotoRuta]);
      setErrorGuardado(error.message);
      setGuardando(false);
      return;
    }

    setMonto("");
    setProveedor("");
    setFecha(hoyISO());
    setFormaPago("efectivo");
    setFoto(null);
    if (inputFotoRef.current) inputFotoRef.current.value = "";
    setGuardando(false);
    await cargar();
  }

  const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          Registro de gastos de la obra. Todavía sin circuito de aprobación.
        </p>
        <div className="flex items-center gap-3">
          {!cargando && !error && (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
              Total: {formatearMonto(total)}
            </span>
          )}
          {!cargando && !error && gastos.length > 0 && (
            <button
              onClick={() => descargarExcel({ gastos, categorias, obraNombre })}
              className="text-sm font-medium text-primary hover:underline"
            >
              Descargar Excel
            </button>
          )}
        </div>
      </div>

      {puedeRegistrar && (
        <form
          onSubmit={handleAgregar}
          className="mt-4 rounded-md border border-zinc-200 p-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-700">Monto *</label>
              <input
                required
                type="number"
                min="0.01"
                step="any"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Proveedor *</label>
              <input
                required
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              />
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
            <div>
              <label className="block text-xs font-medium text-zinc-700">Categoría *</label>
              <select
                required
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700">
                Forma de pago *
              </label>
              <select
                required
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                {FORMAS_PAGO.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700">
                Foto de la factura (opcional)
              </label>
              <input
                ref={inputFotoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic"
                capture="environment"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
              />
            </div>
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
            {guardando ? "Guardando..." : "Agregar gasto"}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && !error && gastos.length === 0 && (
        <p className="mt-4 text-sm text-zinc-600">
          Todavía no hay gastos cargados para esta obra.
        </p>
      )}

      {!cargando && gastos.length > 0 && (
        <div className="mt-4 divide-y divide-zinc-100">
          {gastos.map((gasto) => (
            <Gasto
              key={gasto.id}
              gasto={gasto}
              categorias={categorias}
              url={gasto.foto_ruta ? urls[gasto.foto_ruta] : null}
              puedeEditar={esAdmin || (puedeRegistrar && gasto.creado_por === usuarioId)}
              onCambio={cargar}
            />
          ))}
        </div>
      )}
    </>
  );
}
