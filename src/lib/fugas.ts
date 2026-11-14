/**
 * ¿Dónde se va la plata? · MOTOR (puro). Fase 3 del centro de mando del EBITDA (pedido de Jahnn, 13-nov-2026).
 *
 * Tres lecturas por sede, todas con datos que el sistema YA tiene (nada que alguien marque a mano):
 *   1. Radiografía de los gastos fijos: cuáles pesan más y cuáles crecieron contra los meses anteriores.
 *   2. Mapa de fugas: mermas (por motivo; «Vencimiento» = se hizo o se compró de más y no se vendió) y descuentos.
 *   3. Los 3 focos: lo que más plata devuelve al mes si se corrige, en soles y en puntos de EBITDA.
 *
 * Se compara el promedio de los últimos meses cerrados (los mismos de las palancas) con los meses cerrados anteriores.
 * OJO: la merma ya está DENTRO del costo variable (son insumos que se compraron). Se muestra aparte porque es la
 * parte que se puede atacar directo, no porque se sume encima.
 */

import { areaDe } from "./presupuesto";
import { tipoDeCategoria } from "./reglas-gasto";
import { TOPE_PLANILLA_PCT } from "./regla-33";

/** Un mes cerrado: lo vendido y lo que salió por categoría. */
export type MesGasto = { mes: string; ventas: number; porCategoria: Record<string, number> };

const CAT_PLANILLA = "PLANILLA";
const CAT_IMPUESTOS = "IMPUESTOS";
/** Motivo de merma que equivale a sobreproducción: se venció sin venderse. */
export const MOTIVO_SOBREPRODUCCION = "Vencimiento";
/** Un cambio cuenta solo si pasa de estos dos mínimos (para no perseguir céntimos). */
export const CAMBIO_MINIMO_SOLES = 50;
export const CAMBIO_MINIMO_PCT = 10;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const prom = (l: number[]) => (l.length ? l.reduce((t, x) => t + x, 0) / l.length : 0);

/** ¿La categoría es un gasto fijo de la operación? (la misma línea que usan las palancas 3 y 4). */
export function esFijoDeOperacion(categoria: string): boolean {
  return areaDe(categoria).bloque === "operacion" && categoria !== CAT_IMPUESTOS && tipoDeCategoria(categoria) !== "Variable";
}

/** ¿La categoría es un costo variable de la operación? (la palanca 2: insumos, productos de Atelier, empaques…). */
export function esVariableDeOperacion(categoria: string): boolean {
  return areaDe(categoria).bloque === "operacion" && categoria !== CAT_IMPUESTOS && tipoDeCategoria(categoria) === "Variable";
}

export type FilaFijo = {
  categoria: string;
  /** Promedio mensual de los meses recientes. */
  monto: number;
  /** % de la venta promedio. */
  pctVenta: number;
  /** Promedio mensual de los meses anteriores (null = no hay con qué comparar). */
  antes: number | null;
  /** monto − antes. */
  cambio: number | null;
  /** true = subió más que los dos mínimos. */
  sube: boolean;
};

const esCambioReal = (cambio: number, antes: number) =>
  Math.abs(cambio) >= CAMBIO_MINIMO_SOLES && (antes <= 0 || (Math.abs(cambio) / antes) * 100 >= CAMBIO_MINIMO_PCT);

/** Todos los gastos fijos de la operación, del que más pesa al que menos. */
export function radiografiaFijos(recientes: MesGasto[], previos: MesGasto[]): FilaFijo[] {
  return radiografia(recientes, previos, esFijoDeOperacion);
}

/** De qué está hecho el costo variable: cada categoría, del que más pesa al que menos. */
export function radiografiaVariables(recientes: MesGasto[], previos: MesGasto[]): FilaFijo[] {
  return radiografia(recientes, previos, esVariableDeOperacion);
}

function radiografia(recientes: MesGasto[], previos: MesGasto[], entra: (categoria: string) => boolean): FilaFijo[] {
  if (recientes.length === 0) return [];
  const ventas = prom(recientes.map((m) => m.ventas));
  const cats = new Set<string>();
  for (const m of [...recientes, ...previos]) for (const c of Object.keys(m.porCategoria)) if (entra(c)) cats.add(c);
  return [...cats].map((categoria): FilaFijo => {
    const monto = r2(prom(recientes.map((m) => m.porCategoria[categoria] ?? 0)));
    const antes = previos.length ? r2(prom(previos.map((m) => m.porCategoria[categoria] ?? 0))) : null;
    const cambio = antes === null ? null : r2(monto - antes);
    return { categoria, monto, pctVenta: ventas > 0 ? r1((monto / ventas) * 100) : 0, antes, cambio, sube: cambio !== null && antes !== null && cambio > 0 && esCambioReal(cambio, antes) };
  }).filter((f) => f.monto > 0 || (f.antes ?? 0) > 0).sort((a, b) => b.monto - a.monto);
}

export type EntradaFugas = {
  /** Venta promedio mensual de los meses recientes. */
  ventas: number;
  /** Cuántos meses recientes y anteriores se sumaron. */
  meses: number;
  mesesAntes: number;
  /** Mermas registradas por la sede (suma de los meses recientes) y su reparto por motivo. */
  mermas: number | null;
  porMotivo: { motivo: string; total: number }[];
  /** Tope de merma de la sede (% de la venta). */
  metaMermaPct: number;
  /** Descuentos del reporte de Byte: suma de los meses recientes y de los anteriores (null = sin reporte). */
  descuentos: number | null;
  descuentosAntes: number | null;
};

export type Fugas = {
  merma: { monto: number; pctVenta: number; metaPct: number; /** Lo que pasa del tope, al mes (0 si está dentro). */ exceso: number; motivos: { motivo: string; monto: number; parte: number }[] } | null;
  /** La parte de la merma que se venció sin venderse. */
  sobreproduccion: { monto: number; parte: number } | null;
  descuentos: { monto: number; pctVenta: number; antes: number | null; cambio: number | null; sube: boolean } | null;
};

export function mapaDeFugas(e: EntradaFugas): Fugas {
  let merma: Fugas["merma"] = null, sobreproduccion: Fugas["sobreproduccion"] = null;
  if (e.mermas !== null && e.meses > 0) {
    const monto = r2(e.mermas / e.meses);
    const pctVenta = e.ventas > 0 ? r1((monto / e.ventas) * 100) : 0;
    const conMotivo = e.porMotivo.filter((m) => m.total > 0);
    const sumaMotivos = conMotivo.reduce((t, m) => t + m.total, 0);
    const motivos = conMotivo.map((m) => ({ motivo: m.motivo, monto: r2(m.total / e.meses), parte: r1((m.total / sumaMotivos) * 100) })).sort((a, b) => b.monto - a.monto);
    merma = { monto, pctVenta, metaPct: e.metaMermaPct, exceso: r2(Math.max(0, monto - e.ventas * (e.metaMermaPct / 100))), motivos };
    const v = motivos.find((m) => m.motivo === MOTIVO_SOBREPRODUCCION);
    if (v) sobreproduccion = { monto: v.monto, parte: v.parte };
  }
  let descuentos: Fugas["descuentos"] = null;
  if (e.descuentos !== null && e.meses > 0) {
    const monto = r2(e.descuentos / e.meses);
    const antes = e.descuentosAntes !== null && e.mesesAntes > 0 ? r2(e.descuentosAntes / e.mesesAntes) : null;
    const cambio = antes === null ? null : r2(monto - antes);
    // Lo vendido ya viene con el descuento restado: el % se mide contra lo que se habría cobrado sin descuento.
    descuentos = { monto, pctVenta: e.ventas + monto > 0 ? r1((monto / (e.ventas + monto)) * 100) : 0, antes, cambio, sube: cambio !== null && antes !== null && cambio > 0 && esCambioReal(cambio, antes) };
  }
  return { merma, sobreproduccion, descuentos };
}

export type Foco = {
  clave: string;
  titulo: string;
  /** Lo que devuelve al mes si se corrige. */
  soles: number;
  /** Lo mismo en puntos de EBITDA (% de la venta). */
  puntos: number;
  porque: string;
  /** true = ya está contado dentro de otro foco (la merma dentro del costo variable). */
  dentroDeOtro?: boolean;
};

const nombre = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();
const s = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const p = (n: number) => `${r1(n).toLocaleString("es-PE")}%`;

/** Los focos, del que más devuelve al que menos. La pantalla muestra los 3 primeros. */
export function focos(e: { ventas: number; variablePct: number; fijos: FilaFijo[]; fugas: Fugas; metaVariablePct?: number }): Foco[] {
  if (e.ventas <= 0) return [];
  const metaVar = e.metaVariablePct ?? 100 / 3;
  const out: Omit<Foco, "puntos">[] = [];
  if (e.variablePct > metaVar) out.push({
    clave: "variable", titulo: "Costo variable", soles: r2(e.ventas * ((e.variablePct - metaVar) / 100)),
    porque: `Está en ${p(e.variablePct)} de la venta. Su tercio es ${p(metaVar)}.`,
  });
  for (const f of e.fijos) {
    if (f.categoria === CAT_PLANILLA) {
      const tope = e.ventas * (TOPE_PLANILLA_PCT / 100);
      if (f.monto > tope) out.push({ clave: "planilla", titulo: "Planilla", soles: r2(f.monto - tope), porque: `Está en ${p(f.pctVenta)} de la venta. Su tope es ${TOPE_PLANILLA_PCT}%.` });
    } else if (f.sube && f.cambio !== null && f.antes !== null) {
      out.push({ clave: `fijo:${f.categoria}`, titulo: nombre(f.categoria), soles: f.cambio, porque: `Subió de ${s(f.antes)} a ${s(f.monto)} al mes.` });
    }
  }
  const { merma, descuentos } = e.fugas;
  if (merma && merma.exceso >= CAMBIO_MINIMO_SOLES) out.push({
    clave: "merma", titulo: "Mermas", soles: merma.exceso, dentroDeOtro: true,
    porque: `Están en ${p(merma.pctVenta)} de la venta. Su tope es ${p(merma.metaPct)}.${merma.motivos[0] ? ` Motivo principal: ${merma.motivos[0].motivo.toLowerCase()}.` : ""}`,
  });
  if (descuentos?.sube && descuentos.cambio !== null && descuentos.antes !== null) out.push({
    clave: "descuentos", titulo: "Descuentos", soles: descuentos.cambio, porque: `Subieron de ${s(descuentos.antes)} a ${s(descuentos.monto)} al mes.`,
  });
  return out.filter((f) => f.soles >= CAMBIO_MINIMO_SOLES).sort((a, b) => b.soles - a.soles).map((f) => ({ ...f, puntos: r1((f.soles / e.ventas) * 100) }));
}

export type Diagnostico = {
  /** Meses que se promediaron y contra cuáles se comparó (del más viejo al más nuevo). */
  meses: string[];
  mesesAntes: string[];
  ventas: number;
  fijos: FilaFijo[];
  totalFijos: number;
  /** El costo variable por categoría (mismas columnas que los fijos). */
  variables: FilaFijo[];
  fugas: Fugas;
  focos: Foco[];
};

export function diagnosticar(e: { recientes: MesGasto[]; previos: MesGasto[]; variablePct: number; fugas: Omit<EntradaFugas, "ventas" | "meses" | "mesesAntes"> }): Diagnostico | null {
  if (e.recientes.length === 0) return null;
  const ventas = r2(prom(e.recientes.map((m) => m.ventas)));
  const fijos = radiografiaFijos(e.recientes, e.previos);
  const fugas = mapaDeFugas({ ...e.fugas, ventas, meses: e.recientes.length, mesesAntes: e.previos.length });
  return {
    meses: e.recientes.map((m) => m.mes), mesesAntes: e.previos.map((m) => m.mes), ventas, fijos,
    totalFijos: r2(fijos.reduce((t, f) => t + f.monto, 0)), variables: radiografiaVariables(e.recientes, e.previos), fugas, focos: focos({ ventas, variablePct: e.variablePct, fijos, fugas }),
  };
}
