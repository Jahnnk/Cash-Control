"use server";

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSignedReadUrl, deletePrivateBlob } from "@/lib/blob-storage";

const sql = neon(process.env.DATABASE_URL!);

export type AttachmentRecordType = "expense" | "income";

export type AttachmentItem = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** URL firmada temporal (~10 min). NO persistir: pedir de nuevo al expirar. */
  signedUrl: string;
};

/** El registro (egreso/ingreso) debe pertenecer al negocio activo. */
async function recordBelongsToBusiness(
  recordType: AttachmentRecordType,
  recordId: string,
  bId: number,
): Promise<boolean> {
  const rows =
    recordType === "expense"
      ? await sql`SELECT 1 FROM expenses WHERE id = ${recordId} AND business_id = ${bId}`
      : await sql`SELECT 1 FROM bank_income_items WHERE id = ${recordId} AND business_id = ${bId}`;
  return (rows as unknown[]).length > 0;
}

export async function listAttachments(
  recordType: AttachmentRecordType,
  recordId: string,
): Promise<AttachmentItem[]> {
  const bId = await activeBusinessId();
  const rows = (await sql`
    SELECT id::text, url AS pathname, filename, content_type, size_bytes::int, created_at::text
    FROM attachments
    WHERE business_id = ${bId} AND record_type = ${recordType} AND record_id = ${recordId}
    ORDER BY created_at ASC
  `) as { id: string; pathname: string; filename: string; content_type: string; size_bytes: number; created_at: string }[];

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      filename: r.filename,
      contentType: r.content_type,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      signedUrl: await getSignedReadUrl(r.pathname),
    })),
  );
}

/** Conteos en lote para pintar el clip 📎 del feed con UNA sola query. */
export async function getAttachmentCounts(
  recordType: AttachmentRecordType,
  recordIds: string[],
): Promise<Record<string, number>> {
  if (recordIds.length === 0) return {};
  const bId = await activeBusinessId();
  const rows = (await sql`
    SELECT record_id::text, COUNT(*)::int AS n
    FROM attachments
    WHERE business_id = ${bId} AND record_type = ${recordType}
      AND record_id = ANY(${recordIds}::uuid[])
    GROUP BY record_id
  `) as { record_id: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.record_id, r.n]));
}

/**
 * Elimina archivo + fila. Orden: primero el blob (del es idempotente),
 * después la fila. Si la fila fallara tras borrar el blob, reintentar
 * converge (el del de un blob inexistente no falla) — sin huérfanos.
 */
export async function deleteAttachment(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const bId = await activeBusinessId();
  const rows = (await sql`
    SELECT url AS pathname FROM attachments
    WHERE id = ${id} AND business_id = ${bId}
  `) as { pathname: string }[];
  if (!rows[0]) return { success: false, error: "El adjunto ya no existe" };

  try {
    await deletePrivateBlob(rows[0].pathname);
  } catch (e) {
    return {
      success: false,
      error: "No se pudo eliminar el archivo del almacenamiento. Intenta de nuevo." +
        (e instanceof Error ? ` (${e.message})` : ""),
    };
  }
  await sql`DELETE FROM attachments WHERE id = ${id} AND business_id = ${bId}`;
  revalidatePath("/", "layout");
  return { success: true };
}

export { recordBelongsToBusiness };
