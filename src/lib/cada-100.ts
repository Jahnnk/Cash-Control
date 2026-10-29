/**
 * «De cada S/ 100 que vendes» · el EBITDA como termómetro, por sede y para el grupo · lógica PURA.
 *
 * Pedido de Jahnn (29-oct-2026): la regla 33-33-33 y Profit First vistas de un golpe en el Dashboard. De cada S/ 100
 * vendidos: 33 a costos variables, 33 a costos fijos y 33 de EBITDA; de ese EBITDA, 25 se aparta como utilidad y 8
 * quedan para impuestos, inversión y deudas. Lo que la operación no deja, «se fuga» antes de llegar a la caja.
 *
 *   Costos variables  · «Costos» de las seis cifras (insumos, productos de Atelier, empaques…)   tope 33
 *   Costos fijos      · «Gastos» de las seis cifras (planilla, alquiler, servicios…)              tope 33
 *   EBITDA            · lo que queda: 100 − variables − fijos                                     meta 33
 *   Utilidad apartada · ahorro (fondos mutuos) − rescates + utilidades pagadas a los socios       meta 25
 *   Impuestos, inversión y deudas · impuestos + inversión + cuotas de préstamos y tarjetas        tope 8
 *
 * Decisiones de Jahnn (29-oct-2026):
 *   1. Las deudas (financiamiento) van DENTRO de los 8: así se ve cuándo se comen la utilidad (Atelier set: 14 de 8).
 *   2. Mientras el mes está abierto, el EBITDA es ESTIMADO: el Excel llega atrasado y la planilla y el alquiler se pagan
 *      a fin de mes, así que lo «real a la fecha» sale inflado (Fonavi 49%, Centro 59% a mitad de octubre). Se estima con
 *      los fijos que se esperan del mes completo (presupuesto aprobado o, si no hay, el promedio de los meses cerrados) y
 *      los costos variables de siempre (promedio de los meses cerrados), sobre las ventas al ritmo actual.
 *      Los variables NO se toman «a la fecha»: las compras se pagan con retraso y a mitad de mes salen bajos (Fonavi
 *      osciló entre 40% y 57% en abril–octubre; a mitad de octubre iba en 39%), lo que volvería a inflar el EBITDA.
 *
 * Todo sale de las seis cifras (lib/seis-cifras.ts) y de la regla 33-33-33 (lib/regla-33.ts): una sola fuente.
 */

import { cifrasDelGrupo, type CifrasGrupo, type CifrasSede } from "./seis-cifras";
import { CONFIG_PROFIT_FIRST, EBITDA_EFICIENTE_PCT, EBITDA_FRAGIL_PCT, regla33, reglaDeSede, termometroEbitda, type ConfigProfitFirst, type Termometro } from "./regla-33";

export type Tono = "bien" | "ojo" | "mal" | "neutro";
export type ClaveLinea = "variables" | "fijos" | "ebitda" | "utilidad" | "bolsa";

export type LineaCada100 = {
  clave: ClaveLinea;
  etiqueta: string;
  /** Qué entra ahí, en pocas palabras. */
  ayuda: string;
  /** De cada S/ 100 vendidos, cuántos soles (1 decimal). */
  cien: number;
  /** La meta o el tope, en soles de cada 100. */
  meta: number;
  /** «tope» = no debería pasar de la meta; «piso» = debería llegar a la meta. */
  sentido: "tope" | "piso";
  tono: Tono;
  /** El monto en soles detrás de la línea (en el EBITDA estimado, al cierre del mes). */
  monto: number;
  /** Una nota corta cuando la línea no es «real a la fecha». */
  nota: string | null;
};

export type FuenteFijos = "presupuesto" | "promedio";

export type Cada100 = {
  /** null = el grupo. */
  businessId: number | null;
  sede: string;
  modo: "real" | "estimado" | "sin-datos";
  /** Por qué no hay datos (modo «sin-datos»). */
  porque: string | null;
  /** Mes cerrado con el Excel incompleto (real pero provisional). */
  provisional: boolean;
  /** La venta sobre la que se miden los «de cada 100»: la del mes, o la de todo el mes al ritmo actual si es estimado. */
  ventas: number | null;
  /** Hasta qué día cuentan los costos reales (el último día con Excel). */
  corte: string | null;
  lineas: LineaCada100[];
  termometro: Termometro | null;
  /** Lo que quedó en caja (entró − salió), hasta el corte. */
  caja: number | null;
  /** De dónde salen los fijos esperados (solo estimado). */
  fuenteFijos: FuenteFijos | null;
  /** Los fijos esperados del mes completo (solo estimado). */
  fijosEsperados: number | null;
};

/** Lo que se espera de una sede en el mes abierto. */
export type EsperadoSede = {
  businessId: number;
  /** Fijos del mes COMPLETO: del presupuesto aprobado o, si no hay, el promedio de los meses cerrados. */
  fijos: number | null;
  fuente: FuenteFijos | null;
  /** Ventas del mes completo: al ritmo actual o, si todavía no hay ritmo, la venta esperada del presupuesto. */
  ventasAlCierre: number | null;
  /** Los costos variables de siempre, en % de la venta (promedio de los meses cerrados). null = no hay meses cerrados. */
  varPct: number | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);

/** Las metas de la regla, con los ajustes que el CEO haya guardado. */
export function metasDeLaRegla(cfg: ConfigProfitFirst = CONFIG_PROFIT_FIRST) {
  return { operacion: r1((100 - cfg.ebitdaPct) / 2), ebitda: r1(cfg.ebitdaPct), utilidad: r1(cfg.utilidadPct), bolsa: r1(cfg.ebitdaPct - cfg.utilidadPct) };
}

const tonoTope = (cien: number, meta: number, holgura: number): Tono => (cien <= meta ? "bien" : cien <= meta + holgura ? "ojo" : "mal");
const tonoEbitda = (cien: number): Tono => (cien >= EBITDA_EFICIENTE_PCT ? "bien" : cien >= EBITDA_FRAGIL_PCT ? "ojo" : "mal");
const tonoUtilidad = (cien: number, meta: number): Tono => (cien >= meta ? "bien" : cien >= meta / 2 ? "ojo" : "mal");

type Montos = { ventas: number; costos: number; fijos: number; utilidad: number; bolsa: number };

/** Las cinco líneas de un mes REAL: todo sobre la misma venta. */
function lineasReales(m: Montos, ebitda: number, cfg: ConfigProfitFirst): LineaCada100[] {
  const meta = metasDeLaRegla(cfg);
  const cien = (x: number) => r1((x / m.ventas) * 100);
  const v = cien(m.costos), f = cien(m.fijos), e = cien(ebitda), u = cien(m.utilidad), b = cien(m.bolsa);
  return [
    { clave: "variables", etiqueta: "Costos variables", ayuda: "insumos, productos de Atelier, empaques", cien: v, meta: meta.operacion, sentido: "tope", tono: tonoTope(v, meta.operacion, 5), monto: r2(m.costos), nota: null },
    { clave: "fijos", etiqueta: "Costos fijos", ayuda: "planilla, alquiler, servicios", cien: f, meta: meta.operacion, sentido: "tope", tono: tonoTope(f, meta.operacion, 5), monto: r2(m.fijos), nota: null },
    { clave: "ebitda", etiqueta: "EBITDA", ayuda: "lo que deja la operación", cien: e, meta: meta.ebitda, sentido: "piso", tono: tonoEbitda(e), monto: r2(ebitda), nota: null },
    { clave: "utilidad", etiqueta: "Utilidad apartada", ayuda: "fondos mutuos y utilidades a los socios", cien: u, meta: meta.utilidad, sentido: "piso", tono: tonoUtilidad(u, meta.utilidad), monto: r2(m.utilidad), nota: null },
    { clave: "bolsa", etiqueta: "Impuestos, inversión y deudas", ayuda: "impuestos, equipos u obras, cuotas de préstamos y tarjetas", cien: b, meta: meta.bolsa, sentido: "tope", tono: tonoTope(b, meta.bolsa, meta.bolsa / 2), monto: r2(m.bolsa), nota: null },
  ];
}

/** Lo que la utilidad ya apartada y la bolsa de los 8 llevan. */
const utilidadDe = (f: CifrasSede["fuera"]) => r2(f.ahorro - f.rescate + f.reparto);
const bolsaDe = (c: { fuera: CifrasSede["fuera"]; impuestos: number }) => r2(c.fuera.deudas + c.fuera.inversion + c.impuestos);

const sinDatos = (businessId: number | null, sede: string, porque: string): Cada100 => ({
  businessId, sede, modo: "sin-datos", porque, provisional: false, ventas: null, corte: null, lineas: [], termometro: null, caja: null, fuenteFijos: null, fijosEsperados: null,
});

// ─────────────────────────── Mes abierto: la estimación ───────────────────────────
type Estimacion = {
  ventas: number; costos: number; fijos: number; utilidad: number; bolsa: number; interno: number; caja: number; fuente: FuenteFijos;
  /** Cómo van los variables a la fecha (% de lo vendido): se dice aparte para que se vea por qué no se usan. */
  variablesAFecha: number | null; variablesDeSiempre: boolean;
};

function estimarSede(c: CifrasSede, cfg: ConfigProfitFirst, esp: EsperadoSede | null | undefined): { ok: true; e: Estimacion } | { ok: false; porque: string } {
  if (!c.conResultado || c.ventas === null || c.ventas <= 0) return { ok: false, porque: c.sinResultadoPorque ?? "Sin ventas cargadas" };
  if (!esp || !esp.fijos || esp.fijos <= 0 || !esp.fuente) return { ok: false, porque: "Falta un presupuesto aprobado o meses cerrados para saber los fijos del mes" };
  if (!esp.ventasAlCierre || esp.ventasAlCierre <= 0) return { ok: false, porque: "Todavía hay pocos días de venta para estimar el mes" };
  // Los variables de siempre (promedio de los meses cerrados); sin historia, lo que va a la fecha.
  const aFecha = (c.costos / c.ventas) * 100;
  const variables = ((esp.varPct ?? aFecha) / 100) * esp.ventasAlCierre;
  // Si el CEO pasó el sueldo de los socios a «se paga de la utilidad», los fijos esperados (que lo traen adentro) lo restan.
  const fijos = esp.fijos - (cfg.sociosDeUtilidad ? c.sueldoSocios : 0);
  // Lo que las cafeterías le compran a Atelier se cuenta una sola vez en el grupo. Se paga al ritmo de las ventas (tickets
  // semanales), así que su proporción de la venta vale para todo el mes (Fonavi: 31% a la fecha vs 33% en setiembre).
  const interno = c.businessId === 1 ? 0 : (c.compraAtelier / c.ventas) * esp.ventasAlCierre;
  return {
    ok: true,
    e: {
      ventas: esp.ventasAlCierre, costos: variables, fijos, utilidad: utilidadDe(c.fuera), bolsa: bolsaDe(c), interno, caja: c.caja.flujo, fuente: esp.fuente,
      variablesAFecha: r1(aFecha), variablesDeSiempre: esp.varPct !== null,
    },
  };
}

/** Las cinco líneas de un mes ABIERTO: variables y fijos estimados al cierre; utilidad y bolsa, lo que va. */
function lineasEstimadas(e: Estimacion, cfg: ConfigProfitFirst): { lineas: LineaCada100[]; ebitdaCien: number } {
  const meta = metasDeLaRegla(cfg);
  const cien = (x: number) => r1((x / e.ventas) * 100);
  const v = cien(e.costos), f = cien(e.fijos);
  const ebitdaMonto = e.ventas - e.costos - e.fijos;
  const eb = r1(100 - v - f);
  const utilidadMeta = r2(e.ventas * (cfg.utilidadPct / 100)), bolsaTope = r2(e.ventas * (meta.bolsa / 100));
  const lineas: LineaCada100[] = [
    { clave: "variables", etiqueta: "Costos variables", ayuda: "insumos, productos de Atelier, empaques", cien: v, meta: meta.operacion, sentido: "tope", tono: tonoTope(v, meta.operacion, 5), monto: r2(e.costos),
      nota: !e.variablesDeSiempre ? "lo que va a la fecha"
        : e.variablesAFecha !== null ? `promedio de los meses cerrados · a la fecha va ${Math.round(e.variablesAFecha)}%` : "promedio de los meses cerrados" },
    { clave: "fijos", etiqueta: "Costos fijos", ayuda: "planilla, alquiler, servicios", cien: f, meta: meta.operacion, sentido: "tope", tono: tonoTope(f, meta.operacion, 5), monto: r2(e.fijos), nota: e.fuente === "presupuesto" ? "del presupuesto aprobado" : "promedio de los meses cerrados" },
    { clave: "ebitda", etiqueta: "EBITDA", ayuda: "lo que deja la operación", cien: eb, meta: meta.ebitda, sentido: "piso", tono: tonoEbitda(eb), monto: r2(ebitdaMonto), nota: "estimado al cierre" },
    // La utilidad se aparta del 1 al 7 del mes siguiente (Profit First): a mitad de mes no se juzga, solo se dice cuánto tocará.
    { clave: "utilidad", etiqueta: "Utilidad apartada", ayuda: "fondos mutuos y utilidades a los socios", cien: cien(e.utilidad), meta: meta.utilidad, sentido: "piso", tono: "neutro", monto: r2(e.utilidad), nota: `se aparta del 1 al 7 del mes que viene: tocarán S/ ${Math.round(utilidadMeta).toLocaleString("es-PE")}` },
    { clave: "bolsa", etiqueta: "Impuestos, inversión y deudas", ayuda: "impuestos, equipos u obras, cuotas de préstamos y tarjetas", cien: cien(e.bolsa), meta: meta.bolsa, sentido: "tope", tono: e.bolsa > bolsaTope ? "mal" : "neutro", monto: r2(e.bolsa), nota: `va S/ ${Math.round(e.bolsa).toLocaleString("es-PE")} de S/ ${Math.round(bolsaTope).toLocaleString("es-PE")}` },
  ];
  return { lineas, ebitdaCien: eb };
}

function deEstimacion(businessId: number | null, sede: string, e: Estimacion, cfg: ConfigProfitFirst, corte: string | null): Cada100 {
  const { lineas, ebitdaCien } = lineasEstimadas(e, cfg);
  return {
    businessId, sede, modo: "estimado", porque: null, provisional: false, ventas: r2(e.ventas), corte, lineas,
    termometro: termometroEbitda(ebitdaCien), caja: r2(e.caja), fuenteFijos: e.fuente, fijosEsperados: r2(e.fijos),
  };
}

// ─────────────────────────── API ───────────────────────────
/**
 * Una sede. `enCurso` = el mes elegido es el mes actual: mientras el Excel no llegue al fin de mes, el EBITDA es una
 * estimación. Un mes ya cerrado con el Excel incompleto se muestra real pero provisional.
 */
export function cada100DeSede(c: CifrasSede, cfg: ConfigProfitFirst = CONFIG_PROFIT_FIRST, esperado: EsperadoSede | null = null, enCurso = false): Cada100 {
  if (enCurso && !c.mesCompleto) {
    const est = estimarSede(c, cfg, esperado);
    return est.ok ? deEstimacion(c.businessId, c.sede, est.e, cfg, c.corte) : sinDatos(c.businessId, c.sede, est.porque);
  }
  const fila = reglaDeSede(c, cfg);
  if (!fila.ebitda || !fila.costos || !fila.fijos || fila.ventas === null || fila.ventas <= 0) return sinDatos(c.businessId, c.sede, fila.sinResultadoPorque ?? "Sin datos");
  const m: Montos = { ventas: fila.ventas, costos: fila.costos.monto, fijos: fila.fijos.monto, utilidad: utilidadDe(c.fuera), bolsa: bolsaDe(c) };
  return {
    businessId: c.businessId, sede: c.sede, modo: "real", porque: null, provisional: !c.mesCompleto, ventas: fila.ventas, corte: c.corte,
    lineas: lineasReales(m, fila.ebitda.monto, cfg), termometro: fila.termometro, caja: c.caja.flujo, fuenteFijos: null, fijosEsperados: null,
  };
}

/** El grupo: la suma de las sedes con resultado, con lo que Atelier le vende a las cafeterías contado una sola vez. */
export function cada100DelGrupo(sedes: CifrasSede[], grupo: CifrasGrupo, cfg: ConfigProfitFirst = CONFIG_PROFIT_FIRST, esperados: EsperadoSede[] = [], enCurso = false): Cada100 {
  if (enCurso && sedes.some((s) => !s.mesCompleto)) {
    const partes = sedes.filter((s) => s.conResultado).map((s) => ({ s, est: estimarSede(s, cfg, esperados.find((x) => x.businessId === s.businessId)) }));
    if (partes.length === 0) return sinDatos(null, "Grupo", sedes.find((s) => s.sinResultadoPorque)?.sinResultadoPorque ?? "Sin datos");
    const mal = partes.find((p) => !p.est.ok);
    if (mal && !mal.est.ok) return sinDatos(null, "Grupo", `${mal.s.sede}: ${mal.est.porque.charAt(0).toLowerCase()}${mal.est.porque.slice(1)}`);
    const es = partes.map((p) => (p.est as { ok: true; e: Estimacion }).e);
    const interno = suma(es, (e) => e.interno);
    const total: Estimacion = {
      ventas: suma(es, (e) => e.ventas) - (partes.some((p) => p.s.businessId === 1) ? interno : 0),
      costos: suma(es, (e) => e.costos) - (partes.some((p) => p.s.businessId === 1) ? interno : 0),
      fijos: suma(es, (e) => e.fijos), utilidad: suma(es, (e) => e.utilidad), bolsa: suma(es, (e) => e.bolsa), interno: 0,
      caja: suma(es, (e) => e.caja), fuente: es.every((e) => e.fuente === "presupuesto") ? "presupuesto" : "promedio",
      variablesAFecha: null, variablesDeSiempre: es.every((e) => e.variablesDeSiempre),
    };
    return deEstimacion(null, "Grupo", total, cfg, partes.map((p) => p.s.corte).filter((x): x is string => !!x).sort()[0] ?? null);
  }
  const fila = regla33({ sedes, grupo, config: cfg }, cfg).at(-1)!;
  if (!fila.ebitda || !fila.costos || !fila.fijos || fila.ventas === null || fila.ventas <= 0) return sinDatos(null, "Grupo", fila.sinResultadoPorque ?? "Sin datos");
  const con = sedes.filter((s) => s.conResultado);
  const m: Montos = {
    ventas: fila.ventas, costos: fila.costos.monto, fijos: fila.fijos.monto,
    utilidad: suma(con, (s) => utilidadDe(s.fuera)), bolsa: suma(con, (s) => bolsaDe(s)),
  };
  return {
    businessId: null, sede: "Grupo", modo: "real", porque: null, provisional: grupo.provisional, ventas: fila.ventas,
    corte: con.map((s) => s.corte).filter((x): x is string => !!x).sort()[0] ?? null,
    lineas: lineasReales(m, fila.ebitda.monto, cfg), termometro: fila.termometro, caja: grupo.caja.flujo, fuenteFijos: null, fijosEsperados: null,
  };
}

export type Cada100Mes = { grupo: Cada100; sedes: Record<number, Cada100> };

/** Todo junto: el grupo y cada sede del mes. */
export function cada100DelMes(cifras: { sedes: CifrasSede[]; grupo?: CifrasGrupo; config?: ConfigProfitFirst }, esperados: EsperadoSede[] = [], enCurso = false): Cada100Mes {
  const cfg = cifras.config ?? CONFIG_PROFIT_FIRST;
  return {
    grupo: cada100DelGrupo(cifras.sedes, cifras.grupo ?? cifrasDelGrupo(cifras.sedes), cfg, esperados, enCurso),
    sedes: Object.fromEntries(cifras.sedes.map((s) => [s.businessId, cada100DeSede(s, cfg, esperados.find((x) => x.businessId === s.businessId) ?? null, enCurso)])),
  };
}

/**
 * Lo esperado de una sede en el mes abierto, a partir de lo que ya calcula el punto de equilibrio (promedio de los meses
 * cerrados y ventas al ritmo actual) y, si hay, el presupuesto aprobado (manda: es el plan de Jahnn).
 */
export function esperadoDe(
  businessId: number,
  be: { fijos: number; varRatio: number | null; referenceMonths: string[] | null; ventasProyectadas: number | null; ventasEsperadas: number | null } | null | undefined,
  plan: { fijos: number; ventaEsperada: number } | null | undefined,
): EsperadoSede {
  const promedio = be && be.referenceMonths && be.referenceMonths.length > 0 && be.fijos > 0 ? be.fijos : null;
  const fijos = plan && plan.fijos > 0 ? plan.fijos : promedio;
  const ventasAlCierre = be?.ventasProyectadas ?? plan?.ventaEsperada ?? be?.ventasEsperadas ?? null;
  const varPct = be && be.referenceMonths && be.referenceMonths.length > 0 && be.varRatio !== null && be.varRatio > 0 ? Math.round(be.varRatio * 1000) / 10 : null;
  return { businessId, fijos, fuente: plan && plan.fijos > 0 ? "presupuesto" : promedio !== null ? "promedio" : null, ventasAlCierre, varPct };
}
