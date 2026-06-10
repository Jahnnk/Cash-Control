/**
 * Análisis Fijo vs Variable de egresos por período — lógica pura.
 *
 * Reglas (decisión contable de Jahnn):
 * - El grupo de cada categoría sale de cost_group (configurable) y la
 *   exclusión del EBITDA define el cubo No-operativo (canónica existente).
 * - Sin clasificar NO cuenta como fijo ni variable: se muestra aparte con
 *   aviso para que Jahnn asigne el grupo desde Configuración.
 * - Invariante: fijo + variable + sinClasificar = egresos OPERATIVOS del
 *   período (los que entran al EBITDA); noOperativo queda fuera.
 * - El matching usa normalizeCategory (igual que la exclusión canónica);
 *   si alguna variante de un nombre está excluida del EBITDA, el nombre
 *   completo cuenta como No-operativo (mismo criterio que excludedSet).
 */
import { normalizeCategory } from "./category-normalize";
import { effectiveCostGroup, type EffectiveCostGroup } from "./cost-group";

export type FVCategoryMeta = {
  name: string;
  excludeFromEbitda: boolean;
  costGroup: string | null;
};

/** Egreso ya reducido a su monto operativo (porción Atelier si es compartido). */
export type FVExpenseRow = { category: string; amount: number };

export type FVGroupDetail = { category: string; total: number };

export type FVGroup = {
  total: number;
  /** % sobre el total operativo (fijo+variable+sinClasificar). */
  pctOfOperative: number;
  detail: FVGroupDetail[];
};

export type FixedVariableReport = {
  fijo: FVGroup;
  variable: FVGroup;
  sinClasificar: FVGroup;
  /** Excluidos del EBITDA — fuera del análisis; % no aplica (queda en 0). */
  noOperativo: FVGroup;
  operativeTotal: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mapa nombre-normalizado → grupo efectivo, fusionando variantes de caso. */
export function buildGroupMap(categories: FVCategoryMeta[]): Map<string, EffectiveCostGroup> {
  const map = new Map<string, EffectiveCostGroup>();
  for (const c of categories) {
    const key = normalizeCategory(c.name);
    const group = effectiveCostGroup({ excludeFromEbitda: c.excludeFromEbitda, costGroup: c.costGroup });
    const prev = map.get(key);
    // Prioridad al fusionar variantes: no_operativo (canónica) > clasificado > sin clasificar
    if (prev === "no_operativo" || group === "no_operativo") {
      map.set(key, "no_operativo");
    } else if (prev === "fijo" || prev === "variable") {
      // mantener la clasificación ya vista
    } else {
      map.set(key, group);
    }
  }
  return map;
}

export function buildFixedVariable(
  rows: FVExpenseRow[],
  categories: FVCategoryMeta[],
): FixedVariableReport {
  const groupMap = buildGroupMap(categories);

  const buckets: Record<EffectiveCostGroup, Map<string, number>> = {
    fijo: new Map(),
    variable: new Map(),
    sin_clasificar: new Map(),
    no_operativo: new Map(),
  };

  for (const row of rows) {
    const key = normalizeCategory(row.category);
    // Categoría no catalogada → sin clasificar (no se adivina)
    const group = groupMap.get(key) ?? "sin_clasificar";
    const bucket = buckets[group];
    bucket.set(key, (bucket.get(key) ?? 0) + row.amount);
  }

  const toGroup = (m: Map<string, number>, operativeTotal: number, isOperative: boolean): FVGroup => {
    const detail = [...m.entries()]
      .map(([category, total]) => ({ category, total: r2(total) }))
      .sort((a, b) => b.total - a.total);
    const total = r2(detail.reduce((s, d) => s + d.total, 0));
    return {
      total,
      pctOfOperative: isOperative && operativeTotal > 0 ? r2((total / operativeTotal) * 100) : 0,
      detail,
    };
  };

  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  const operativeTotal = r2(sum(buckets.fijo) + sum(buckets.variable) + sum(buckets.sin_clasificar));

  return {
    fijo: toGroup(buckets.fijo, operativeTotal, true),
    variable: toGroup(buckets.variable, operativeTotal, true),
    sinClasificar: toGroup(buckets.sin_clasificar, operativeTotal, true),
    noOperativo: toGroup(buckets.no_operativo, operativeTotal, false),
    operativeTotal,
  };
}
