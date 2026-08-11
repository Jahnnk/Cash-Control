/**
 * Quién puede hacer qué con las fotos de un Highlight.
 *
 * Vive acá y NO en el archivo `"use server"` a propósito: todo lo que se
 * exporta desde un archivo de acciones queda publicado como endpoint
 * llamable desde el navegador. Estos dos helpers son de uso interno
 * (los usan la action y el route handler), así que no tienen por qué
 * ser alcanzables desde afuera.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";

const sql = neon(process.env.DATABASE_URL!);

export type HighlightPhotoKind = "highlight_indicacion" | "highlight_evidencia";

export const TIPOS_FOTO_HIGHLIGHT: HighlightPhotoKind[] = [
  "highlight_indicacion",
  "highlight_evidencia",
];

/** La sede dueña del Highlight. null = no existe. */
export async function highlightBusinessId(highlightId: string): Promise<number | null> {
  if (!/^[0-9a-f-]{36}$/i.test(highlightId)) return null;
  const rows = (await sql`
    SELECT business_id FROM highlights WHERE id = ${highlightId}
  `) as { business_id: number }[];
  return rows[0]?.business_id ?? null;
}

/**
 * ¿Puede esta sesión hacer esto sobre el Highlight de esa sede?
 *
 * - ver:        dirección, o el admin de ESA sede
 * - indicacion: SOLO dirección. Si un admin pudiera subirla, podría
 *               fabricar la instrucción que supuestamente recibió.
 * - evidencia:  el admin de esa sede (y dirección, que a veces opera
 *               Atelier ella misma).
 */
export async function puedeSobreHighlight(
  bId: number,
  accion: "ver" | "indicacion" | "evidencia",
): Promise<boolean> {
  const role = await getSessionRole();
  if (!role) return false;
  if (role.kind === "full") return true;
  if (role.kind === "verif") return false;
  if (role.sede !== bId) return false;
  return accion !== "indicacion";
}
