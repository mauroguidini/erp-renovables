"use client";

import { useState } from "react";

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
  cliente_id: "",
  tipo_factura: "A",
  numero_factura: "",
  fecha: hoyISO(),
  importe_neto: "",
  iva: "",
  otros_impuestos: "0",
  importe_total: "",
  estado_cobro: "pendiente",
  obra_id: "",
  centro_costo_id: "",
};

// Los campos del formulario de una factura de venta — se usa tanto para
// cargar un documento nuevo (facturas-venta/nueva) como para editar uno ya
// cargado (el "Editar" de cada fila en la lista).
export default function CamposFacturaVenta({ form, setForm, clientes, obras, centros }) {
  const [totalTocado, setTotalTocado] = useState(false);

  function actualizar(campo, valor) {
    setForm((f) => {
      const siguiente = { ...f, [campo]: valor };
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
        <label className="block text-xs font-medium text-zinc-700">Cliente *</label>
        <select
          required
          value={form.cliente_id}
          onChange={(e) => actualizar("cliente_id", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="">Elegí un cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
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
        <label className="block text-xs font-medium text-zinc-700">Estado de cobro *</label>
        <select
          required
          value={form.estado_cobro}
          onChange={(e) => actualizar("estado_cobro", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="pendiente">Pendiente</option>
          <option value="cobrada">Cobrada</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700">Obra (opcional)</label>
        <select
          value={form.obra_id}
          onChange={(e) => actualizar("obra_id", e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
        >
          <option value="">Sin vincular</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.direccion}
            </option>
          ))}
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
    </div>
  );
}
