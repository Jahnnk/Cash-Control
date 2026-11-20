"use server";

/**
 * Ajustes que la dirección prende y apaga desde la app (tabla `app_settings`, 20-nov-2026).
 *
 * Primer ajuste: el Highlight. Jahnn lo archivó el 20-nov-2026 («ya son 3 meses que nadie lo usa»), sin
 * borrarlo: su historial queda guardado y él lo reactiva en Grupo → Highlight. Sin fila (o sin tabla) se
 * toma como ARCHIVADO: si algo falla al leer, el panel no le vuelve a mostrar a nadie una tarea vieja.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole } from "@/lib/session-access";

const sql = neon(process.env.DATABASE_URL!);
const CLAVE_HIGHLIGHT = "highlight_activo";

/** ¿El Highlight está en uso? Cualquier sesión puede preguntarlo (decide qué se ve en el panel). */
export async function getHighlightActivo(): Promise<boolean> {
  if (!(await getSessionRole())) return false;
  try {
    const r = (await sql`SELECT value FROM app_settings WHERE key = ${CLAVE_HIGHLIGHT}`) as { value: unknown }[];
    return r[0]?.value === true;
  } catch {
    return false;
  }
}

/** Prender o apagar el Highlight. Solo la dirección (llave maestra). */
export async function setHighlightActivo(activo: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo la dirección puede cambiar esto." };
  const quien = role.quien === "kelly" ? "Kelly" : "Jahnn";
  try {
    await sql`INSERT INTO app_settings (key, value, updated_at, updated_by)
              VALUES (${CLAVE_HIGHLIGHT}, ${JSON.stringify(activo)}::jsonb, now(), ${quien})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`;
  } catch (e) {
    console.error("[setHighlightActivo] failed:", e);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
