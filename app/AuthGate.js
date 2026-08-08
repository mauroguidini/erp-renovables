"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import NavBar from "./NavBar";

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState(undefined);

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

  return (
    <>
      <NavBar session={session} />
      {children}
    </>
  );
}
