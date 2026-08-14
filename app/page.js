"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const ESTADO_OBRA_COLOR = {
  presupuestada: "bg-zinc-100 text-zinc-800",
  aprobada: "bg-blue-100 text-blue-800",
  en_curso: "bg-yellow-100 text-yellow-800",
  finalizada: "bg-green-100 text-green-800",
  cancelada: "bg-accent/10 text-accent",
};

const ESTADO_OBRA_LABEL = {
  presupuestada: "Presupuestada",
  aprobada: "Aprobada",
  en_curso: "En curso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

function TarjetaKpi({ href, etiqueta, valor, valorClassName, cargando }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-primary/40 hover:shadow-sm"
    >
      <p className="text-sm text-zinc-500">{etiqueta}</p>
      <p
        className={`mt-2 text-3xl font-semibold ${valorClassName ?? "text-primary"}`}
      >
        {cargando ? "…" : valor}
      </p>
    </Link>
  );
}

export default function Dashboard() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [otPendientes, setOtPendientes] = useState(0);
  const [obrasEnCurso, setObrasEnCurso] = useState(0);
  const [productosBajoMinimo, setProductosBajoMinimo] = useState(0);
  const [obrasPorEstado, setObrasPorEstado] = useState({});

  useEffect(() => {
    async function cargar() {
      const [otRes, obrasRes, stockRes] = await Promise.all([
        supabase
          .from("ordenes_trabajo")
          .select("id", { count: "exact", head: true })
          .eq("estado", "pendiente"),
        supabase.from("obras").select("estado"),
        supabase.from("stock").select("cantidad, productos(id, stock_minimo)"),
      ]);

      if (otRes.error || obrasRes.error || stockRes.error) {
        setError(
          (otRes.error || obrasRes.error || stockRes.error).message
        );
        setCargando(false);
        return;
      }

      setOtPendientes(otRes.count ?? 0);

      const conteoPorEstado = {};
      (obrasRes.data ?? []).forEach((o) => {
        conteoPorEstado[o.estado] = (conteoPorEstado[o.estado] ?? 0) + 1;
      });
      setObrasPorEstado(conteoPorEstado);
      setObrasEnCurso(conteoPorEstado.en_curso ?? 0);

      const totalesPorProducto = {};
      (stockRes.data ?? []).forEach((fila) => {
        const producto = fila.productos;
        if (!producto) return;
        const actual = totalesPorProducto[producto.id] ?? {
          stockMinimo: producto.stock_minimo,
          total: 0,
        };
        actual.total += Number(fila.cantidad);
        totalesPorProducto[producto.id] = actual;
      });
      setProductosBajoMinimo(
        Object.values(totalesPorProducto).filter(
          (p) => p.total < p.stockMinimo
        ).length
      );

      setCargando(false);
    }

    cargar();
  }, []);

  const ESTADOS_OBRA = [
    "presupuestada",
    "aprobada",
    "en_curso",
    "finalizada",
    "cancelada",
  ];

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-primary">Inicio</h1>

        {error && (
          <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
            Error al cargar el panel: {error}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TarjetaKpi
            href="/ot?estado=pendiente"
            etiqueta="OT pendientes"
            valor={otPendientes}
            cargando={cargando}
          />
          <TarjetaKpi
            href="/obras?estado=en_curso"
            etiqueta="Obras en curso"
            valor={obrasEnCurso}
            cargando={cargando}
          />
          <TarjetaKpi
            href="/stock"
            etiqueta="Productos bajo stock mínimo"
            valor={productosBajoMinimo}
            valorClassName="text-accent"
            cargando={cargando}
          />

          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">Obras por estado</p>
            <div className="mt-3 space-y-1.5">
              {ESTADOS_OBRA.map((estado) => (
                <Link
                  key={estado}
                  href={`/obras?estado=${estado}`}
                  className="flex items-center justify-between rounded-md px-1.5 py-1 hover:bg-zinc-50"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_OBRA_COLOR[estado]}`}
                  >
                    {ESTADO_OBRA_LABEL[estado]}
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    {cargando ? "…" : obrasPorEstado[estado] ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
