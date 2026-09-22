"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../../../RoleContext";

const DATOS_EMPRESA = {
  nombre: "Baluti Servicios Integrales SRL",
  cuit: "30-71829950-7",
  domicilio: "Av. 9 de Julio 950, Resistencia, Chaco (CP 3500)",
  contacto: "",
};

function fechaLegible(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR");
}

function formatearCantidad(n) {
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export default function DetalleMovimientoMaterial() {
  const role = useRole();
  const puedeVer =
    role === "administrador" ||
    role === "compras" ||
    role === "administracion" ||
    role === "capataz" ||
    role === "jefe_obra";
  const router = useRouter();
  const { id: obraId, movimientoId } = useParams();

  const [obra, setObra] = useState(null);
  const [movimiento, setMovimiento] = useState(null);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);

    const { data: obrasData } = await supabase.rpc("obras_para_material");
    const obraData = (obrasData ?? []).find((o) => o.id === obraId) ?? null;

    const { data: movData, error: errMov } = await supabase
      .from("movimientos_material")
      .select("*, movimientos_material_items(*)")
      .eq("id", movimientoId)
      .single();

    if (errMov) {
      setError(errMov.message);
      setCargando(false);
      return;
    }

    setError(null);
    setObra(obraData);
    setMovimiento(movData);
    setItems(movData?.movimientos_material_items ?? []);
    setCargando(false);
  }, [obraId, movimientoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!puedeVer) {
    return (
      <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">No tenés acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error || !movimiento) {
    return (
      <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-accent">{error ?? "No se encontró el movimiento."}</p>
        </div>
      </div>
    );
  }

  const esIngreso = movimiento.tipo === "ingreso";

  return (
    <div className="min-h-screen bg-zinc-50 p-4 font-sans sm:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() =>
            router.push(
              role === "compras" ? `/obras/${obraId}/movimientos-material` : `/obras/${obraId}`
            )
          }
          className="text-sm text-zinc-500 hover:text-zinc-800 print:hidden"
        >
          ← Volver a la obra
        </button>

        {/* Membrete — solo se ve al imprimir */}
        <div className="mt-4 hidden print:block">
          <h1 className="text-xl font-bold">{DATOS_EMPRESA.nombre}</h1>
          {DATOS_EMPRESA.cuit && <p className="text-sm">CUIT: {DATOS_EMPRESA.cuit}</p>}
          {DATOS_EMPRESA.domicilio && <p className="text-sm">{DATOS_EMPRESA.domicilio}</p>}
          {DATOS_EMPRESA.contacto && <p className="text-sm">{DATOS_EMPRESA.contacto}</p>}
          <hr className="my-3" />
        </div>

        <div className="mt-2 flex items-center justify-between print:mt-0">
          <h1 className="text-2xl font-semibold text-primary print:text-lg">
            {esIngreso ? "Ingreso" : "Salida"} de material/herramientas
          </h1>
          <button
            onClick={() => window.print()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 print:hidden"
          >
            Imprimir / Descargar PDF
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-white p-5 sm:grid-cols-2 print:mt-3 print:border-0 print:p-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Obra</p>
            <p className="mt-1 text-sm text-zinc-900">{obra?.direccion ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Fecha</p>
            <p className="mt-1 text-sm text-zinc-900">{fechaLegible(movimiento.fecha)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Tipo</p>
            <p className="mt-1 text-sm text-zinc-900">
              {esIngreso ? "Ingreso (llega a la obra)" : "Salida (sale de la obra)"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Cargado por
            </p>
            <p className="mt-1 text-sm text-zinc-900">
              {movimiento.creado_por_email ?? "desconocido"}
            </p>
            <p className="text-xs text-zinc-500">
              {new Date(movimiento.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white print:mt-4 print:border-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-4 py-2 font-medium">Descripción</th>
                <th className="px-4 py-2 font-medium">Categoría</th>
                <th className="px-4 py-2 font-medium">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-zinc-500">
                    Sin ítems.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 text-primary">{item.descripcion}</td>
                  <td className="px-4 py-2 text-primary">
                    {item.categoria === "herramienta" ? "Herramienta" : "Material"}
                  </td>
                  <td className="px-4 py-2 text-primary">{formatearCantidad(item.cantidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 print:mt-4 print:border-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Firma de constancia
          </p>
          {movimiento.firma_imagen ? (
            <img
              src={movimiento.firma_imagen}
              alt="Firma de constancia"
              className="mt-2 h-32 rounded-md border border-zinc-200 bg-white"
            />
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Sin firma registrada.</p>
          )}
        </div>
      </div>
    </div>
  );
}
