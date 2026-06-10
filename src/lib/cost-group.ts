/**
 * Clasificación Fijo/Variable de categorías de egreso (análisis de gestión).
 *
 * - `cost_group` en expense_categories: 'fijo' | 'variable' | NULL.
 * - El grupo NO OPERATIVO no se guarda ahí: lo define el flag canónico
 *   exclude_from_ebitda (la misma exclusión del EBITDA — no inventar otra).
 * - NULL y no excluida = "sin clasificar": no cuenta como fijo ni variable
 *   hasta que Jahnn la asigne desde Configuración.
 *
 * Regla rectora (metodología de pricing de Yayi's): variable = sube/baja
 * directo con ventas/producción; fijo = no cambia con el volumen.
 */

export type CostGroup = "fijo" | "variable";

export type EffectiveCostGroup = "fijo" | "variable" | "no_operativo" | "sin_clasificar";

export const COST_GROUP_LABELS: Record<EffectiveCostGroup, string> = {
  fijo: "Fijo",
  variable: "Variable",
  no_operativo: "No operativo",
  sin_clasificar: "Sin clasificar",
};

export function isValidCostGroup(v: unknown): v is CostGroup {
  return v === "fijo" || v === "variable";
}

/**
 * Grupo efectivo de una categoría. La exclusión del EBITDA SIEMPRE gana:
 * una categoría excluida es No-operativa aunque tuviera cost_group seteado.
 */
export function effectiveCostGroup(cat: {
  excludeFromEbitda: boolean;
  costGroup: string | null;
}): EffectiveCostGroup {
  if (cat.excludeFromEbitda) return "no_operativo";
  if (cat.costGroup === "fijo" || cat.costGroup === "variable") return cat.costGroup;
  return "sin_clasificar";
}

/** Categorías activas que requieren asignación (para el señalador en config). */
export function unclassifiedCategories<
  T extends { name: string; isActive: boolean; excludeFromEbitda: boolean; costGroup: string | null },
>(categories: T[]): T[] {
  return categories.filter(
    (c) => c.isActive && effectiveCostGroup(c) === "sin_clasificar",
  );
}
