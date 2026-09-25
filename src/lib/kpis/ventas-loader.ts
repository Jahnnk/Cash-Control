/**
 * Cargador ÚNICO de venta diaria por sede — la respuesta al incidente de
 * precisión de jul-2026: el dashboard de Grupo decía "sin comparación vs
 * mes pasado" teniendo junio completo (vivía en byte_sales_daily, que
 * nadie miraba) y "+205.9% vs semana pasada" (una fuente joven a medio
 * cargar comparada contra sí misma).
 *
 * Regla de la casa (patrón multi-fuente): se combinan las fuentes POR
 * DÍA con la regla de dos de tres (venta-del-dia.ts, 25-sep-2026):
 *   1. byte_ventas_daily  — reporte "Ventas" de Byte (oficial, source='import').
 *   2. byte_sales_daily   — el Excel financiero (también Byte, transcrito;
 *                           total_pos_excel, con crédito).
 *   3. registro del admin — upselling_daily (cafeterías) / lo que teclea la
 *                           supervisora o daily_records (Atelier).
 * Manda Byte, salvo que Byte y el Excel difieran y el administrador
 * confirme el Excel.
 *
 * Todo lector de venta diaria (deck de la reunión, dashboard de Grupo)
 * debe pasar por aquí: dos lectores con cadenas distintas = dos
 * verdades distintas, y eso ya nos pasó.
 */

import type { VentaRow } from "./ventas-deck";
import { elegirVentaDia } from "./venta-del-dia";

/** Firma mínima del template tag de @neondatabase/serverless. */
type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

export type VentaRowsBlended = {
  rows: VentaRow[];
  /** 'byte' = todo salió de reportes Byte; 'registro' = todo manual;
   * 'mixta' = días de ambos (el oficial mandó día por día). */
  fuente: "byte" | "registro" | "mixta" | null;
};

/** Las tres fuentes de venta diaria, por separado (para la verificación contra Kelly). */
export type FuentesVentaDia = { byte: VentaRow[]; kelly: VentaRow[]; registro: VentaRow[] };

export async function leerFuentesVenta(
  sql: SqlTag,
  bId: number,
  from: string,
  to: string,
): Promise<FuentesVentaDia> {
  // Prioridad 1 y 2: reportes de Byte (oficial primero).
  let byte: VentaRow[] = [];
  try {
    // Solo el reporte oficial: lo que la supervisora de Atelier teclea en
    // su panel también se guarda aquí (source='manual'), pero es dato del
    // administrador, no de Byte.
    byte = (await sql`
      SELECT date::text AS date, total::float AS total
      FROM byte_ventas_daily
      WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to} AND total > 0
        AND COALESCE(source, 'import') = 'import'
    `) as VentaRow[];
  } catch { /* tabla pendiente de migración */ }
  let kelly: VentaRow[] = [];
  try {
    // La venta del día según Byte, TAL COMO la copia Kelly en "Control de
    // VTAS": la columna de Byte (total_pos_excel), con las ventas al crédito
    // incluidas — igual que el reporte oficial de Byte. `total` (efectivo +
    // Yape + POS del lado Cuentas) dejaba afuera el crédito (Atelier, que
    // vende casi todo a crédito, salía en 0) y usaba montos manuales de un
    // día que Byte aún no cerraba (25-sep-2026). Cargas viejas sin esa
    // columna caen al `total` de antes.
    kelly = (await sql`
      SELECT date::text AS date, COALESCE(total_pos_excel, total)::float AS total
      FROM byte_sales_daily
      WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to} AND COALESCE(total_pos_excel, total, 0) > 0
    `) as VentaRow[];
  } catch { /* tabla pendiente de migración */ }

  // El registro del administrador: tercera opinión independiente. En las
  // cafeterías, lo que teclea el admin en su panel; en Atelier, lo de la
  // supervisora (mientras el reporte de Byte no lo pise) o, si no hay, el
  // cierre diario de dirección. Lo copiado del reporte de Byte
  // (source='import') no cuenta: no es una opinión distinta.
  const registro: VentaRow[] = bId === 1
    ? ((await sql`
        SELECT date::text AS date, total::float AS total FROM byte_ventas_daily
        WHERE business_id = 1 AND date BETWEEN ${from} AND ${to} AND total > 0 AND source = 'manual'
        UNION ALL
        SELECT date::text, byte_total::float FROM daily_records d
        WHERE business_id = 1 AND date BETWEEN ${from} AND ${to} AND archived = false AND COALESCE(byte_total, 0) > 0
          AND NOT EXISTS (SELECT 1 FROM byte_ventas_daily v WHERE v.business_id = 1 AND v.date = d.date AND v.source = 'manual' AND v.total > 0)
      `) as VentaRow[])
    : ((await sql`
        SELECT date::text AS date, revenue::float AS total
        FROM upselling_daily
        WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to} AND COALESCE(revenue, 0) > 0
          AND COALESCE(source, 'manual') <> 'import'
      `) as VentaRow[]);

  return { byte, kelly, registro };
}

export async function loadVentaRowsBlended(
  sql: SqlTag,
  bId: number,
  from: string,
  to: string,
): Promise<VentaRowsBlended> {
  const { byte, kelly, registro } = await leerFuentesVenta(sql, bId, from, to);
  // Día por día, la regla de dos de tres (venta-del-dia.ts).
  const b = new Map(byte.map((r) => [r.date, r.total]));
  const e = new Map(kelly.map((r) => [r.date, r.total]));
  const a = new Map(registro.map((r) => [r.date, r.total]));
  const byDate = new Map<string, { total: number; src: "byte" | "registro" }>();
  for (const d of new Set([...b.keys(), ...e.keys(), ...a.keys()])) {
    const x = elegirVentaDia(b.get(d), e.get(d), a.get(d));
    if (x) byDate.set(d, { total: x.total, src: x.fuente === "admin" ? "registro" : "byte" });
  }

  if (byDate.size === 0) return { rows: [], fuente: null };
  const rows = [...byDate.entries()]
    .map(([date, v]) => ({ date, total: v.total }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const srcs = new Set([...byDate.values()].map((v) => v.src));
  const fuente = srcs.size > 1 ? "mixta" : srcs.has("byte") ? "byte" : "registro";
  return { rows, fuente };
}
