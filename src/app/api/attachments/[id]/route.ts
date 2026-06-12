import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { getPrivateBlobStream } from "@/lib/blob-storage";

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
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Adjunto inválido" }, { status: 400 });
  }
  let bId: number;
  try {
    bId = await activeBusinessId();
  } catch {
    return NextResponse.json({ error: "Selecciona un negocio primero" }, { status: 400 });
  }

  const rows = (await sql`
    SELECT url AS pathname, filename, content_type
    FROM attachments WHERE id = ${id} AND business_id = ${bId}
  `) as { pathname: string; filename: string; content_type: string }[];
  if (!rows[0]) {
    return NextResponse.json({ error: "El adjunto no existe en este negocio" }, { status: 404 });
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
