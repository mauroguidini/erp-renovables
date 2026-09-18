"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";
import CamposFacturaVenta, { FORM_INICIAL } from "../CamposFacturaVenta";

const BUCKET = "facturas-venta";

export default function NuevaFacturaVenta() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";
  const router = useRouter();

  const inputComprobanteRef = useRef(null);

  const [clientes, setClientes] = useState([]);
  const [obras, setObras] = useState([]);
  const [centros, setCentros] = useState([]);

  const [nuevo, setNuevo] = useState(FORM_INICIAL);
  const [comprobante, setComprobante] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, nombre, cuit")
      .order("nombre")
      .then(({ data }) => setClientes(data ?? []));
    supabase
      .from("obras_visibles")
      .select("id, direccion")
      .order("direccion")
      .then(({ data }) => setObras(data ?? []));
    supabase
      .from("centros_costo")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setCentros(data ?? []));
  }, []);

  async function handleAgregar(e) {
    e.preventDefault();
    if (
      !nuevo.cliente_id ||
      !nuevo.numero_factura.trim() ||
      nuevo.importe_neto === "" ||
      nuevo.iva === "" ||
      nuevo.otros_impuestos === "" ||
      nuevo.importe_total === ""
    ) {
      return;
    }

    setGuardando(true);
    setErrorGuardado(null);

    const facturaId = crypto.randomUUID();
    let comprobanteRuta = null;

    if (comprobante) {
      comprobanteRuta = `${facturaId}/${crypto.randomUUID()}-${comprobante.name}`;
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(comprobanteRuta, comprobante);

      if (errSubida) {
        setErrorGuardado(`No se pudo subir el comprobante: ${errSubida.message}`);
        setGuardando(false);
        return;
      }
    }

    const { error } = await supabase.from("facturas_venta").insert({
      id: facturaId,
      tipo_documento: nuevo.tipo_documento,
      cliente_id: nuevo.cliente_id,
      tipo_factura: nuevo.tipo_factura,
      numero_factura: nuevo.numero_factura.trim(),
      fecha: nuevo.fecha,
      importe_neto: Number(nuevo.importe_neto),
      iva: Number(nuevo.iva),
      otros_impuestos: Number(nuevo.otros_impuestos),
      importe_total: Number(nuevo.importe_total),
      estado_cobro: nuevo.estado_cobro,
      obra_id: nuevo.obra_id || null,
      centro_costo_id: nuevo.centro_costo_id || null,
      comprobante_ruta: comprobanteRuta,
    });

    if (error) {
      if (comprobanteRuta) await supabase.storage.from(BUCKET).remove([comprobanteRuta]);
      setErrorGuardado(
        error.code === "23505"
          ? "Ya existe un documento cargado con ese cliente, tipo de documento, tipo y número."
          : error.message
      );
      setGuardando(false);
      return;
    }

    setGuardando(false);
    router.push("/facturas-venta");
  }

  if (!puedeGestionar) {
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
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/facturas-venta")}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Volver a Facturas de venta
        </button>

        <h1 className="mt-2 text-2xl font-semibold text-primary">
          Cargar factura o nota de crédito
        </h1>

        <form
          onSubmit={handleAgregar}
          className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 sm:mt-6 sm:p-5"
        >
          <CamposFacturaVenta
            form={nuevo}
            setForm={setNuevo}
            clientes={clientes}
            obras={obras}
            centros={centros}
          />

          <div className="mt-3">
            <label className="block text-xs font-medium text-zinc-700">
              Comprobante (foto o PDF, opcional)
            </label>
            <input
              ref={inputComprobanteRef}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp,image/heic"
              onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
            />
          </div>

          {errorGuardado && (
            <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
              {errorGuardado}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Agregar documento"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/facturas-venta")}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
