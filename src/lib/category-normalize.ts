/**
 * Normaliza el nombre de categoría para que variantes por mayúsculas/
 * minúsculas ("ALQUILER" vs "Alquiler") se consoliden en una sola línea.
 * Title-case por palabra. Se aplica de forma consistente a egresos,
 * presupuestos, categorías excluidas del EBITDA y al análisis
 * Fijo/Variable, para que los joins por nombre no se fragmenten.
 * (Extraída de export-report.ts — única fuente de verdad.)
 */
export function normalizeCategory(c: unknown): string {
  const t = String(c ?? "").trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
