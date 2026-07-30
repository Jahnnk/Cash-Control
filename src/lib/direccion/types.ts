/**
 * Sistema de Dirección (ASDR CORE) — el tablero con el que se dirige.
 *
 * Seis bloques, cada uno respondiendo una pregunta del CEO:
 *   objetivo → ¿a dónde vamos este año?
 *   numero   → ¿qué cifras mandan y cómo van contra su meta?
 *   salud    → ¿qué partes del sistema funcionan solas y cuáles no?
 *   persona  → ¿quién responde por qué?
 *   decision → ¿qué decidí, qué debo decidir, qué delegué?
 *   alerta   → los principios que evitan autoengaños.
 *
 * TODO es editable: las metas son del negocio de cada quien.
 */

export const BLOCKS = ["objetivo", "numero", "salud", "persona", "decision", "alerta"] as const;
export type Block = (typeof BLOCKS)[number];

export type SaludStatus = "bien" | "atencion" | "roto";
export type DecisionStatus = "tomada" | "pendiente" | "delegada";

export const SALUD_STATUS: SaludStatus[] = ["bien", "atencion", "roto"];
export const DECISION_STATUS: DecisionStatus[] = ["tomada", "pendiente", "delegada"];

/**
 * Métricas que el sistema calcula SOLO. Todo lo que no esté aquí se
 * escribe a mano — preferible a inventar un cálculo que nadie audite.
 */
export const METRIC_KEYS = [
  "ventas_mes_grupo",
  "ventas_delta_pct",
  "margen_mes_grupo",
  "margen_pct_grupo",
  "liquidez_grupo",
  "equilibrio_pct_grupo",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, { label: string; unit: string; hint: string }> = {
  ventas_mes_grupo: { label: "Ventas del mes (grupo)", unit: "S/", hint: "Suma de las 3 sedes en el mes en curso." },
  ventas_delta_pct: { label: "Variación de ventas vs mes pasado", unit: "%", hint: "Solo días con dato en ambos meses." },
  margen_mes_grupo: { label: "Margen del mes (grupo)", unit: "S/", hint: "Ingresos − gastos del mes." },
  margen_pct_grupo: { label: "Margen sobre ventas", unit: "%", hint: "Margen ÷ ventas del mes." },
  liquidez_grupo: { label: "Liquidez (banco + caja)", unit: "S/", hint: "Saldo disponible de las 3 sedes." },
  equilibrio_pct_grupo: { label: "Avance del punto de equilibrio", unit: "%", hint: "Cuánto del costo del mes ya está cubierto." },
};

export function isMetricKey(v: string): v is MetricKey {
  return (METRIC_KEYS as readonly string[]).includes(v);
}

export type DireccionItem = {
  id: string;
  block: Block;
  position: number;
  title: string;
  detail: string | null;
  status: string | null;
  metricKey: MetricKey | null;
  manualValue: number | null;
  targetValue: number | null;
  targetUnit: string | null;
  higherIsBetter: boolean;
};

/** Un "número que manda" ya resuelto: valor real + cómo va contra la meta. */
export type NumeroResuelto = DireccionItem & {
  /** Valor actual (del sistema si es automático, o el escrito a mano). */
  value: number | null;
  /** true = el valor lo calculó el sistema. */
  automatico: boolean;
  /** Semáforo contra la meta; null si falta valor o meta. */
  semaforo: "verde" | "ambar" | "rojo" | null;
  /** % de cumplimiento de la meta (100 = en meta). */
  cumplimientoPct: number | null;
};
