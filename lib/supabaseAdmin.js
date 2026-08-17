import { createClient } from "@supabase/supabase-js";

// ADVERTENCIA: este cliente usa la service_role key, que ignora TODAS las
// políticas de RLS. Solo se puede importar desde archivos que corren
// exclusivamente en el servidor (app/api/**/route.js). Nunca lo importes
// desde un componente "use client" ni desde ningún archivo que termine
// empaquetado para el navegador.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Confirma que quien llama a una ruta de servidor es un administrador de
// verdad, usando SU PROPIA sesión (el token que manda en el header
// Authorization) — nunca confiando en un dato que mande el propio navegador
// diciendo "soy admin". Devuelve el usuario si es admin, o null si no.
export async function requireAdmin(request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "administrador") return null;

  return user;
}
