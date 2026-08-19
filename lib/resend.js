import { Resend } from "resend";
import { supabaseAdmin } from "./supabaseAdmin";

// Solo se importa desde rutas de servidor (app/api/**/route.js). La API key
// de Resend, igual que la service_role de Supabase, nunca debe llegar al
// navegador — por eso vive en una variable de entorno sin NEXT_PUBLIC_.
export const resend = new Resend(process.env.RESEND_API_KEY);

// Mientras no verifiquemos un dominio propio en Resend, los mails tienen
// que salir desde este remitente de prueba.
export const REMITENTE_ALERTAS = "ERP Renovables <onboarding@resend.dev>";

// Devuelve los emails de todos los administradores activos — a quienes les
// llegan las 3 alertas, según lo que decidiste.
export async function emailsAdministradores() {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("role", "administrador")
    .eq("activo", true);

  if (error) {
    throw new Error(`No se pudieron obtener los emails de administradores: ${error.message}`);
  }

  return (data ?? []).map((p) => p.email);
}
