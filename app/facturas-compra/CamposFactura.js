"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export const TIPOS_FACTURA = ["A", "B", "C", "otro"];

export function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function fechaLegible(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
}

export function formatearMonto(monto) {
  return Number(monto).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

export const FORM_INICIAL = {
  tipo_documento: "factura",
  proveedor_id: "",
  tipo_factura: "A",
  numero_factura: "",
  fecha: hoyISO(),
  importe_neto: "",
  iva: "",
  otros_impuestos: "0",
  importe_total: "",
  categoria_id: "",
  estado_pago: "pendiente",
  centro_costo_id: "",
  factura_id: "",
  orden_compra_id: "",
};

// Los campos del formulario de una factura de compra — se usa tanto para
// cargar un documento nuevo (facturas-compra/nueva) como para editar uno
// ya cargado (el "Editar" de cada fila en la lista).
export default function CamposFactura({ form, setForm, proveedores, categorias, centros }) {
  const [totalTocado, setTotalTocado] = useState(false);
  const [facturasDelProveedor, setFacturasDelProveedor] = useState([]);
  const [ordenesCompraDelProveedor, setOrdenesCompraDelProveedor] = useState([]);

  // Solo tiene sentido elegir "a qué factura corrige" una vez que se sabe
  // el proveedor — y solo se muestran facturas de ESE proveedor (nunca
  // otras notas de crédito, ver 052).
  useEffect(() => {
    if (form.tipo_documento !== "nota_credito" || !form.proveedor_id) {
      setFacturasDelProveedor([]);
      return;
    }
    let cancelado = false;
    supabase
      .from("facturas_compra")
      .select("id, tipo_factura, numero_factura, fecha, importe_total")
      .eq("proveedor_id", form.proveedor_id)
      .eq("tipo_documento", "factura")
      .order("fecha", { ascending: false })
      .then(({ data }) => {
        if (!cancelado) setFacturasDelProveedor(data ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, [form.tipo_documento, form.proveedor_id]);

  // Igual criterio para elegir la orden de compra que originó la factura:
  // solo de ese mismo proveedor.
  useEffect(() => {
    if (form.tipo_documento !== "factura" || !form.proveedor_id) {
      setOrdenesCompraDelProveedor([]);
      return;
    }
    let cancelado = false;
    supabase
      .from("ordenes_compra")
      .select("id, numero, fecha")
      .eq("proveedor_id", form.proveedor_id)
      .order("numero", { ascending: false })
      .then(({ data }) => {
        if (!cancelado) setOrdenesCompraDelProveedor(data ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, [form.tipo_documento, form.proveedor_id]);

  function actualizar(campo, valor) {
    setForm((f) => {
      const siguiente = { ...f, [campo]: valor };
      if (campo === "tipo_documento" && valor === "factura") siguiente.factura_id = "";
      if (campo === "tipo_documento" && valor === "nota_credito") siguiente.orden_compra_id = "";
      if (campo === "proveedor_id") {
        siguiente.factura_id = "";
        siguiente.orden_compra_id = "";
      }
      if (
        (campo === "importe_neto" || campo === "iva" || campo === "otros_impuestos") &&
        !totalTocado
      ) {
        const neto = Number(campo === "importe_neto" ? valor : siguiente.importe_neto) || 0;
        const iva = Number(campo === "iva" ? valor : siguiente.iva) || 0;
        const otros =
          Number(campo === "otros_impuestos" ? valor : siguiente.otros_impuestos) || 0;
        siguiente.importe_total = String((neto + iva + otros).toFixed(2));
      }
      return siguiente;
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-zinc-700">Tipo de documento *</label>
        <select
          required
          value={form.tipo_documento}
          onChange={(e) => actualizar("tipo_documento", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="factura">Factura</option>
          <option value="nota_credito">Nota de crédito</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Proveedor *</label>
        <select
          required
          value={form.proveedor_id}
          onChange={(e) => actualizar("proveedor_id", e.target.value)}
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
          value={form.fecha}
          onChange={(e) => actualizar("fecha", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Tipo de factura *</label>
        <select
          required
          value={form.tipo_factura}
          onChange={(e) => actualizar("tipo_factura", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          {TIPOS_FACTURA.map((t) => (
            <option key={t} value={t}>
              {t === "otro" ? "Otro" : t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">N.º de factura *</label>
        <input
          required
          type="text"
          value={form.numero_factura}
          onChange={(e) => actualizar("numero_factura", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Importe neto *</label>
        <input
          required
          type="number"
          min="0"
          step="any"
          value={form.importe_neto}
          onChange={(e) => actualizar("importe_neto", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">IVA *</label>
        <input
          required
          type="number"
          min="0"
          step="any"
          value={form.iva}
          onChange={(e) => actualizar("iva", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Otros impuestos *</label>
        <input
          required
          type="number"
          min="0"
          step="any"
          value={form.otros_impuestos}
          onChange={(e) => actualizar("otros_impuestos", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
        <p className="mt-1 text-xs text-zinc-400">Percepciones, IIBB, etc. Si no hay, poné 0.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">
          Importe total *{" "}
          {!totalTocado && <span className="text-zinc-400">(neto + IVA + otros impuestos)</span>}
        </label>
        <input
          required
          type="number"
          min="0"
          step="any"
          value={form.importe_total}
          onChange={(e) => {
            setTotalTocado(true);
            actualizar("importe_total", e.target.value);
          }}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Categoría *</label>
        <select
          required
          value={form.categoria_id}
          onChange={(e) => actualizar("categoria_id", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Estado de pago *</label>
        <select
          required
          value={form.estado_pago}
          onChange={(e) => actualizar("estado_pago", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="pendiente">Pendiente</option>
          <option value="pagada">Pagada</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-zinc-700">
          Centro de costos (opcional)
        </label>
        <select
          value={form.centro_costo_id}
          onChange={(e) => actualizar("centro_costo_id", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="">Sin imputar</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      {form.tipo_documento === "factura" && (
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-700">
            Orden de compra que la originó (opcional)
          </label>
          <select
            value={form.orden_compra_id}
            onChange={(e) => actualizar("orden_compra_id", e.target.value)}
            disabled={!form.proveedor_id}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:bg-zinc-100"
          >
            <option value="">Sin vincular</option>
            {ordenesCompraDelProveedor.map((oc) => (
              <option key={oc.id} value={oc.id}>
                OC #{oc.numero} — {fechaLegible(oc.fecha)}
              </option>
            ))}
          </select>
          {!form.proveedor_id && (
            <p className="mt-1 text-xs text-zinc-400">
              Elegí un proveedor para ver sus órdenes de compra.
            </p>
          )}
        </div>
      )}
      {form.tipo_documento === "nota_credito" && (
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-700">
            Factura que corrige (opcional)
          </label>
          <select
            value={form.factura_id}
            onChange={(e) => actualizar("factura_id", e.target.value)}
            disabled={!form.proveedor_id}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:bg-zinc-100"
          >
            <option value="">Nota suelta, sin factura asociada</option>
            {facturasDelProveedor.map((f) => (
              <option key={f.id} value={f.id}>
                Factura {f.tipo_factura} n.º {f.numero_factura} — {fechaLegible(f.fecha)} —{" "}
                {formatearMonto(f.importe_total)}
              </option>
            ))}
          </select>
          {!form.proveedor_id && (
            <p className="mt-1 text-xs text-zinc-400">Elegí un proveedor para ver sus facturas.</p>
          )}
        </div>
      )}
    </div>
  );
}
