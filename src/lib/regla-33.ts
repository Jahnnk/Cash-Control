/**
 * La regla del 33-33-33, el EBITDA como termómetro y Profit First · MOTOR (puro).
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
 *
 * PROFIT FIRST (mismo día): la utilidad se aparta PRIMERO, no con lo que sobre.
 *   1. Del 1 al 7 del mes siguiente se separa el 25% (ajustable) de la venta a la
 *      cuenta de la utilidad (los fondos mutuos). Es intocable.
 *   2. La operación completa vive con el 75% restante. Si no alcanza, el problema
 *      es de EFICIENCIA (costos, procesos), no de ventas bajas: no se arregla vendiendo más.
 *   3. El 25% sale del EBITDA objetivo (33%, ajustable): el resto (~8%) es para impuestos y
 *      reinversión. El sueldo de los socios no debería esconderse en los costos fijos: se
 *      paga de la utilidad. Hoy está DENTRO de la planilla (decisión de Jahnn); un interruptor
 *      lo saca del EBITDA cuando quiera (`sociosDeUtilidad`).
 */

import type { CifrasSede, CifrasGrupo } from "./seis-cifras";

/** Lo que el CEO puede ajustar (Reportes → Profit First). */
export type ConfigProfitFirst = {
  /** % de la venta que se aparta para utilidades. */
  utilidadPct: number;
  /** EBITDA objetivo (% de la venta); costos variables y fijos se reparten el resto por igual. */
  ebitdaPct: number;
  /** true = el sueldo de los socios sale del EBITDA y se paga de la utilidad; false = sigue en planilla (hoy). */
  sociosDeUtilidad: boolean;
};

export const CONFIG_PROFIT_FIRST: ConfigProfitFirst = { utilidadPct: 25, ebitdaPct: 100 / 3, sociosDeUtilidad: false };

/** Valida lo que escribe el CEO: devuelve el motivo si no vale. */
export function validarConfig(c: ConfigProfitFirst): string | null {
  if (!Number.isFinite(c.utilidadPct) || c.utilidadPct <= 0 || c.utilidadPct > 60) return "La utilidad debe estar entre 1% y 60% de la venta.";
  if (!Number.isFinite(c.ebitdaPct) || c.ebitdaPct <= 0 || c.ebitdaPct > 80) return "El EBITDA objetivo debe estar entre 1% y 80% de la venta.";
  if (c.utilidadPct > c.ebitdaPct) return "La utilidad no puede ser mayor que el EBITDA objetivo: sale de ahí.";
  return null;
}

/** Cada bloque de la regla es un tercio de la venta (con el EBITDA objetivo por defecto). */
export const META_BLOQUE_PCT = CONFIG_PROFIT_FIRST.ebitdaPct;
/** Tope de la planilla dentro de los costos fijos (% de la venta). */
export const TOPE_PLANILLA_PCT = 25;
/** Método 1 del coach (planilla ÷ ventas): el rango sano es de 20% a 25%; por debajo de 20% suele faltar gente o se está pagando poco. */
export const PLANILLA_SANA_MIN_PCT = 20;
export type EstadoPlanilla = "baja" | "sana" | "alta";
export function estadoPlanilla(pct: number): EstadoPlanilla {
  return pct > TOPE_PLANILLA_PCT ? "alta" : pct >= PLANILLA_SANA_MIN_PCT ? "sana" : "baja";
}
/** Termómetro del EBITDA: menos de 10% = frágil; 30% o más = eficiente. */
export const EBITDA_FRAGIL_PCT = 10;
export const EBITDA_EFICIENTE_PCT = 30;
/** El % de utilidad por defecto (para textos y pruebas). */
export const UTILIDAD_META_PCT = CONFIG_PROFIT_FIRST.utilidadPct;

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
  /** El % que le toca a este bloque en la regla. */
  metaPct: number;
  /** Lo que valdría su parte de esa venta. */
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
  planilla: { monto: number; pct: number; pasaDelTope: boolean; estado: EstadoPlanilla } | null;
  /** El sueldo de los socios que hay dentro de la planilla (informativo). */
  sueldoSocios: number;
  /** El EBITDA ya no cuenta el sueldo de los socios (interruptor del CEO). */
  sociosFuera: boolean;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function bloque(monto: number, ventas: number, metaPct: number): Bloque {
  const meta = r2(ventas * (metaPct / 100));
  return { monto: r2(monto), pct: r1((monto / ventas) * 100), metaPct, meta, difMeta: r2(monto - meta) };
}

/** Arma las tres partes con una venta, costos y gastos ya decididos (también para la proyección del presupuesto). */
export function bloquesDeLaRegla(ventas: number, costos: number, gastos: number, planilla: number, cfg: ConfigProfitFirst) {
  const ebitda = ventas - costos - gastos;
  const metaOperativa = (100 - cfg.ebitdaPct) / 2;
  const b = bloque(ebitda, ventas, cfg.ebitdaPct);
  return {
    costos: bloque(costos, ventas, metaOperativa),
    fijos: bloque(gastos, ventas, metaOperativa),
    // En el EBITDA, positivo = falta para la meta.
    ebitda: { ...b, difMeta: r2(b.meta - ebitda) },
    termometro: termometroEbitda((ebitda / ventas) * 100),
    planilla: { monto: r2(planilla), pct: r1((planilla / ventas) * 100), pasaDelTope: (planilla / ventas) * 100 > TOPE_PLANILLA_PCT, estado: estadoPlanilla((planilla / ventas) * 100) },
  };
}

const sinNumeros = { costos: null, fijos: null, ebitda: null, termometro: null, planilla: null } as const;

type Cifras = { sedes: CifrasSede[]; grupo: CifrasGrupo; config?: ConfigProfitFirst };

function deSede(s: CifrasSede, cfg: ConfigProfitFirst): FilaRegla {
  const base = { etiqueta: s.sede, esGrupo: false, corte: s.corte, mesCompleto: s.mesCompleto, sueldoSocios: s.sueldoSocios, sociosFuera: cfg.sociosDeUtilidad };
  if (!s.conResultado || s.ventas === null || s.ventas <= 0) {
    return { ...base, sinResultadoPorque: s.sinResultadoPorque ?? "Sin datos", ventas: s.ventas, ...sinNumeros };
  }
  const quita = cfg.sociosDeUtilidad ? s.sueldoSocios : 0;
  return { ...base, sinResultadoPorque: null, ventas: s.ventas, ...bloquesDeLaRegla(s.ventas, s.costos, s.gastos - quita, s.planilla - quita, cfg) };
}

function delGrupo(g: CifrasGrupo, cfg: ConfigProfitFirst): FilaRegla {
  const base = { etiqueta: "Grupo", esGrupo: true, corte: null, mesCompleto: !g.provisional, sueldoSocios: g.sueldoSocios, sociosFuera: cfg.sociosDeUtilidad };
  if (g.ganancia === null) {
    return { ...base, sinResultadoPorque: g.sinResultado.map((x) => `${x.sede}: ${x.porque}`).join(" · ") || "Sin datos", ventas: g.ventas, ...sinNumeros };
  }
  // La venta del grupo que entra al resultado (las sedes sin resultado y la venta interna ya están fuera):
  // Ganancia = Venta − Costos − Gastos − Impuestos.
  const ventasResultado = g.ganancia + g.costos + g.gastos + g.impuestos;
  const quita = cfg.sociosDeUtilidad ? g.sueldoSocios : 0;
  return { ...base, sinResultadoPorque: null, ventas: r2(ventasResultado), ...bloquesDeLaRegla(ventasResultado, g.costos, g.gastos - quita, g.planilla - quita, cfg) };
}

/** La fila de UNA sede (la tarjeta del Resumen la usa para el termómetro del EBITDA). */
export const reglaDeSede = deSede;

const ORDEN = [2, 3, 1];

/** Las filas de la regla: Fonavi, Centro, Atelier y Grupo. */
export function regla33(c: Cifras, config?: ConfigProfitFirst): FilaRegla[] {
  const cfg = config ?? c.config ?? CONFIG_PROFIT_FIRST;
  const sedes = ORDEN.map((id) => c.sedes.find((s) => s.businessId === id)).filter((s): s is CifrasSede => !!s).map((s) => deSede(s, cfg));
  return [...sedes, delGrupo(c.grupo, cfg)];
}

/**
 * El pastel de la regla: las tres partes como fracciones de la vuelta (0 a 1), empezando arriba.
 * Si costos + fijos pasan de 100 no queda EBITDA y se escalan para que quepan en el círculo.
 * `meta` es el mismo pastel con la regla cumplida (por defecto tres partes iguales).
 */
export type ParteDelPastel = { clave: "costos" | "fijos" | "ebitda"; desde: number; largo: number };

export function partesDelPastel(costosPct: number, fijosPct: number, ebitdaPct: number): ParteDelPastel[] {
  const c = Math.max(0, costosPct), f = Math.max(0, fijosPct), e = Math.max(0, ebitdaPct);
  const total = Math.max(100, c + f + e);
  return [
    { clave: "costos", desde: 0, largo: c / total },
    { clave: "fijos", desde: c / total, largo: f / total },
    { clave: "ebitda", desde: (c + f) / total, largo: e / total },
  ];
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

export type EstadoApartado = "cumple" | "parcial" | "sin_apartar";

export type FilaProfitFirst = {
  etiqueta: string;
  esGrupo: boolean;
  corte: string | null;
  mesCompleto: boolean;
  sinResultadoPorque: string | null;
  ventas: number | null;
  utilidadPct: number;

  // 1) La separación del 25%
  /** El % de la venta, en soles. */
  meta: number | null;
  apartado: { neto: number; pct: number; ahorro: number; rescates: number; utilidadesPagadas: number } | null;
  estado: EstadoApartado | null;
  /** Lo que faltó para la meta (0 si se cumplió). */
  falta: number | null;
  /** Se sacó del ahorro plata que NO fue para pagar utilidades: la reserva dejó de ser intocable. */
  retiroAjeno: number;

  // 2) La operación con el resto
  operacion: { monto: number; pct: number; limitePct: number; limite: number; dentro: boolean; exceso: number } | null;
  /** Dónde están las fugas: lo que cada bloque se pasó de su parte de la regla. */
  fugas: { costos: number; fijos: number } | null;

  // 3) El EBITDA y los socios
  ebitda: number | null;
  ebitdaPct: number | null;
  ebitdaObjetivoPct: number;
  /** Lo que queda del EBITDA objetivo después de la utilidad: impuestos y reinversión. */
  restoPct: number;
  /** ¿La operación dejó al menos lo de la meta? */
  operacionAlcanza: boolean | null;
  sueldoSocios: number;
  sociosDeUtilidad: boolean;
  /** Con los socios pagados de la utilidad: lo que la operación dejó, menos lo que cobraron. null si siguen en planilla. */
  utilidadTrasSocios: number | null;
};

function filaPF(r: FilaRegla, fuera: { ahorro: number; rescate: number; reparto: number }[], cfg: ConfigProfitFirst): FilaProfitFirst {
  const base = {
    etiqueta: r.etiqueta, esGrupo: r.esGrupo, corte: r.corte, mesCompleto: r.mesCompleto,
    utilidadPct: cfg.utilidadPct, ebitdaObjetivoPct: cfg.ebitdaPct, restoPct: r1(cfg.ebitdaPct - cfg.utilidadPct),
    sueldoSocios: r.sueldoSocios, sociosDeUtilidad: cfg.sociosDeUtilidad,
  };
  if (!r.ebitda || !r.costos || !r.fijos || r.ventas === null || r.ventas <= 0) {
    return {
      ...base, sinResultadoPorque: r.sinResultadoPorque ?? "Sin datos", ventas: null, meta: null, apartado: null, estado: null, falta: null, retiroAjeno: 0,
      operacion: null, fugas: null, ebitda: null, ebitdaPct: null, operacionAlcanza: null, utilidadTrasSocios: null,
    };
  }
  const v = r.ventas;
  const meta = r2(v * (cfg.utilidadPct / 100));
  const ahorro = r2(fuera.reduce((t, x) => t + x.ahorro, 0));
  const rescates = r2(fuera.reduce((t, x) => t + x.rescate, 0));
  const utilidadesPagadas = r2(fuera.reduce((t, x) => t + x.reparto, 0));
  const neto = r2(ahorro - rescates + utilidadesPagadas);
  const estado: EstadoApartado = neto >= meta ? "cumple" : neto > 0 ? "parcial" : "sin_apartar";

  const operacionMonto = r.costos.monto + r.fijos.monto;
  const limitePct = 100 - cfg.utilidadPct;
  const limite = r2(v * (limitePct / 100));
  const d = dondeFalta(r)!;
  return {
    ...base, sinResultadoPorque: null, ventas: v, meta,
    apartado: { neto, pct: r1((neto / v) * 100), ahorro, rescates, utilidadesPagadas },
    estado, falta: r2(Math.max(0, meta - neto)),
    retiroAjeno: r2(Math.max(0, rescates - utilidadesPagadas)),
    operacion: { monto: r2(operacionMonto), pct: r1((operacionMonto / v) * 100), limitePct: r1(limitePct), limite, dentro: operacionMonto <= limite, exceso: r2(Math.max(0, operacionMonto - limite)) },
    fugas: { costos: d.masCostos, fijos: d.masFijos },
    ebitda: r.ebitda.monto, ebitdaPct: r.ebitda.pct,
    operacionAlcanza: r.ebitda.monto >= meta,
    utilidadTrasSocios: cfg.sociosDeUtilidad ? r2(r.ebitda.monto - r.sueldoSocios) : null,
  };
}

/** Profit First por sede y para el Grupo (el Grupo suma solo las sedes que entran al resultado). */
export function profitFirst(c: Cifras, config?: ConfigProfitFirst): FilaProfitFirst[] {
  const cfg = config ?? c.config ?? CONFIG_PROFIT_FIRST;
  return regla33(c, cfg).map((r) => {
    const sedes = r.esGrupo ? c.sedes.filter((s) => s.conResultado) : c.sedes.filter((s) => s.sede === r.etiqueta);
    return filaPF(r, sedes.map((s) => s.fuera), cfg);
  });
}

/**
 * El aviso de la primera semana del mes: cuánto toca separar de la venta del mes que cerró,
 * menos lo que ya se depositó en lo que va del mes actual. Solo sedes con venta y sin cumplir.
 */
export function utilidadPorSeparar(cerrado: Cifras, actual: Cifras, config?: ConfigProfitFirst): { sede: string; monto: number }[] {
  const cfg = config ?? cerrado.config ?? CONFIG_PROFIT_FIRST;
  const yaDepositado = (nombre: string) => actual.sedes.find((s) => s.sede === nombre)?.fuera.ahorro ?? 0;
  return ORDEN.map((id) => cerrado.sedes.find((s) => s.businessId === id))
    .filter((s): s is CifrasSede => !!s && s.ventas !== null && s.ventas > 0 && s.mesCompleto)
    .map((s) => ({ sede: s.sede, monto: r2(Math.max(0, s.ventas! * (cfg.utilidadPct / 100) - yaDepositado(s.sede))) }))
    .filter((x) => x.monto >= 1);
}
