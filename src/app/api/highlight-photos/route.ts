import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { uploadPrivateBlob } from "@/lib/blob-storage";
import { validateAttachment, sanitizeFilename } from "@/lib/attachment-validation";
import {
  highlightBusinessId,
  puedeSobreHighlight,
  TIPOS_FOTO_HIGHLIGHT,
  type HighlightPhotoKind,
} from "@/lib/highlight-access";

const sql = neon(process.env.DATABASE_URL!);

export const runtime = "nodejs";

/**
 * POST /api/highlight-photos — sube una foto de un Highlight.
 *
 * Va como route handler y no como server action por el límite de ~1 MB
 * de body de las actions: las fotos del celular pesan más (tope 5 MB,
 * el mismo de las constancias de pago).
 *
 * La SEDE sale del propio Highlight, nunca de la cookie: desde /grupo,
 * `activeBusinessId()` devuelve la última sede visitada y Jahnn podría
 * terminar guardándole a Centro una foto que era para Fonavi.
 *
 * multipart/form-data: file, highlightId (uuid), kind
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const highlightId = String(form.get("highlightId") ?? "");
  const kind = String(form.get("kind") ?? "") as HighlightPhotoKind;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ninguna foto" }, { status: 400 });
  }
  if (!TIPOS_FOTO_HIGHLIGHT.includes(kind)) {
    return NextResponse.json({ error: "Tipo de foto inválido" }, { status: 400 });
  }

  const bId = await highlightBusinessId(highlightId);
  if (bId === null) {
    return NextResponse.json({ error: "Ese Highlight no existe" }, { status: 404 });
  }

  const accion = kind === "highlight_indicacion" ? "indicacion" : "evidencia";
  if (!(await puedeSobreHighlight(bId, accion))) {
    return NextResponse.json(
      {
        error:
          accion === "indicacion"
            ? "Solo dirección puede adjuntar la foto de la indicación."
            : "No tienes acceso al Highlight de esta sede.",
      },
      { status: 403 },
    );
  }

  const error = validateAttachment(file.type, file.size);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const safeName = sanitizeFilename(file.name);
  const pathname = `adjuntos/${bId}/${kind}/${highlightId}/${crypto.randomUUID()}-${safeName}`;

  try {
    await uploadPrivateBlob(pathname, await file.arrayBuffer(), file.type);
  } catch (e) {
    console.error("[highlight-photos] upload failed:", e);
    return NextResponse.json(
      { error: "No se pudo subir la foto. Intenta de nuevo." },
      { status: 502 },
    );
  }

  // La fila va DESPUÉS del blob: si esto fallara, queda un archivo suelto
  // e invisible — preferible a una fila que apunta a un archivo que no está.
  const rows = (await sql`
    INSERT INTO attachments
      (business_id, record_type, record_id, url, filename, content_type, size_bytes)
    VALUES (${bId}, ${kind}, ${highlightId}, ${pathname},
            ${file.name.slice(0, 200)}, ${file.type}, ${file.size})
    RETURNING id::text
  `) as { id: string }[];

  return NextResponse.json({ success: true, id: rows[0].id });
}
