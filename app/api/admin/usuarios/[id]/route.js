import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request, { params }) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.activo !== "boolean") {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const { activo } = body;

  if (id === admin.id) {
    return NextResponse.json(
      { error: "No podés desactivar tu propio usuario" },
      { status: 400 }
    );
  }

  if (!activo) {
    const { data: objetivo, error: errorObjetivo } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", id)
      .single();

    if (errorObjetivo) {
      return NextResponse.json({ error: errorObjetivo.message }, { status: 400 });
    }

    if (objetivo.role === "administrador") {
      const { count, error: errorConteo } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "administrador")
        .eq("activo", true)
        .neq("id", id);

      if (errorConteo) {
        return NextResponse.json({ error: errorConteo.message }, { status: 500 });
      }
      if (!count) {
        return NextResponse.json(
          { error: "No podés desactivar al único administrador activo" },
          { status: 400 }
        );
      }
    }
  }

  const { error: errorBan } = await supabaseAdmin.auth.admin.updateUserById(id, {
    ban_duration: activo ? "none" : "876000h",
  });

  if (errorBan) {
    return NextResponse.json({ error: errorBan.message }, { status: 400 });
  }

  const { error: errorActivo } = await supabaseAdmin
    .from("profiles")
    .update({ activo })
    .eq("id", id);

  if (errorActivo) {
    return NextResponse.json({ error: errorActivo.message }, { status: 500 });
  }

  return NextResponse.json({ id, activo });
}
