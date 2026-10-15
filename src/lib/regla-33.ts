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

// ─────────────────────────────────────────────────────────────────
// Profit First: apartar la utilidad ANTES de gastar el resto
// ─────────────────────────────────────────────────────────────────

/**
 * Pedido de Jahnn (15-oct-2026): del EBITDA (un tercio de la venta), el 25% de la
 * venta se aparta primero para utilidades; el resto va a impuestos y reinversión.
 * Se mide con tres cifras por sede:
 *
 *   · Meta       = 25% de la venta del mes.
 *   · La operación dejó = el EBITDA (de dónde puede salir ese 25%).
 *   · Apartado   = lo que de verdad quedó guardado para los socios: lo que se mandó a
 *                  fondos mutuos, menos lo que se sacó de ahí (rescates), más las
 *                  utilidades pagadas a los socios (ese rescate las financia: sin
 *                  sumarlas, pagar utilidades parecería «des-apartar»).
 *
 * Todo sale de las filas que ya clasifica el sistema (AHORRO, UTILIDADES A SOCIOS,
 * rescates de fondos mutuos): nada nuevo que llenar.
 */
export const UTILIDAD_META_PCT = 25;

export type EstadoApartado = "cumple" | "parcial" | "sin_apartar";

export type FilaProfitFirst = {
  etiqueta: string;
  esGrupo: boolean;
  corte: string | null;
  mesCompleto: boolean;
  sinResultadoPorque: string | null;
  ventas: number | null;
  /** 25% de la venta, en soles. */
  meta: number | null;
  /** El EBITDA: lo que dejó la operación. */
  ebitda: number | null;
  /** ¿La operación dejó al menos lo de la meta? */
  operacionAlcanza: boolean | null;
  apartado: { neto: number; pct: number; ahorro: number; rescates: number; utilidadesPagadas: number } | null;
  estado: EstadoApartado | null;
  /** Lo que faltó para la meta (0 si se cumplió). */
  falta: number | null;
};

const sinNumerosPF = { ventas: null, meta: null, ebitda: null, operacionAlcanza: null, apartado: null, estado: null, falta: null } as const;

function filaPF(base: Pick<FilaProfitFirst, "etiqueta" | "esGrupo" | "corte" | "mesCompleto">, r: FilaRegla, fuera: { ahorro: number; rescate: number; reparto: number }[]): FilaProfitFirst {
  if (!r.ebitda || r.ventas === null || r.ventas <= 0) return { ...base, sinResultadoPorque: r.sinResultadoPorque ?? "Sin datos", ...sinNumerosPF };
  const meta = r2(r.ventas * (UTILIDAD_META_PCT / 100));
  const ahorro = r2(fuera.reduce((t, x) => t + x.ahorro, 0));
  const rescates = r2(fuera.reduce((t, x) => t + x.rescate, 0));
  const utilidadesPagadas = r2(fuera.reduce((t, x) => t + x.reparto, 0));
  const neto = r2(ahorro - rescates + utilidadesPagadas);
  const estado: EstadoApartado = neto >= meta ? "cumple" : neto > 0 ? "parcial" : "sin_apartar";
  return {
    ...base, sinResultadoPorque: null, ventas: r.ventas, meta, ebitda: r.ebitda.monto,
    operacionAlcanza: r.ebitda.monto >= meta,
    apartado: { neto, pct: r1((neto / r.ventas) * 100), ahorro, rescates, utilidadesPagadas },
    estado, falta: r2(Math.max(0, meta - neto)),
  };
}

/** Profit First por sede y para el Grupo (el Grupo suma solo las sedes que entran al resultado). */
export function profitFirst(c: { sedes: CifrasSede[]; grupo: CifrasGrupo }): FilaProfitFirst[] {
  const filas = regla33(c);
  return filas.map((r) => {
    const base = { etiqueta: r.etiqueta, esGrupo: r.esGrupo, corte: r.corte, mesCompleto: r.mesCompleto };
    const sedes = r.esGrupo ? c.sedes.filter((s) => s.conResultado) : c.sedes.filter((s) => s.sede === r.etiqueta);
    return filaPF(base, r, sedes.map((s) => s.fuera));
  });
}
