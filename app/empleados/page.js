"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";
import NuevoEmpleadoForm from "./NuevoEmpleadoForm";

const OFICIOS_LABEL = {
  instalador: "Instalador",
  electricista: "Electricista",
  ayudante: "Ayudante",
  tecnico: "Técnico",
  otro: "Otro",
};

export default function Empleados() {
  const role = useRole();
  const puedeGestionar = role === "administrador" || role === "jefe_obra";
  const [empleados, setEmpleados] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarEmpleados = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("empleados")
      .select("*")
      .order("nombre");

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setEmpleados(data);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarEmpleados();
  }, [cargarEmpleados]);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-primary">Empleados/Técnicos</h1>

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent">
            <p className="font-medium">No se pudo conectar con la base de datos.</p>
            <p className="mt-1 text-sm">Error: {error}</p>
          </div>
        )}

        {!cargando && !error && empleados.length === 0 && (
          <p className="mt-6 text-zinc-600">Todavía no hay empleados cargados.</p>
        )}

        {!cargando && !error && empleados.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {empleados.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-medium text-primary">{e.nombre}</span>
                  <span className="ml-2 text-sm text-zinc-500">
                    {[OFICIOS_LABEL[e.oficio], e.contacto_telefono, e.contacto_email]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {!e.activo && <span className="text-xs text-zinc-400">inactivo</span>}
              </li>
            ))}
          </ul>
        )}

        {puedeGestionar && (
          <NuevoEmpleadoForm onEmpleadoCreado={cargarEmpleados} />
        )}
      </div>
    </div>
  );
}
