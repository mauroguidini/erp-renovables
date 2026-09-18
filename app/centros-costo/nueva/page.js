"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../../RoleContext";
import FormularioCentro from "../FormularioCentro";

export default function NuevoCentroCosto() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "administracion";
  const router = useRouter();

  const [obras, setObras] = useState([]);
  const [nuevo, setNuevo] = useState({ numero: "", nombre: "", tipo: "obra", obra_id: "" });
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);

  useEffect(() => {
    supabase
      .from("obras_visibles")
      .select("id, direccion")
      .order("direccion")
      .then(({ data }) => setObras(data ?? []));
  }, []);

  async function handleAgregar(e) {
    e.preventDefault();
    if (!nuevo.nombre.trim() || nuevo.numero === "") return;

    setGuardando(true);
    setErrorGuardado(null);

    const { error } = await supabase.from("centros_costo").insert({
      numero: Number(nuevo.numero),
      nombre: nuevo.nombre.trim(),
      tipo: nuevo.tipo,
      obra_id: nuevo.tipo === "obra" ? nuevo.obra_id || null : null,
    });

    if (error) {
      setErrorGuardado(
        error.code === "23505"
          ? "Ya existe un centro con ese número o ese nombre (u otro ya vinculado a esa obra)."
          : error.message
      );
      setGuardando(false);
      return;
    }

    setGuardando(false);
    router.push("/centros-costo");
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
          onClick={() => router.push("/centros-costo")}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Volver a centros de costos
        </button>

        <h1 className="mt-2 text-2xl font-semibold text-primary">Nuevo centro de costos</h1>

        <form
          onSubmit={handleAgregar}
          className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 sm:mt-6 sm:p-5"
        >
          <FormularioCentro form={nuevo} setForm={setNuevo} obras={obras} />

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
              {guardando ? "Guardando..." : "Agregar centro"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/centros-costo")}
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
