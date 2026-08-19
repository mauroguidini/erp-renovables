"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "../RoleContext";

const ROLES = [
  { value: "administrador", label: "Administrador" },
  { value: "capataz", label: "Capataz" },
  { value: "jefe_obra", label: "Jefe de obra" },
  { value: "compras", label: "Compras" },
  { value: "administracion", label: "Administración" },
  { value: "consulta", label: "Consulta (solo lectura)" },
];

const valoresIniciales = { email: "", password: "", role: "capataz" };

function generarPassword() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let resultado = "";
  for (let i = 0; i < 12; i++) {
    resultado += caracteres[Math.floor(Math.random() * caracteres.length)];
  }
  return resultado;
}

async function tokenActual() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export default function Usuarios() {
  const role = useRole();
  const [miId, setMiId] = useState(null);

  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(valoresIniciales);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState(null);
  const [usuarioCreado, setUsuarioCreado] = useState(null);

  const cargarUsuarios = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at");

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setUsuarios(data ?? []);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarUsuarios();
    supabase.auth.getUser().then(({ data }) => setMiId(data.user?.id ?? null));
  }, [cargarUsuarios]);

  async function handleCrear(e) {
    e.preventDefault();
    setGuardando(true);
    setErrorForm(null);
    setUsuarioCreado(null);

    const token = await tokenActual();
    const res = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setErrorForm(data.error ?? "Error al crear el usuario");
    } else {
      setUsuarioCreado({ email: form.email.trim(), password: form.password });
      setForm(valoresIniciales);
      setMostrarForm(false);
      await cargarUsuarios();
    }
    setGuardando(false);
  }

  async function handleCambiarRol(usuario, nuevoRol) {
    const { error } = await supabase
      .from("profiles")
      .update({ role: nuevoRol })
      .eq("id", usuario.id);

    if (error) {
      setError(error.message);
    } else {
      await cargarUsuarios();
    }
  }

  async function handleCambiarActivo(usuario, activo) {
    setError(null);
    const token = await tokenActual();
    const res = await fetch(`/api/admin/usuarios/${usuario.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ activo }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Error al cambiar el estado");
    } else {
      await cargarUsuarios();
    }
  }

  if (role !== "administrador") {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="mx-auto max-w-3xl">
          <p className="text-zinc-600">No tenés acceso a esta pantalla.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">Usuarios</h1>
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            {mostrarForm ? "Cancelar" : "+ Nuevo usuario"}
          </button>
        </div>

        {usuarioCreado && (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-medium">Usuario creado correctamente.</p>
            <p className="mt-1">
              Pasale estos datos por afuera de la app (WhatsApp, en persona, etc.) —
              no se van a volver a mostrar:
            </p>
            <p className="mt-2 font-mono">
              Email: {usuarioCreado.email}
              <br />
              Contraseña: {usuarioCreado.password}
            </p>
          </div>
        )}

        {mostrarForm && (
          <form
            onSubmit={handleCrear}
            className="mt-6 rounded-lg border border-zinc-200 bg-white p-5"
          >
            <h2 className="text-lg font-semibold text-primary">Cargar usuario nuevo</h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">
                  Email *
                </label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Contraseña inicial *
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    required
                    type="text"
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, password: generarPassword() }))}
                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Generar
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Rol *
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-primary"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {errorForm && (
              <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
                {errorForm}
              </p>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {guardando ? "Creando..." : "Crear usuario"}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-6 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}

        {cargando && <p className="mt-6 text-zinc-600">Cargando...</p>}

        {!cargando && usuarios.length > 0 && (
          <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {usuarios.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <span className="font-medium text-primary">{u.email}</span>
                  {!u.activo && (
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                      desactivado
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={u.role}
                    disabled={u.id === miId}
                    onChange={(e) => handleCambiarRol(u, e.target.value)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {u.id !== miId && (
                    <button
                      onClick={() => handleCambiarActivo(u, !u.activo)}
                      className={`text-sm font-medium hover:underline ${
                        u.activo ? "text-accent" : "text-primary"
                      }`}
                    >
                      {u.activo ? "Desactivar" : "Reactivar"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
