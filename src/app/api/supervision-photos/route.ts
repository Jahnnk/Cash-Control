import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { uploadPrivateBlob } from "@/lib/blob-storage";
import { validateAttachment, sanitizeFilename } from "@/lib/attachment-validation";
import {
  observacionBusinessId, sesionPuede, accionDeFoto, TIPOS_FOTO_SUPERVISION,
  type TipoFotoSupervision,
} from "@/lib/supervision-access";

const sql = neon(process.env.DATABASE_URL!);

export const runtime = "nodejs";

/**
 * POST /api/supervision-photos — sube una foto de una observación.
 *
 * Route handler y no server action por el límite de ~1 MB de las
 * actions (mismo motivo que /api/highlight-photos).
 *
 *   · supervision_problema   — la sube Juani: "así lo encontré".
 *   · supervision_correccion — la sube el administrador: "así quedó".
 *     Solo mientras la observación esté abierta; después es la prueba
 *     que Juani está revisando.
 *
 * La sede sale de la observación, nunca de la cookie.
 * multipart/form-data: file, observacionId (uuid), tipo
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const obsId = String(form.get("observacionId") ?? "");
  const tipo = String(form.get("tipo") ?? "") as TipoFotoSupervision;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ninguna foto" }, { status: 400 });
  }
  if (!TIPOS_FOTO_SUPERVISION.includes(tipo)) {
    return NextResponse.json({ error: "Tipo de foto inválido" }, { status: 400 });
  }
  const bId = await observacionBusinessId(obsId);
  if (bId === null) {
    return NextResponse.json({ error: "Esa observación no existe" }, { status: 404 });
  }
  if (!(await sesionPuede(bId, accionDeFoto(tipo))).ok) {
    return NextResponse.json(
      { error: tipo === "supervision_problema" ? "Solo Juani o dirección suben la foto del problema." : "Solo el administrador de la sede sube la foto de la corrección." },
      { status: 403 },
    );
  }
  if (tipo === "supervision_correccion") {
    const rows = (await sql`SELECT estado FROM supervision_observations WHERE id = ${obsId}`) as { estado: string }[];
    if (rows[0]?.estado !== "abierta") {
      return NextResponse.json({ error: "Esta observación ya no está abierta." }, { status: 409 });
    }
  }

  const error = validateAttachment(file.type, file.size);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const pathname = `adjuntos/${bId}/${tipo}/${obsId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  try {
    await uploadPrivateBlob(pathname, await file.arrayBuffer(), file.type);
  } catch (e) {
    console.error("[supervision-photos] upload failed:", e);
    return NextResponse.json({ error: "No se pudo subir la foto. Intenta de nuevo." }, { status: 502 });
  }

  // La fila va DESPUÉS del blob: mejor un archivo suelto que una fila que apunta a nada.
  const rows = (await sql`
    INSERT INTO attachments (business_id, record_type, record_id, url, filename, content_type, size_bytes)
    VALUES (${bId}, ${tipo}, ${obsId}, ${pathname}, ${file.name.slice(0, 200)}, ${file.type}, ${file.size})
    RETURNING id::text
  `) as { id: string }[];

  return NextResponse.json({ success: true, id: rows[0].id });
}
