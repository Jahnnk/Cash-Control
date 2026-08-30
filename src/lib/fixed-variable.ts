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

/**
 * Mapa nombre-normalizado → grupo efectivo, fusionando variantes de caso.
 *
 * ─── Por qué la prioridad es explícita y no "la primera que llegue" ───
 *
 * Hasta ago-2026 este mapa conservaba la primera clasificación que veía
 * ("mantener la clasificación ya vista"). Como las categorías llegan de
 * un SELECT sin ORDER BY, el orden no está garantizado: la misma
 * planilla podía salir fija en una consulta y variable en la siguiente.
 *
 * Le pasó a Centro y no era un detalle. `PLANILLA` estaba clasificada
 * como fija y `Planilla` (minúscula, sin un solo gasto, resto del
 * catálogo original) como variable. Al colisionar, S/53,598 de sueldos
 * —el gasto más fijo que existe— terminaron contando como costo
 * variable. Los costos fijos de junio quedaron en S/3,795 cuando
 * pasaban de S/14,000, y el punto de equilibrio salía irrealmente bajo.
 * Probado: ordenando A→Z daba "variable", ordenando Z→A daba "fijo".
 *
 * ─── La regla ───
 *
 *   no_operativo  >  fijo  >  variable  >  sin_clasificar
 *
 * `fijo` gana sobre `variable` a propósito: de los dos errores posibles,
 * tratar un costo fijo como variable es el caro. Hunde el margen de
 * contribución y produce un punto de equilibrio más bajo que el real —
 * o sea, dice que el negocio se sostiene vendiendo menos de lo que
 * necesita. La otra dirección solo exige de más, que es el lado seguro.
 *
 * Esto es una RED, no la solución: dos variantes del mismo nombre con
 * clasificaciones distintas siguen siendo un dato que hay que limpiar en
 * Configuración. La red evita que mientras tanto el número mienta.
 */
const PRIORIDAD: Record<EffectiveCostGroup, number> = {
  no_operativo: 3,
  fijo: 2,
  variable: 1,
  sin_clasificar: 0,
};

export function buildGroupMap(categories: FVCategoryMeta[]): Map<string, EffectiveCostGroup> {
  const map = new Map<string, EffectiveCostGroup>();
  for (const c of categories) {
    const key = normalizeCategory(c.name);
    const group = effectiveCostGroup({ excludeFromEbitda: c.excludeFromEbitda, costGroup: c.costGroup });
    const prev = map.get(key);
    if (prev === undefined || PRIORIDAD[group] > PRIORIDAD[prev]) {
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
