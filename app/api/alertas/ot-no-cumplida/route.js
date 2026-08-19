import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resend, REMITENTE_ALERTAS, destinatariosAlertas } from "@/lib/resend";
import { MOTIVOS } from "@/app/otConstants";

const SITIO_URL = "https://erp-renovables.vercel.app";

// Esta ruta la llama el Webhook de base de datos de Supabase (configurado
// en Database > Webhooks, sobre la tabla ordenes_trabajo), no un usuario
// desde el navegador. Por eso se protege con un secreto compartido en un
// header, en vez de con la sesión de alguien.
export async function POST(request) {
  const secreto = request.headers.get("x-webhook-secret");
  if (!secreto || secreto !== process.env.ALERTAS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { record, old_record: registroAnterior } = body;

  // Solo nos interesa el momento en que una OT PASA a "no_cumplida" — no
  // cada vez que se toca la fila mientras ya estaba en ese estado.
  const esTransicionANoCumplida =
    record?.estado === "no_cumplida" && registroAnterior?.estado !== "no_cumplida";

  if (!esTransicionANoCumplida) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const { data: obra } = await supabaseAdmin
    .from("obras")
    .select("id, direccion")
    .eq("id", record.obra_id)
    .maybeSingle();

  const motivoLabel =
    MOTIVOS.find((m) => m.value === record.motivo_incumplimiento)?.label ??
    record.motivo_incumplimiento ??
    "(sin motivo)";

  let destinatarios;
  try {
    destinatarios = await destinatariosAlertas();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  if (destinatarios.length === 0) {
    return NextResponse.json({ ok: true, sinDestinatarios: true });
  }

  const enlaceObra = obra ? `${SITIO_URL}/obras/${obra.id}` : SITIO_URL;

  const { error: errorEnvio } = await resend.emails.send({
    from: REMITENTE_ALERTAS,
    to: destinatarios,
    subject: `OT no cumplida — ${obra?.direccion ?? "obra"}`,
    html: `
      <p>Se marcó una orden de trabajo como <strong>no cumplida</strong>.</p>
      <ul>
        <li><strong>Obra:</strong> ${obra?.direccion ?? "(obra eliminada)"}</li>
        <li><strong>Tarea:</strong> ${record.descripcion}</li>
        <li><strong>Motivo:</strong> ${motivoLabel}${
      record.motivo_detalle ? ` — ${record.motivo_detalle}` : ""
    }</li>
      </ul>
      <p><a href="${enlaceObra}">Ver la obra</a></p>
    `,
  });

  if (errorEnvio) {
    return NextResponse.json({ error: errorEnvio.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
