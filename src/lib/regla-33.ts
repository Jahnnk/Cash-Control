/**
 * La regla del 33-33-33 y el EBITDA como termómetro · MOTOR (puro).
 *
 * Pedido de Jahnn (15-oct-2026), de una asesoría con su coach de negocios: de
 * cada S/ 100 que se venden,
 *
 *   · un tercio a COSTOS VARIABLES  (lo que sube y baja con la venta: insumos,
 *                                    lo que se le compra a Atelier, empaques…)
 *   · un tercio a COSTOS FIJOS      (planilla, alquiler, servicios; la planilla,
 *                                    máximo 25% de la venta)
 *   · un tercio de EBITDA           (lo que queda de la operación)
 *
 * El EBITDA no es contabilidad: es un termómetro de qué tan eficiente es la
 * operación. En gastronomía, 8–10% es una operación frágil; 30–35% es un modelo
 * eficiente, listo para crecer.
 *
 * No hay un cálculo nuevo: sale de las seis cifras (lib/seis-cifras.ts).
 *
 *   Costos variables = «Costos»      (todo lo que sube y baja con la venta)
 *   Costos fijos     = «Gastos»      (incluye lo no clasificado, como en el punto de equilibrio)
 *   EBITDA           = Ventas − Costos − Gastos  = Ganancia real + Impuestos
 *
 * Como los tres tercios suman 100, lo que le falta al EBITDA para llegar a su
 * tercio es exactamente lo que los costos y los gastos se pasaron de su tercio.
 */

import type { CifrasSede, CifrasGrupo } from "./seis-cifras";

/** Cada bloque de la regla es un tercio de la venta. */
export const META_BLOQUE_PCT = 100 / 3;
/** Tope de la planilla dentro de los costos fijos (% de la venta). */
export const TOPE_PLANILLA_PCT = 25;
/** Termómetro del EBITDA: menos de 10% = frágil; 30% o más = eficiente. */
export const EBITDA_FRAGIL_PCT = 10;
export const EBITDA_EFICIENTE_PCT = 30;

export type Termometro = "fragil" | "en_camino" | "eficiente";

export function termometroEbitda(pct: number): Termometro {
  if (pct < EBITDA_FRAGIL_PCT) return "fragil";
  if (pct < EBITDA_EFICIENTE_PCT) return "en_camino";
  return "eficiente";
}

export const ETIQUETA_TERMOMETRO: Record<Termometro, string> = { fragil: "Frágil", en_camino: "En camino", eficiente: "Eficiente" };

export type Bloque = {
  monto: number;
  /** % de la venta, con 1 decimal. */
  pct: number;
  /** Lo que valdría el tercio de esa venta. */
  meta: number;
  /** Cuánto se pasó (+) o cuánto sobra (−) respecto de la meta; en el EBITDA, al revés: lo que falta (+) o lo que supera (−). */
  difMeta: number;
};

export type FilaRegla = {
  etiqueta: string;
  esGrupo: boolean;
  corte: string | null;
  mesCompleto: boolean;
  /** null = sin base para calcular (se dice por qué). */
  sinResultadoPorque: string | null;
  ventas: number | null;
  costos: Bloque | null;
  fijos: Bloque | null;
  ebitda: Bloque | null;
  termometro: Termometro | null;
  planilla: { monto: number; pct: number; pasaDelTope: boolean } | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function bloque(monto: number, ventas: number): Bloque {
  const meta = r2(ventas * (META_BLOQUE_PCT / 100));
  return { monto: r2(monto), pct: r1((monto / ventas) * 100), meta, difMeta: r2(monto - meta) };
}

/** Arma las tres partes con una venta, costos y gastos ya decididos. */
function armar(ventas: number, costos: number, gastos: number, planilla: number) {
  const ebitda = ventas - costos - gastos;
  const b = bloque(ebitda, ventas);
  return {
    costos: bloque(costos, ventas),
    fijos: bloque(gastos, ventas),
    // En el EBITDA, positivo = falta para la meta.
    ebitda: { ...b, difMeta: r2(b.meta - ebitda) },
    termometro: termometroEbitda((ebitda / ventas) * 100),
    planilla: { monto: r2(planilla), pct: r1((planilla / ventas) * 100), pasaDelTope: (planilla / ventas) * 100 > TOPE_PLANILLA_PCT },
  };
}

const sinNumeros = { costos: null, fijos: null, ebitda: null, termometro: null, planilla: null } as const;

function deSede(s: CifrasSede): FilaRegla {
  const base = { etiqueta: s.sede, esGrupo: false, corte: s.corte, mesCompleto: s.mesCompleto };
  if (!s.conResultado || s.ventas === null || s.ventas <= 0) {
    return { ...base, sinResultadoPorque: s.sinResultadoPorque ?? "Sin datos", ventas: s.ventas, ...sinNumeros };
  }
  return { ...base, sinResultadoPorque: null, ventas: s.ventas, ...armar(s.ventas, s.costos, s.gastos, s.planilla) };
}

function delGrupo(g: CifrasGrupo): FilaRegla {
  const base = { etiqueta: "Grupo", esGrupo: true, corte: null, mesCompleto: !g.provisional };
  if (g.ganancia === null) {
    return { ...base, sinResultadoPorque: g.sinResultado.map((x) => `${x.sede}: ${x.porque}`).join(" · ") || "Sin datos", ventas: g.ventas, ...sinNumeros };
  }
  // La venta del grupo que entra al resultado (las sedes sin resultado y la venta interna ya están fuera):
  // Ganancia = Venta − Costos − Gastos − Impuestos.
  const ventasResultado = g.ganancia + g.costos + g.gastos + g.impuestos;
  return { ...base, sinResultadoPorque: null, ventas: r2(ventasResultado), ...armar(ventasResultado, g.costos, g.gastos, g.planilla) };
}

const ORDEN = [2, 3, 1];

/** Las filas de la regla: Fonavi, Centro, Atelier y Grupo. */
export function regla33(c: { sedes: CifrasSede[]; grupo: CifrasGrupo }): FilaRegla[] {
  const sedes = ORDEN.map((id) => c.sedes.find((s) => s.businessId === id)).filter((s): s is CifrasSede => !!s).map(deSede);
  return [...sedes, delGrupo(c.grupo)];
}

/** Para qué sirve la parte que falta: la frase que dice dónde está la diferencia con la meta. */
export function dondeFalta(f: FilaRegla): { llegaAlTercio: boolean; masCostos: number; masFijos: number } | null {
  if (!f.ebitda || !f.costos || !f.fijos) return null;
  return {
    llegaAlTercio: f.ebitda.difMeta <= 0,
    masCostos: Math.max(0, f.costos.difMeta),
    masFijos: Math.max(0, f.fijos.difMeta),
  };
}
