"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";
import SignaturePad from "../../SignaturePad";

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

const ITEM_INICIAL = { descripcion: "", categoria: "material", cantidad: "1" };

function FormularioMovimiento({ obraId, onCancelar, onGuardado }) {
  const [tipo, setTipo] = useState("ingreso");
  const [fecha, setFecha] = useState(hoyISO());
  const [items, setItems] = useState([{ ...ITEM_INICIAL }]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const firmaRef = useRef(null);

  // Catálogo de ítems ya usados, para sugerir en el <datalist> de abajo.
  // Best-effort a propósito: si esto no carga (falla la consulta, o
  // todavía no existe la tabla), "catalogo" se queda vacío y el campo de
  // descripción sigue siendo un input de texto normal, sin sugerencias —
  // nunca bloquea la carga a mano.
  const [catalogo, setCatalogo] = useState([]);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("items_material_catalogo")
      .select("descripcion, descripcion_normalizada, categoria")
      .order("descripcion")
      .then(({ data, error }) => {
        if (cancelado || error) return;
        setCatalogo(data ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const catalogoPorNombre = useMemo(() => {
    const mapa = new Map();
    for (const c of catalogo) mapa.set(c.descripcion_normalizada, c);
    return mapa;
  }, [catalogo]);

  function actualizarItem(index, campo, valor) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [campo]: valor } : it)));
  }

  // Al tipear/elegir una descripción, si coincide (sin mayúsculas ni
  // espacios de más) con algo del catálogo, se autocompleta su categoría.
  function actualizarDescripcion(index, valor) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const conocido = catalogoPorNombre.get(valor.trim().toLowerCase());
        return conocido
          ? { ...it, descripcion: valor, categoria: conocido.categoria }
          : { ...it, descripcion: valor };
      })
    );
  }

  function agregarItem() {
    setItems((prev) => [...prev, { ...ITEM_INICIAL }]);
  }

  function quitarItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const itemsLimpios = items
      .map((it) => ({
        descripcion: it.descripcion.trim(),
        categoria: it.categoria,
        cantidad: Number(it.cantidad),
      }))
      .filter((it) => it.descripcion && it.cantidad > 0);

    if (itemsLimpios.length === 0) {
      setError("Agregá al menos un ítem con descripción y cantidad.");
      return;
    }
    if (firmaRef.current?.estaVacio()) {
      setError("Falta la firma de constancia.");
      return;
    }

    setGuardando(true);
    const { error } = await supabase.rpc("crear_movimiento_material", {
      p_obra_id: obraId,
      p_tipo: tipo,
      p_fecha: fecha,
      p_items: itemsLimpios,
      p_firma_imagen: firmaRef.current.exportar(),
    });

    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }

    // El movimiento ya se guardó bien — esto es aparte y best-effort: si
    // falla, no importa, el ítem simplemente no queda sugerido para la
    // próxima vez, pero el movimiento de hoy ya está guardado.
    try {
      const itemsUnicos = Array.from(
        new Map(itemsLimpios.map((it) => [it.descripcion.toLowerCase(), it])).values()
      );
      await supabase.from("items_material_catalogo").upsert(
        itemsUnicos.map((it) => ({ descripcion: it.descripcion, categoria: it.categoria })),
        { onConflict: "descripcion_normalizada", ignoreDuplicates: true }
      );
    } catch {
      // silencioso a propósito — ver comentario arriba.
    }

    setGuardando(false);
    await onGuardado();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-zinc-200 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-zinc-700">Tipo *</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          >
            <option value="ingreso">Ingreso (llega a la obra)</option>
            <option value="salida">Salida (sale de la obra)</option>
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

      <div className="mt-4">
        <label className="block text-xs font-medium text-zinc-700">Ítems *</label>
        <div className="mt-1 space-y-2">
          {items.map((it, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                {index === 0 && (
                  <span className="block text-xs text-zinc-400">Descripción</span>
                )}
                <input
                  type="text"
                  list="items-material-catalogo"
                  value={it.descripcion}
                  onChange={(e) => actualizarDescripcion(index, e.target.value)}
                  placeholder='Ej: "Taladro Bosch" o "Bolsas de cemento"'
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                />
              </div>
              <div className="w-28">
                {index === 0 && <span className="block text-xs text-zinc-400">Cantidad</span>}
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={it.cantidad}
                  onChange={(e) => actualizarItem(index, "cantidad", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                />
              </div>
              <div className="w-36">
                {index === 0 && <span className="block text-xs text-zinc-400">Categoría</span>}
                <select
                  value={it.categoria}
                  onChange={(e) => actualizarItem(index, "categoria", e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                >
                  <option value="material">Material (se consume)</option>
                  <option value="herramienta">Herramienta (va y vuelve)</option>
                </select>
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => quitarItem(index)}
                  className="rounded-md px-2 py-1.5 text-xs text-accent hover:underline"
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={agregarItem}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          + Agregar ítem
        </button>
        <datalist id="items-material-catalogo">
          {catalogo.map((c) => (
            <option key={c.descripcion_normalizada} value={c.descripcion} />
          ))}
        </datalist>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-zinc-700">
          Firma de constancia (recepción o entrega) *
        </label>
        <div className="mt-1">
          <SignaturePad ref={firmaRef} />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Registrar movimiento"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function MovimientoCard({ obraId, movimiento }) {
  const esIngreso = movimiento.tipo === "ingreso";
  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">
          <span className={esIngreso ? "text-green-700" : "text-accent"}>
            {esIngreso ? "Ingreso" : "Salida"}
          </span>{" "}
          · {fechaLegible(movimiento.fecha)}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-zinc-400">
            Cargado por {movimiento.creado_por_email ?? "desconocido"} el{" "}
            {new Date(movimiento.created_at).toLocaleString()}
          </p>
          <Link
            href={`/obras/${obraId}/movimientos-material/${movimiento.id}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver / Descargar PDF
          </Link>
        </div>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-zinc-700">
        {(movimiento.movimientos_material_items ?? []).map((it) => (
          <li key={it.id}>
            {formatearCantidad(it.cantidad)} × {it.descripcion}{" "}
            <span className="text-xs text-zinc-400">
              ({it.categoria === "herramienta" ? "herramienta" : "material"})
            </span>
          </li>
        ))}
      </ul>
      {movimiento.firma_imagen && (
        <a href={movimiento.firma_imagen} target="_blank" rel="noopener noreferrer">
          <img
            src={movimiento.firma_imagen}
            alt="Firma de constancia"
            className="mt-2 h-16 rounded-md border border-zinc-200 bg-white"
          />
        </a>
      )}
    </div>
  );
}

export default function MaterialHerramientas({ obraId }) {
  const role = useRole();
  const puedeGestionar =
    role === "administrador" || role === "compras" || role === "administracion";

  const [movimientos, setMovimientos] = useState([]);
  const [stock, setStock] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);

    const { data: movimientosData, error: errMov } = await supabase
      .from("movimientos_material")
      .select("*, movimientos_material_items(*)")
      .eq("obra_id", obraId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    const { data: stockData } = await supabase
      .from("stock_obra")
      .select("*")
      .eq("obra_id", obraId);

    if (errMov) setError(errMov.message);
    else setError(null);
    setMovimientos(movimientosData ?? []);
    setStock(stockData ?? []);
    setCargando(false);
  }, [obraId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const stockConSaldo = stock.filter((s) => Number(s.saldo) !== 0);
  const herramientasPendientes = stock.filter(
    (s) => s.categoria === "herramienta" && Number(s.saldo) > 0
  );

  async function handleGuardado() {
    setMostrarForm(false);
    await cargar();
  }

  return (
    <>
      {puedeGestionar && (
        <div className="flex justify-end">
          {!mostrarForm && (
            <button
              type="button"
              onClick={() => setMostrarForm(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              + Nuevo movimiento
            </button>
          )}
        </div>
      )}

      {mostrarForm && (
        <div className="mt-3">
          <FormularioMovimiento
            obraId={obraId}
            onCancelar={() => setMostrarForm(false)}
            onGuardado={handleGuardado}
          />
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && (
        <>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-zinc-700">
              Herramientas en obra sin devolución registrada
            </h3>
            {herramientasPendientes.length === 0 && (
              <p className="mt-1 text-sm text-zinc-500">Ninguna por ahora.</p>
            )}
            {herramientasPendientes.length > 0 && (
              <ul className="mt-1 space-y-1 text-sm text-zinc-700">
                {herramientasPendientes.map((h) => (
                  <li key={h.descripcion_normalizada}>
                    {h.descripcion} — {formatearCantidad(h.saldo)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-medium text-zinc-700">Stock actual de la obra</h3>
            {stockConSaldo.length === 0 && (
              <p className="mt-1 text-sm text-zinc-500">Todavía no hay nada cargado.</p>
            )}
            {stockConSaldo.length > 0 && (
              <div className="mt-1 divide-y divide-zinc-100">
                {stockConSaldo.map((s) => (
                  <div
                    key={s.descripcion_normalizada}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="text-zinc-700">
                      {s.descripcion}{" "}
                      <span className="text-xs text-zinc-400">
                        ({s.categoria === "herramienta" ? "herramienta" : "material"})
                      </span>
                    </span>
                    <span className="font-medium text-zinc-900">{formatearCantidad(s.saldo)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-medium text-zinc-700">Movimientos</h3>
            {movimientos.length === 0 && (
              <p className="mt-1 text-sm text-zinc-500">
                Todavía no se registró ningún movimiento.
              </p>
            )}
            {movimientos.length > 0 && (
              <div className="mt-2 space-y-2">
                {movimientos.map((m) => (
                  <MovimientoCard key={m.id} obraId={obraId} movimiento={m} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
