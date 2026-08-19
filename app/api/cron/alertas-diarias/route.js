import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resend, REMITENTE_ALERTAS, emailsAdministradores } from "@/lib/resend";

const SITIO_URL = "https://erp-renovables.vercel.app";

async function stockBajoMinimo() {
  const { data, error } = await supabaseAdmin
    .from("stock")
    .select("cantidad, productos(id, nombre, stock_minimo)");

  if (error) throw new Error(error.message);

  const totalesPorProducto = {};
  (data ?? []).forEach((fila) => {
    const producto = fila.productos;
    if (!producto) return;
    const actual = totalesPorProducto[producto.id] ?? {
      nombre: producto.nombre,
      stockMinimo: producto.stock_minimo,
      total: 0,
    };
    actual.total += Number(fila.cantidad);
    totalesPorProducto[producto.id] = actual;
  });

  return Object.values(totalesPorProducto).filter((p) => p.total < p.stockMinimo);
}

async function hitosVencidos() {
  const hoy = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("hitos")
    .select("id, nombre, fecha_objetivo, obras(id, direccion)")
    .neq("estado", "cumplido")
    .lt("fecha_objetivo", hoy);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Esta ruta la llama el cron de Vercel (ver vercel.json), no un usuario. Se
// protege con el CRON_SECRET, siguiendo la convención propia de Vercel:
// manda "Authorization: Bearer <CRON_SECRET>" solo en las llamadas que
// dispara el cron.
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const [productosBajoMinimo, hitosVencidosLista] = await Promise.all([
    stockBajoMinimo(),
    hitosVencidos(),
  ]);

  if (productosBajoMinimo.length === 0 && hitosVencidosLista.length === 0) {
    return NextResponse.json({ ok: true, sinNovedades: true });
  }

  let destinatarios;
  try {
    destinatarios = await emailsAdministradores();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  if (destinatarios.length === 0) {
    return NextResponse.json({ ok: true, sinDestinatarios: true });
  }

  const seccionStock =
    productosBajoMinimo.length === 0
      ? ""
      : `
        <h3>Stock bajo mínimo (${productosBajoMinimo.length})</h3>
        <ul>
          ${productosBajoMinimo
            .map(
              (p) =>
                `<li>${p.nombre}: ${p.total} (mínimo ${p.stockMinimo})</li>`
            )
            .join("")}
        </ul>
      `;

  const seccionHitos =
    hitosVencidosLista.length === 0
      ? ""
      : `
        <h3>Hitos vencidos sin cerrar (${hitosVencidosLista.length})</h3>
        <ul>
          ${hitosVencidosLista
            .map(
              (h) =>
                `<li>${h.obras?.direccion ?? "(obra)"} — ${h.nombre} (vencía el ${h.fecha_objetivo})</li>`
            )
            .join("")}
        </ul>
      `;

  await resend.emails.send({
    from: REMITENTE_ALERTAS,
    to: destinatarios,
    subject: "Resumen diario de alertas — ERP Renovables",
    html: `
      <p>Resumen de hoy:</p>
      ${seccionStock}
      ${seccionHitos}
      <p><a href="${SITIO_URL}">Ir al sistema</a></p>
    `,
  });

  return NextResponse.json({ ok: true, productosBajoMinimo: productosBajoMinimo.length, hitosVencidos: hitosVencidosLista.length });
}
