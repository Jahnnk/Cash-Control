import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { uploadPrivateBlob } from "@/lib/blob-storage";
import { recordBelongsToBusiness, type AttachmentRecordType } from "@/app/actions/attachments";
import { validateAttachment, sanitizeFilename } from "@/lib/attachment-validation";

const sql = neon(process.env.DATABASE_URL!);

export const runtime = "nodejs";

/**
 * POST /api/attachments — sube una constancia (imagen/PDF) al Blob PRIVADO
 * y registra la fila en `attachments`.
 *
 * Va como route handler (no server action) porque las actions tienen límite
 * de body de ~1 MB y las constancias llegan hasta 5 MB. La sesión la exige
 * el middleware (cookie firmada) y el negocio sale de la cookie activa, así
 * que el rol de Kelly queda scoped a Fonavi/Centro igual que en las actions.
 *
 * multipart/form-data: file, recordType ('expense'|'income'), recordId (uuid)
 */
export async function POST(req: Request) {
  let bId: number;
  try {
    bId = await activeBusinessId();
  } catch {
    return NextResponse.json({ error: "Selecciona un negocio primero" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const recordType = String(form.get("recordType") ?? "");
  const recordId = String(form.get("recordId") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }
  if (recordType !== "expense" && recordType !== "income") {
    return NextResponse.json({ error: "Tipo de registro inválido" }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(recordId)) {
    return NextResponse.json({ error: "Registro inválido" }, { status: 400 });
  }

  const validationError = validateAttachment(file.type, file.size);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // El egreso/ingreso debe existir Y pertenecer al negocio activo (cross-tenant)
  if (!(await recordBelongsToBusiness(recordType as AttachmentRecordType, recordId, bId))) {
    return NextResponse.json({ error: "El movimiento no existe en este negocio" }, { status: 404 });
  }

  const safeName = sanitizeFilename(file.name);
  const pathname = `adjuntos/${bId}/${recordType}/${recordId}/${crypto.randomUUID()}-${safeName}`;

  try {
    await uploadPrivateBlob(pathname, await file.arrayBuffer(), file.type);
  } catch (e) {
    console.error("[attachments] upload failed:", e);
    return NextResponse.json(
      { error: "No se pudo subir el archivo al almacenamiento. Intenta de nuevo." },
      { status: 502 },
    );
  }

  // Registrar la fila DESPUÉS del blob: si esto fallara, el archivo quedaría
  // suelto en el blob (invisible, sin costo de datos) — preferible a una fila
  // que apunta a un archivo inexistente.
  const rows = (await sql`
    INSERT INTO attachments (business_id, record_type, record_id, url, filename, content_type, size_bytes)
    VALUES (${bId}, ${recordType}, ${recordId}, ${pathname}, ${file.name.slice(0, 200)}, ${file.type}, ${file.size})
    RETURNING id::text
  `) as { id: string }[];

  return NextResponse.json({ success: true, id: rows[0].id });
}
