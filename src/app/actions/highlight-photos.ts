"use server";

/**
 * Fotos del Highlight diario — pedido de Jahnn, 10-ago-2026.
 *
 * Dos tipos, con dueños distintos y a propósito:
 *
 *   · `highlight_indicacion` — la sube DIRECCIÓN al asignar. "Mira esta
 *     vitrina, quiero que quede así". Es contexto del encargo.
 *   · `highlight_evidencia`  — la sube el ADMINISTRADOR al cumplir.
 *     Es la prueba de que se hizo.
 *
 * Se guardan en la MISMA tabla `attachments` que las constancias de
 * pago (mismo blob privado, mismo proxy de lectura). No hizo falta
 * migración: `record_type` es texto libre y `record_id` ya es uuid,
 * igual que `highlights.id`.
 *
 * OJO CON LA SEDE (lección aprendida — ver docs/CONTEXTO.md §5.6):
 * acá NO se usa `activeBusinessId()`. Desde /grupo esa función cae a la
 * cookie de la última sede visitada, así que Jahnn asignándole una foto
 * a Centro podría terminar guardándola en Fonavi. La sede sale SIEMPRE
 * de la fila del propio Highlight.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { deletePrivateBlob } from "@/lib/blob-storage";
import {
  highlightBusinessId,
  puedeSobreHighlight,
  type HighlightPhotoKind,
} from "@/lib/highlight-access";

const sql = neon(process.env.DATABASE_URL!);

export type { HighlightPhotoKind };

export type HighlightPhoto = {
  id: string;
  kind: HighlightPhotoKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** Proxy same-origin; exige sesión. */
  url: string;
};

export async function listHighlightPhotos(highlightId: string): Promise<HighlightPhoto[]> {
  const bId = await highlightBusinessId(highlightId);
  if (bId === null) return [];
  if (!(await puedeSobreHighlight(bId, "ver"))) return [];

  try {
    const rows = (await sql`
      SELECT id::text, record_type, filename, content_type, size_bytes::int, created_at::text
      FROM attachments
      WHERE record_id = ${highlightId}
        AND record_type IN ('highlight_indicacion', 'highlight_evidencia')
      ORDER BY created_at ASC
    `) as {
      id: string; record_type: string; filename: string;
      content_type: string; size_bytes: number; created_at: string;
    }[];

    return rows.map((r) => ({
      id: r.id,
      kind: r.record_type as HighlightPhotoKind,
      filename: r.filename,
      contentType: r.content_type,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      url: `/api/attachments/${r.id}`,
    }));
  } catch (e) {
    console.error("[listHighlightPhotos] failed:", e);
    return [];
  }
}

/** Cuántas fotos tiene cada Highlight, para pintar el contador sin abrir. */
export async function contarFotosHighlights(
  ids: string[],
): Promise<Record<string, { indicacion: number; evidencia: number }>> {
  const limpios = (ids ?? []).filter((i) => /^[0-9a-f-]{36}$/i.test(i));
  if (limpios.length === 0) return {};
  try {
    const rows = (await sql`
      SELECT record_id::text, record_type, COUNT(*)::int AS n
      FROM attachments
      WHERE record_id = ANY(${limpios}::uuid[])
        AND record_type IN ('highlight_indicacion', 'highlight_evidencia')
      GROUP BY record_id, record_type
    `) as { record_id: string; record_type: string; n: number }[];

    const out: Record<string, { indicacion: number; evidencia: number }> = {};
    for (const r of rows) {
      out[r.record_id] ??= { indicacion: 0, evidencia: 0 };
      if (r.record_type === "highlight_indicacion") out[r.record_id].indicacion = r.n;
      else out[r.record_id].evidencia = r.n;
    }
    return out;
  } catch (e) {
    console.error("[contarFotosHighlights] failed:", e);
    return {};
  }
}

/**
 * Borrar una foto. Quien la puede borrar sale del TIPO, no de quién la
 * subió: la indicación es de dirección y el admin no debería poder
 * quitarse de encima la instrucción que recibió.
 */
export async function borrarFotoHighlight(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Foto inválida." };

  const rows = (await sql`
    SELECT a.url AS pathname, a.record_type, a.record_id::text, h.business_id
    FROM attachments a
    JOIN highlights h ON h.id = a.record_id
    WHERE a.id = ${id}
      AND a.record_type IN ('highlight_indicacion', 'highlight_evidencia')
  `) as { pathname: string; record_type: string; record_id: string; business_id: number }[];

  const fila = rows[0];
  if (!fila) return { ok: false, error: "La foto ya no existe." };

  const accion = fila.record_type === "highlight_indicacion" ? "indicacion" : "evidencia";
  if (!(await puedeSobreHighlight(fila.business_id, accion))) {
    return { ok: false, error: "No puedes borrar esta foto." };
  }

  try {
    await deletePrivateBlob(fila.pathname);
  } catch (e) {
    console.error("[borrarFotoHighlight] blob:", e);
    return { ok: false, error: "No se pudo borrar el archivo. Intenta de nuevo." };
  }
  await sql`DELETE FROM attachments WHERE id = ${id}`;
  revalidatePath("/", "layout");
  return { ok: true };
}
