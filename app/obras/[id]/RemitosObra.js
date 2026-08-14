"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";
import SignaturePad from "../../SignaturePad";

function RemitoCard({ remito, items, productos, depositos, puedeGestionar, puedeFirmar, onCambio }) {
  const firmaRef = useRef(null);
  const esBorrador = remito.estado === "borrador";

  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [agregando, setAgregando] = useState(false);
  const [errorItem, setErrorItem] = useState(null);

  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState(null);

  const [firmanteNombre, setFirmanteNombre] = useState("");
  const [firmando, setFirmando] = useState(false);
  const [errorFirma, setErrorFirma] = useState(null);

  async function handleAgregarItem(e) {
    e.preventDefault();
    setAgregando(true);
    setErrorItem(null);

    const { error } = await supabase.from("remito_items").insert({
      remito_id: remito.id,
      producto_id: productoId,
      cantidad: Number(cantidad),
    });

    if (error) {
      setErrorItem(error.message);
    } else {
      setProductoId("");
      setCantidad("1");
      await onCambio();
    }
    setAgregando(false);
  }

  async function handleEliminarItem(itemId) {
    const { error } = await supabase.from("remito_items").delete().eq("id", itemId);
    if (error) {
      setErrorItem(error.message);
    } else {
      await onCambio();
    }
  }

  async function handleConfirmar() {
    setConfirmando(true);
    setErrorConfirmar(null);

    const { error } = await supabase.rpc("confirmar_remito", {
      p_remito_id: remito.id,
    });

    if (error) {
      setErrorConfirmar(error.message);
    } else {
      await onCambio();
    }
    setConfirmando(false);
  }

  async function handleFirmar(e) {
    e.preventDefault();
    if (firmaRef.current.estaVacio()) {
      setErrorFirma("Falta la firma.");
      return;
    }
    setFirmando(true);
    setErrorFirma(null);

    const { error } = await supabase.rpc("firmar_remito", {
      p_remito_id: remito.id,
      p_firmante_nombre: firmanteNombre.trim(),
      p_firma_imagen: firmaRef.current.exportar(),
    });

    if (error) {
      setErrorFirma(error.message);
    } else {
      await onCambio();
    }
    setFirmando(false);
  }

  return (
    <div className="rounded-md border border-zinc-200 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {new Date(remito.created_at).toLocaleDateString()}
          {remito.motivo ? ` · ${remito.motivo}` : ""}
        </p>
        <div className="flex items-center gap-2 print:hidden">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              remito.estado === "confirmado"
                ? "bg-green-100 text-green-800"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {remito.estado}
          </span>
          {remito.firmada && (
            <button
              onClick={() => window.print()}
              className="text-xs font-medium text-primary hover:underline"
            >
              Imprimir
            </button>
          )}
        </div>
      </div>

      <ul className="mt-2 divide-y divide-zinc-100 text-sm">
        {items.length === 0 && (
          <li className="py-1.5 text-zinc-500">Todavía no tiene productos.</li>
        )}
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-1.5">
            <span className="text-zinc-900">
              {item.productos?.nombre} · {item.cantidad}
            </span>
            {esBorrador && puedeGestionar && (
              <button
                onClick={() => handleEliminarItem(item.id)}
                className="text-xs text-accent hover:underline print:hidden"
              >
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>

      {esBorrador && puedeGestionar && (
        <form onSubmit={handleAgregarItem} className="mt-3 flex flex-wrap items-end gap-2 print:hidden">
          <div>
            <label className="block text-xs font-medium text-zinc-700">Producto</label>
            <select
              required
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="" disabled>
                Elegir...
              </option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.codigo})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">Cantidad</label>
            <input
              required
              type="number"
              min="0.0001"
              step="any"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="mt-1 w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
          <button
            type="submit"
            disabled={agregando}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {agregando ? "Agregando..." : "+ Agregar"}
          </button>
        </form>
      )}
      {errorItem && <p className="mt-2 text-xs text-accent">{errorItem}</p>}

      {esBorrador && puedeGestionar && (
        <div className="mt-3 print:hidden">
          {errorConfirmar && <p className="mb-2 text-xs text-accent">{errorConfirmar}</p>}
          <button
            onClick={handleConfirmar}
            disabled={confirmando || items.length === 0}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {confirmando ? "Confirmando..." : "Confirmar remito"}
          </button>
        </div>
      )}

      {!esBorrador && !remito.firmada && puedeFirmar && (
        <form onSubmit={handleFirmar} className="mt-3 rounded-md bg-zinc-50 p-3 print:hidden">
          <label className="block text-xs font-medium text-zinc-700">
            Nombre de quien recibe
          </label>
          <input
            required
            type="text"
            value={firmanteNombre}
            onChange={(e) => setFirmanteNombre(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
          <div className="mt-2">
            <SignaturePad ref={firmaRef} />
          </div>
          {errorFirma && <p className="mt-2 text-xs text-accent">{errorFirma}</p>}
          <button
            type="submit"
            disabled={firmando}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {firmando ? "Guardando..." : "Guardar firma"}
          </button>
        </form>
      )}

      {!esBorrador && !remito.firmada && !puedeFirmar && (
        <p className="mt-2 text-xs text-zinc-500">Confirmado, todavía sin firmar.</p>
      )}

      {remito.firmada && (
        <div className="mt-3 rounded-md bg-zinc-50 p-3">
          <p className="text-xs text-zinc-600">
            Recibió: <strong>{remito.firmante_nombre}</strong> —{" "}
            {new Date(remito.firmada_at).toLocaleString()}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={remito.firma_imagen}
            alt="Firma"
            className="mt-2 h-24 w-full max-w-xs rounded-md border border-zinc-200 bg-white object-contain"
          />
        </div>
      )}
    </div>
  );
}

export default function RemitosObra({ obraId }) {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "jefe_obra";
  const puedeFirmar =
    role === "administrador" ||
    role === "jefe_obra" ||
    role === "capataz";

  const [remitos, setRemitos] = useState([]);
  const [itemsPorRemito, setItemsPorRemito] = useState({});
  const [productos, setProductos] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [depositoOrigenId, setDepositoOrigenId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState(null);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    const remitosRes = await supabase
      .from("remitos")
      .select("*")
      .eq("obra_id", obraId)
      .order("created_at", { ascending: false });

    if (remitosRes.error) {
      setError(remitosRes.error.message);
      setCargando(false);
      return;
    }

    setError(null);
    setRemitos(remitosRes.data ?? []);

    const ids = (remitosRes.data ?? []).map((r) => r.id);
    if (ids.length > 0) {
      const [itemsRes, productosRes] = await Promise.all([
        supabase
          .from("remito_items")
          .select("id, remito_id, cantidad, producto_id")
          .in("remito_id", ids)
          .order("created_at"),
        supabase.from("productos_nombre").select("id, nombre, codigo"),
      ]);

      const nombresPorProducto = {};
      (productosRes.data ?? []).forEach((p) => {
        nombresPorProducto[p.id] = p;
      });

      const agrupados = {};
      (itemsRes.data ?? []).forEach((item) => {
        agrupados[item.remito_id] = agrupados[item.remito_id] ?? [];
        agrupados[item.remito_id].push({
          ...item,
          productos: nombresPorProducto[item.producto_id] ?? null,
        });
      });
      setItemsPorRemito(agrupados);
    } else {
      setItemsPorRemito({});
    }

    setCargando(false);
  }, [obraId]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  useEffect(() => {
    if (!puedeGestionar) return;
    Promise.all([
      supabase.from("productos_nombre").select("id, nombre, codigo").order("nombre"),
      supabase.from("depositos_origen").select("id, nombre").order("nombre"),
    ]).then(([productosRes, depositosRes]) => {
      setProductos(productosRes.data ?? []);
      setDepositos(depositosRes.data ?? []);
    });
  }, [puedeGestionar]);

  async function handleCrearRemito(e) {
    e.preventDefault();
    setCreando(true);
    setErrorCrear(null);

    const { error } = await supabase.from("remitos").insert({
      obra_id: obraId,
      deposito_origen_id: depositoOrigenId,
      motivo: motivo.trim() || null,
    });

    if (error) {
      setErrorCrear(error.message);
    } else {
      setDepositoOrigenId("");
      setMotivo("");
      setMostrarForm(false);
      await cargarTodo();
    }
    setCreando(false);
  }

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-primary">Remitos</h2>
        {puedeGestionar && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="text-sm font-medium text-primary hover:underline print:hidden"
          >
            {mostrarForm ? "Cancelar" : "+ Nuevo remito"}
          </button>
        )}
      </div>

      {mostrarForm && puedeGestionar && (
        <form
          onSubmit={handleCrearRemito}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 p-4"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-700">
              Depósito de origen
            </label>
            <select
              required
              value={depositoOrigenId}
              onChange={(e) => setDepositoOrigenId(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            >
              <option value="" disabled>
                Elegir...
              </option>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">Motivo</label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
          <button
            type="submit"
            disabled={creando}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {creando ? "Creando..." : "Crear remito"}
          </button>
          {errorCrear && <p className="w-full text-xs text-accent">{errorCrear}</p>}
        </form>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      {cargando && <p className="mt-4 text-sm text-zinc-600">Cargando...</p>}

      {!cargando && !error && remitos.length === 0 && (
        <p className="mt-4 text-sm text-zinc-600">
          Todavía no se registró ningún remito para esta obra.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {remitos.map((remito) => (
          <RemitoCard
            key={remito.id}
            remito={remito}
            items={itemsPorRemito[remito.id] ?? []}
            productos={productos}
            depositos={depositos}
            puedeGestionar={puedeGestionar}
            puedeFirmar={puedeFirmar}
            onCambio={cargarTodo}
          />
        ))}
      </div>
    </div>
  );
}
