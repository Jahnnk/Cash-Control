/**
 * Cargador ÚNICO de venta diaria por sede — la respuesta al incidente de
 * precisión de jul-2026: el dashboard de Grupo decía "sin comparación vs
 * mes pasado" teniendo junio completo (vivía en byte_sales_daily, que
 * nadie miraba) y "+205.9% vs semana pasada" (una fuente joven a medio
 * cargar comparada contra sí misma).
 *
 * Regla de la casa (patrón multi-fuente): se combinan las fuentes POR
 * DÍA, y el dato más oficial manda:
 *   1. byte_ventas_daily  — reporte "Ventas" de Byte (oficial).
 *   2. byte_sales_daily   — Excel financiero de Kelly (también Byte,
 *                           transcrito; historia profunda de Fonavi).
 *   3. registro diario    — upselling_daily (cafeterías) /
 *                           daily_records.byte_total (Atelier), manual.
 *
 * Todo lector de venta diaria (deck de la reunión, dashboard de Grupo)
 * debe pasar por aquí: dos lectores con cadenas distintas = dos
 * verdades distintas, y eso ya nos pasó.
 */

import type { VentaRow } from "./ventas-deck";

/** Firma mínima del template tag de @neondatabase/serverless. */
type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

export type VentaRowsBlended = {
  rows: VentaRow[];
  /** 'byte' = todo salió de reportes Byte; 'registro' = todo manual;
   * 'mixta' = días de ambos (el oficial mandó día por día). */
  fuente: "byte" | "registro" | "mixta" | null;
};

export async function loadVentaRowsBlended(
  sql: SqlTag,
  bId: number,
  from: string,
  to: string,
): Promise<VentaRowsBlended> {
  // Prioridad 1 y 2: reportes de Byte (oficial primero).
  let byte: VentaRow[] = [];
  try {
    byte = (await sql`
      SELECT date::text AS date, total::float AS total
      FROM byte_ventas_daily
      WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to} AND total > 0
    `) as VentaRow[];
  } catch { /* tabla pendiente de migración */ }
  let kelly: VentaRow[] = [];
  try {
    kelly = (await sql`
      SELECT date::text AS date, total::float AS total
      FROM byte_sales_daily
      WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to} AND COALESCE(total, 0) > 0
    `) as VentaRow[];
  } catch { /* tabla pendiente de migración */ }

  // Prioridad 3: registro diario manual.
  const registro: VentaRow[] = bId === 1
    ? ((await sql`
        SELECT date::text AS date, byte_total::float AS total
        FROM daily_records
        WHERE business_id = 1 AND date BETWEEN ${from} AND ${to}
          AND archived = false AND COALESCE(byte_total, 0) > 0
      `) as VentaRow[])
    : ((await sql`
        SELECT date::text AS date, revenue::float AS total
        FROM upselling_daily
        WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to} AND COALESCE(revenue, 0) > 0
      `) as VentaRow[]);

  const byDate = new Map<string, { total: number; src: "byte" | "registro" }>();
  for (const r of registro) byDate.set(r.date, { total: r.total, src: "registro" });
  for (const r of kelly) byDate.set(r.date, { total: r.total, src: "byte" });
  for (const r of byte) byDate.set(r.date, { total: r.total, src: "byte" });

  if (byDate.size === 0) return { rows: [], fuente: null };
  const rows = [...byDate.entries()]
    .map(([date, v]) => ({ date, total: v.total }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const srcs = new Set([...byDate.values()].map((v) => v.src));
  const fuente = srcs.size > 1 ? "mixta" : srcs.has("byte") ? "byte" : "registro";
  return { rows, fuente };
}
