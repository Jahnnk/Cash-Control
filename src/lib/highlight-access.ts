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

/**
 * La sede dueña del Highlight. null = no existe (o la BD falló).
 *
 * Fail-closed y a prueba de tropiezos de Neon (cold start, blip de red):
 * un error acá NUNCA debe escapar sin atrapar. Esta función la llaman
 * varios componentes de fotos EN PARALELO cuando se abre una tarjeta con
 * Highlight — sin este try/catch, un solo fallo transitorio de conexión
 * se propaga como promesa rechazada hasta el cliente y tumba la página
 * entera (ver docs/CONTEXTO.md, incidente 11-ago-2026: "Mañana" con un
 * Highlight ya cargado disparaba el error boundary global).
 */
export async function highlightBusinessId(highlightId: string): Promise<number | null> {
  if (!/^[0-9a-f-]{36}$/i.test(highlightId)) return null;
  try {
    const rows = (await sql`
      SELECT business_id FROM highlights WHERE id = ${highlightId}
    `) as { business_id: number }[];
    return rows[0]?.business_id ?? null;
  } catch (e) {
    console.error("[highlightBusinessId] failed:", e);
    return null;
  }
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
  // Dirección completa: todo, en cualquier sede.
  if (role.kind === "full") return true;
  // Dirección del Highlight (Juani): asigna en las tres sedes, así que
  // también pone la foto de la indicación. No sube evidencia: esa la
  // entrega quien hizo el trabajo.
  if (role.kind === "highlight") return accion !== "evidencia";
  // Administrador de la sede: ve y entrega evidencia de LO SUYO.
  if (role.kind === "admin" && role.sede === bId) return accion !== "indicacion";
  return false;
}
