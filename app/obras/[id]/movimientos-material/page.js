"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../../RoleContext";
import Seccion from "../../../Seccion";
import MaterialHerramientas from "../MaterialHerramientas";

// Versión liviana de la página de obra: muestra SOLO la sección de
// Ingresos/salidas de material y herramientas, sin el resto (hitos, OT,
// asistencia, trabajo diario, etc.). Pensada para roles como "compras" que
// pueden cargar material pero no tienen acceso a la obra completa (esos
// roles no pasan puede_ver_obras() en la base, así que /obras/[id] les
// falla al cargar). Los datos de la obra acá vienen de obras_para_material(),
// no de "obras_visibles" — por diseño, no requiere el mismo permiso.
export default function ObraMovimientosMaterial() {
  const role = useRole();
  const puedeVer =
    role === "administrador" ||
    role === "compras" ||
    role === "administracion" ||
    role === "capataz" ||
    role === "jefe_obra";
  const router = useRouter();
  const { id } = useParams();

  const [direccion, setDireccion] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarObra = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.rpc("obras_para_material");
    setDireccion((data ?? []).find((o) => o.id === id)?.direccion ?? null);
    setCargando(false);
  }, [id]);

  useEffect(() => {
    cargarObra();
  }, [cargarObra]);

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
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push("/movimientos-material")}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Volver a Materiales y herramientas
        </button>

        <h1 className="mt-2 text-2xl font-semibold text-primary">
          {cargando ? "Cargando..." : direccion ?? "Obra"}
        </h1>

        <Seccion titulo="Ingresos y salidas de material y herramientas" defaultAbierto>
          <MaterialHerramientas obraId={id} />
        </Seccion>
      </div>
    </div>
  );
}
