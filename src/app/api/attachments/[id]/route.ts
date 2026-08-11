import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { getPrivateBlobStream } from "@/lib/blob-storage";
import { puedeSobreHighlight, TIPOS_FOTO_HIGHLIGHT } from "@/lib/highlight-access";

const sql = neon(process.env.DATABASE_URL!);

export const runtime = "nodejs";

/**
 * GET /api/attachments/[id] — sirve una constancia del Blob PRIVADO a
 * través de la app (mismo origen). La sesión la exige el middleware; el
 * adjunto debe pertenecer al negocio activo (cross-tenant).
 *
 * Existe porque el host del Blob no permite CORS: el navegador puede
 * MOSTRAR la imagen con URL firmada (<img>) pero no LEERLA con fetch
 * para incrustarla en un PDF. Vía este proxy es same-origin y funciona.
 *
 * EXCEPCIÓN — fotos del Highlight: su permiso se resuelve por ROL y por
 * la sede del propio Highlight, no por la cookie de sede activa. Desde
 * /grupo/highlight Jahnn ve las tres sedes a la vez, y la cookie apunta
 * a una sola: filtrar por ella le escondería las fotos de las otras dos.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Adjunto inválido" }, { status: 400 });
  }

  const rows = (await sql`
    SELECT url AS pathname, filename, content_type, record_type, business_id
    FROM attachments WHERE id = ${id}
  `) as {
    pathname: string; filename: string; content_type: string;
    record_type: string; business_id: number;
  }[];
  if (!rows[0]) {
    return NextResponse.json({ error: "El adjunto no existe" }, { status: 404 });
  }

  if (TIPOS_FOTO_HIGHLIGHT.includes(rows[0].record_type as never)) {
    if (!(await puedeSobreHighlight(rows[0].business_id, "ver"))) {
      return NextResponse.json({ error: "Sin acceso a esta foto" }, { status: 403 });
    }
  } else {
    // Constancias de pago: se mantiene el candado por negocio activo.
    let bId: number;
    try {
      bId = await activeBusinessId();
    } catch {
      return NextResponse.json({ error: "Selecciona un negocio primero" }, { status: 400 });
    }
    if (rows[0].business_id !== bId) {
      return NextResponse.json({ error: "El adjunto no existe en este negocio" }, { status: 404 });
    }
  }

  const stream = await getPrivateBlobStream(rows[0].pathname);
  if (!stream) {
    return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 502 });
  }
  return new Response(stream, {
    headers: {
      "Content-Type": rows[0].content_type,
      "Content-Disposition": `inline; filename="${rows[0].filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
