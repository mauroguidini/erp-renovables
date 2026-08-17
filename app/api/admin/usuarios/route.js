import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "@/lib/supabaseAdmin";

const ROLES_VALIDOS = [
  "administrador",
  "capataz",
  "jefe_obra",
  "compras",
  "administracion",
];

export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "El email no es válido" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña tiene que tener al menos 8 caracteres" },
      { status: 400 }
    );
  }
  if (!ROLES_VALIDOS.includes(role)) {
    return NextResponse.json({ error: "El rol no es válido" }, { status: 400 });
  }

  const { data: creado, error: errorCrear } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (errorCrear) {
    return NextResponse.json({ error: errorCrear.message }, { status: 400 });
  }

  const { error: errorRol } = await supabaseAdmin
    .from("profiles")
    .update({ role })
    .eq("id", creado.user.id);

  if (errorRol) {
    return NextResponse.json({ error: errorRol.message }, { status: 500 });
  }

  return NextResponse.json({ id: creado.user.id, email, role });
}
