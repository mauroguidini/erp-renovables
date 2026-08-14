"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Sidebar from "./Sidebar";
import { RoleContext } from "./RoleContext";

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [role, setRole] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(undefined);
      return;
    }

    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setRole(data?.role ?? "capataz"));
  }, [session]);

  useEffect(() => {
    if (session === undefined) return;

    if (!session && pathname !== "/login") {
      router.replace("/login");
    } else if (session && pathname === "/login") {
      router.replace("/");
    }
  }, [session, pathname, router]);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Cargando...
      </div>
    );
  }

  if (!session) {
    return pathname === "/login" ? children : null;
  }

  if (pathname === "/login") {
    return null;
  }

  if (role === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Cargando...
      </div>
    );
  }

  return (
    <RoleContext.Provider value={role}>
      <Sidebar session={session} role={role} />
      <div className="md:pl-64 print:pl-0">{children}</div>
    </RoleContext.Provider>
  );
}
