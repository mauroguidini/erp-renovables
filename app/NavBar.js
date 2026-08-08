"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const LINKS = [
  { href: "/", label: "Productos" },
  { href: "/depositos", label: "Depósitos" },
  { href: "/proveedores", label: "Proveedores" },
  { href: "/compras", label: "Compras" },
  { href: "/stock", label: "Stock" },
];

export default function NavBar({ session }) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <nav className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-8 py-3">
        <div className="flex gap-6">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">{session?.user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </nav>
  );
}
