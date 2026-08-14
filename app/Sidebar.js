"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Package, Handshake, HardHat, LogOut, Home } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const INICIO = { href: "/", label: "Inicio", Icon: Home };

// Cada grupo/link declara qué roles lo pueden ver. Un link sin "roles"
// propio hereda los del grupo. Esto es solo para no mostrar en el menú algo
// que el usuario no puede usar — el permiso real está en las políticas RLS
// de la base de datos, esto es la comodidad de la interfaz, no la seguridad.
const GRUPOS = [
  {
    label: "Depósito/Stock",
    Icon: Package,
    roles: ["administrador", "compras"],
    links: [
      { href: "/productos", label: "Productos" },
      { href: "/stock", label: "Stock", badge: "bajoMinimo" },
      { href: "/compras", label: "Compras" },
      { href: "/depositos", label: "Depósitos" },
      { href: "/proveedores", label: "Proveedores" },
      { href: "/transferencias", label: "Transferencias" },
      { href: "/entregas", label: "Entregar a obra" },
    ],
  },
  {
    label: "Comercial",
    Icon: Handshake,
    roles: ["administrador", "administracion"],
    links: [{ href: "/clientes", label: "Clientes" }],
  },
  {
    label: "Obras",
    Icon: HardHat,
    roles: ["administrador", "capataz", "jefe_obra", "administracion"],
    links: [
      { href: "/obras", label: "Obras" },
      { href: "/ot", label: "OT", badge: "otPendientes" },
      {
        href: "/empleados",
        label: "Empleados",
        roles: ["administrador", "jefe_obra"],
      },
      {
        href: "/tipos-tarea",
        label: "Tipos de tarea",
        roles: ["administrador", "jefe_obra"],
      },
    ],
  },
];

function gruposParaRol(role) {
  return GRUPOS.map((grupo) => ({
    ...grupo,
    links: grupo.links.filter((link) => (link.roles ?? grupo.roles).includes(role)),
  })).filter((grupo) => grupo.roles.includes(role) && grupo.links.length > 0);
}

function NavContenido({ pathname, contadores, session, grupos, onNavegar, onLogout }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <img src="/logo-bsi.png" alt="BSI" className="h-9 w-auto rounded bg-white p-0.5" />
        <span className="text-sm font-semibold text-white">ERP Renovables</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        <Link
          href={INICIO.href}
          onClick={onNavegar}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
            pathname === INICIO.href
              ? "bg-white/15 text-white"
              : "text-white/75 hover:bg-white/10 hover:text-white"
          }`}
        >
          <INICIO.Icon size={16} />
          {INICIO.label}
        </Link>

        {grupos.map((grupo) => (
          <div key={grupo.label}>
            <div className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-white/50">
              <grupo.Icon size={14} />
              {grupo.label}
            </div>
            <div className="mt-1 space-y-0.5">
              {grupo.links.map((link) => {
                const activo = pathname === link.href;
                const contador = link.badge ? contadores[link.badge] : null;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={onNavegar}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
                      activo
                        ? "bg-white/15 text-white"
                        : "text-white/75 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span>{link.label}</span>
                    {!!contador && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                        {contador}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <p className="truncate text-xs text-white/60">{session?.user?.email}</p>
        <button
          onClick={onLogout}
          className="mt-2 flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({ session, role }) {
  const pathname = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [contadores, setContadores] = useState({});
  const grupos = gruposParaRol(role);
  const puedeStock = role === "administrador" || role === "compras";
  const puedeVerObras =
    role === "administrador" ||
    role === "capataz" ||
    role === "jefe_obra" ||
    role === "administracion";

  const cargarContadores = useCallback(async () => {
    const nuevosContadores = {};

    if (puedeVerObras) {
      const otRes = await supabase
        .from("ordenes_trabajo")
        .select("id", { count: "exact", head: true })
        .eq("estado", "pendiente");
      nuevosContadores.otPendientes = otRes.count ?? 0;
    }

    if (!puedeStock) {
      setContadores(nuevosContadores);
      return;
    }

    const stockRes = await supabase
      .from("stock")
      .select("cantidad, productos(id, stock_minimo)");

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
    nuevosContadores.bajoMinimo = Object.values(totalesPorProducto).filter(
      (p) => p.total < p.stockMinimo
    ).length;

    setContadores(nuevosContadores);
  }, [puedeStock, puedeVerObras]);

  useEffect(() => {
    cargarContadores();
  }, [cargarContadores, pathname]);

  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-primary px-4 py-3 md:hidden print:hidden">
        <img src="/logo-bsi.png" alt="BSI" className="h-8 w-auto rounded bg-white p-0.5" />
        <button onClick={() => setAbierto(true)} aria-label="Abrir menú">
          <Menu className="text-white" />
        </button>
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setAbierto(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-primary transition-transform duration-200 md:hidden print:hidden ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setAbierto(false)}
          aria-label="Cerrar menú"
          className="absolute right-3 top-4 text-white/70 hover:text-white"
        >
          <X size={20} />
        </button>
        <NavContenido
          pathname={pathname}
          contadores={contadores}
          session={session}
          grupos={grupos}
          onNavegar={() => setAbierto(false)}
          onLogout={handleLogout}
        />
      </div>

      <div className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-primary md:flex print:hidden">
        <NavContenido
          pathname={pathname}
          contadores={contadores}
          session={session}
          grupos={grupos}
          onLogout={handleLogout}
        />
      </div>
    </>
  );
}
