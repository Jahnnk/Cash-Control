/**
 * Palancas del EBITDA · MOTOR (puro). Pedido de Jahnn (13-nov-2026): que el EBITDA deje de ser solo un dato y sea un
 * «centro de mando» con perillas, como regular la presión en una fábrica. Fase 1: un simulador que NO guarda nada.
 *
 * Cinco palancas por sede y mes:
 *   1. venta esperada (S/) · 2. costo variable (% de la venta) · 3. planilla (S/) · 4. otros fijos (S/) ·
 *   5. utilidad que se aparta (% de la venta, Profit First).
 *
 * Los seis tipos de egreso tienen un solo lugar (decisión de Jahnn, 13-nov-2026):
 *   · Variable y Fijo = el costo de operar: SOLO ellos definen el EBITDA, el punto de equilibrio y el piso.
 *   · Inversión, Financiamiento e impuestos = la «bolsa» del EBITDA (lo que queda tras apartar la utilidad).
 *   · No es gasto (ahorro, utilidades a socios) = la utilidad. Lo demás que no es gasto queda fuera de los 100.
 *   · Por conciliar = temporal; mientras exista cuenta como fijo (igual que en las seis cifras).
 *
 * El punto de partida es la REALIDAD: el promedio de los últimos meses cerrados de la sede (lib/seis-cifras.ts).
 */

import { termometroEbitda, TOPE_PLANILLA_PCT, type Termometro } from "./regla-33";

/** El Grupo va con businessId 0: las tres sedes juntas, sin lo que Atelier le vende a las cafeterías. */
export const GRUPO = 0;
/**
 * El Grupo es solo REFERENCIA (Jahnn, 14-nov-2026): las tres empresas llevan finanzas independientes y los socios tienen
 * distinto porcentaje en cada una, así que se dirige y se presupuesta por sede. Va al final y marcado.
 */
export const NOMBRE_GRUPO = "Grupo";

export type Palancas = {
  ventas: number;
  /** Costo variable como % de la venta (0–100). */
  variablePct: number;
  planilla: number;
  otrosFijos: number;
  /** % de la venta que se aparta primero como utilidad. */
  utilidadPct: number;
};

/** Un mes cerrado de una sede, tal como lo dan las seis cifras. */
export type MesBase = { mes: string; ventas: number; costos: number; gastos: number; planilla: number; /** impuestos + inversión + deudas */ bolsa: number };

export type BasePalancas = {
  palancas: Palancas;
  /** Los meses que se promediaron (del más viejo al más nuevo). */
  meses: string[];
  /** Lo que en promedio ya sale por impuestos, inversión y deudas. */
  bolsaComprometida: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const prom = (l: number[]) => l.reduce((t, x) => t + x, 0) / l.length;

/** El punto de partida: promedio de hasta `cuantos` meses cerrados más recientes. null si no hay ninguno con venta. */
export function baseDePalancas(meses: MesBase[], utilidadPct: number, cuantos = 3): BasePalancas | null {
  const utiles = meses.filter((m) => m.ventas > 0).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-cuantos);
  if (utiles.length === 0) return null;
  const ventas = prom(utiles.map((m) => m.ventas));
  const costos = prom(utiles.map((m) => m.costos));
  const gastos = prom(utiles.map((m) => m.gastos));
  const planilla = Math.min(prom(utiles.map((m) => m.planilla)), gastos);
  return {
    palancas: { ventas: r2(ventas), variablePct: r1((costos / ventas) * 100), planilla: r2(planilla), otrosFijos: r2(gastos - planilla), utilidadPct },
    meses: utiles.map((m) => m.mes),
    bolsaComprometida: r2(prom(utiles.map((m) => m.bolsa))),
  };
}

export type Lectura = {
  variables: number; fijos: number;
  ebitda: number; ebitdaPct: number; termometro: Termometro;
  planillaPct: number; planillaPasada: boolean;
  /** Venta mínima del mes para no perder: fijos ÷ (1 − variable%). null si el variable se come toda la venta. */
  equilibrio: number | null;
  /** Fórmula del coach: (fijos + costo variable del mes) ÷ 30. */
  pisoDiario: number;
  /** Lo que se aparta primero (Profit First). */
  utilidad: number;
  /** Lo que queda del EBITDA tras apartar la utilidad: para impuestos, inversión y deudas. Puede ser negativo. */
  bolsa: number;
  /** ¿La operación cabe en lo que queda después de apartar la utilidad? */
  cabe: boolean;
};

/** Lo que marcan los medidores con las palancas en esta posición. */
export function simular(p: Palancas): Lectura {
  const ventas = Math.max(0, p.ventas);
  const variables = r2(ventas * (p.variablePct / 100));
  const fijos = r2(Math.max(0, p.planilla) + Math.max(0, p.otrosFijos));
  const ebitda = r2(ventas - variables - fijos);
  const ebitdaPct = ventas > 0 ? r1((ebitda / ventas) * 100) : 0;
  const mc = 1 - p.variablePct / 100;
  const utilidad = r2(ventas * (p.utilidadPct / 100));
  const planillaPct = ventas > 0 ? r1((p.planilla / ventas) * 100) : 0;
  return {
    variables, fijos, ebitda, ebitdaPct, termometro: termometroEbitda(ebitdaPct),
    planillaPct, planillaPasada: planillaPct > TOPE_PLANILLA_PCT,
    equilibrio: mc > 0.001 ? r2(fijos / mc) : null,
    pisoDiario: r2((fijos + variables) / 30),
    utilidad, bolsa: r2(ebitda - utilidad),
    // Con 0.1 punto de tolerancia: el costo variable se mueve de a medio punto y deja céntimos de diferencia.
    cabe: ebitdaPct >= p.utilidadPct - 0.1,
  };
}

export type Camino = {
  palanca: "ventas" | "variable" | "fijos";
  /** El valor al que hay que llevar la palanca (S/ o %). null = con esta sola palanca no se llega. */
  valor: number | null;
  /** Cuánto cambia contra la posición actual (S/ o puntos). */
  cambio: number | null;
  /** true = ya está en la meta: no hay que moverla. */
  yaLlego: boolean;
};

/**
 * Para llegar a un EBITDA de `metaPct` moviendo UNA sola palanca y dejando las otras quietas:
 *   · ventas   = fijos ÷ (1 − variable% − meta%)      (vender más con los mismos fijos y el mismo costo variable)
 *   · variable = 1 − meta% − fijos ÷ ventas           (bajar el costo del producto o subir precios)
 *   · fijos    = ventas × (1 − variable% − meta%)     (recortar la estructura)
 */
export function paraLlegar(p: Palancas, metaPct: number): Camino[] {
  const v = p.variablePct / 100, m = metaPct / 100, fijos = Math.max(0, p.planilla) + Math.max(0, p.otrosFijos);
  const ya = simular(p).ebitdaPct >= metaPct;
  const margen = 1 - v - m;
  const ventas = margen > 0.001 ? r2(fijos / margen) : null;
  const variable = p.ventas > 0 ? r1((1 - m - fijos / p.ventas) * 100) : null;
  const fijosMeta = r2(p.ventas * margen);
  return [
    { palanca: "ventas", valor: ya ? r2(p.ventas) : ventas, cambio: ya ? 0 : ventas === null ? null : r2(ventas - p.ventas), yaLlego: ya },
    { palanca: "variable", valor: ya ? p.variablePct : variable !== null && variable > 0 ? variable : null, cambio: ya ? 0 : variable !== null && variable > 0 ? r1(variable - p.variablePct) : null, yaLlego: ya },
    { palanca: "fijos", valor: ya ? r2(fijos) : fijosMeta > 0 ? fijosMeta : null, cambio: ya ? 0 : fijosMeta > 0 ? r2(fijosMeta - fijos) : null, yaLlego: ya },
  ];
}
