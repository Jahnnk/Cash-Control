/**
 * Lee lo que hace falta para `evaluarReporteProductos`: lo que suma el reporte de productos del mes (los periodos que cuentan,
 * rotacion_efectiva) y la venta diaria de Byte de esos mismos días. No es "use server".
 */

import { evaluarReporteProductos, type Confiabilidad } from "./confiabilidad";

/** Firma mínima del template tag de @neondatabase/serverless. */
type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

const NOMBRES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

export async function confiabilidadDelMes(sql: SqlTag, bId: number, month: string): Promise<Confiabilidad> {
  const p = (await sql`
    SELECT COALESCE(SUM(revenue), 0)::float AS r, MIN(period_start)::text AS i, MAX(period_end)::text AS f FROM rotacion_efectiva(${bId}, ${month})
  `) as { r: number; i: string | null; f: string | null }[];
  const fila = p[0];
  if (!fila?.i || !fila.f) return { confiable: true, productos: 0, byte: 0, difPct: null, motivo: null };
  const v = (await sql`
    SELECT COALESCE(SUM(total), 0)::float AS t FROM byte_ventas_efectiva WHERE business_id = ${bId} AND date BETWEEN ${fila.i} AND ${fila.f}
  `) as { t: number }[];
  return evaluarReporteProductos({ sede: NOMBRES[bId] ?? `Sede ${bId}`, mes: month, productos: fila.r, byte: v[0]?.t ?? 0 });
}

/** Los meses de una sede cuyo reporte de productos no es confiable (para sacarlos del historial). */
export async function mesesNoConfiables(sql: SqlTag, bId: number, meses: string[]): Promise<Set<string>> {
  const r = await Promise.all(meses.map(async (m) => [m, await confiabilidadDelMes(sql, bId, m)] as const));
  return new Set(r.filter(([, c]) => !c.confiable).map(([m]) => m));
}
