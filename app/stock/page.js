"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Stock() {
  const [filas, setFilas] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargarStock() {
      const { data, error } = await supabase
        .from("stock")
        .select(
          "cantidad, productos(id, nombre, codigo, stock_minimo), depositos(nombre)"
        )
        .order("cantidad", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setError(null);
        setFilas(data);
      }
      setCargando(false);
    }

    cargarStock();
  }, []);

  const totalesPorProducto = filas.reduce((acc, fila) => {
    const producto = fila.productos;
    if (!producto) return acc;
    const actual = acc[producto.id] ?? {
      nombre: producto.nombre,
      codigo: producto.codigo,
      stockMinimo: producto.stock_minimo,
      total: 0,
    };
    actual.total += Number(fila.cantidad);
    acc[producto.id] = actual;
    return acc;
  }, {});

  const productosBajoMinimo = Object.values(totalesPorProducto).filter(
    (p) => p.total < p.stockMinimo
  );

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-zinc-900">Stock</h1>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && productosBajoMinimo.length > 0 && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="font-medium text-red-800">
              Productos por debajo del stock mínimo:
            </p>
            <ul className="mt-2 text-sm text-red-800">
              {productosBajoMinimo.map((p) => (
                <li key={p.codigo}>
                  {p.nombre} ({p.codigo}): {p.total} en stock, mínimo {p.stockMinimo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!cargando && !error && filas.length === 0 && (
          <p className="mt-6 text-zinc-600">
            Todavía no hay stock cargado (confirmá una compra para que aparezca acá).
          </p>
        )}

        {!cargando && !error && filas.length > 0 && (
          <table className="mt-6 w-full rounded-lg border border-zinc-200 bg-white text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 font-medium">Depósito</th>
                <th className="px-4 py-2 font-medium">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filas.map((fila, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-zinc-900">
                    {fila.productos?.nombre}{" "}
                    <span className="text-zinc-400">({fila.productos?.codigo})</span>
                  </td>
                  <td className="px-4 py-2 text-zinc-900">{fila.depositos?.nombre}</td>
                  <td className="px-4 py-2 text-zinc-900">{fila.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
