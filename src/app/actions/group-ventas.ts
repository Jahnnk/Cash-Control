"use server";

/**
 * Ventas por sede para el Dashboard de Grupo (pedido de Jahnn, jul-2026):
 * "en la vista consolidada de cada sede quiero ver el comparativo de
 * ingresos vs la semana pasada y vs el mes pasado, al último reporte".
 *
 * Reglas de la casa:
 *  - MISMO cerebro que la lámina de ventas del deck (compareVentasSede):
 *    el dashboard jamás puede contradecir la reunión de los viernes.
 *  - MISMA cadena de fuentes que el deck: reporte de Ventas Byte oficial
 *    (byte_ventas_daily) y, si falta, el registro diario como respaldo
 *    (upselling_daily en cafeterías; daily_records de Kelly en Atelier).
 *  - Sede EXPLÍCITA en todas las consultas (lección /grupo: la cookie
 *    aquí dice "grupo" — nada de activeBusinessId()).
 *  - "Al último reporte": la semana comparada es la ÚLTIMA con datos,
 *    no la semana calendario — si Kelly sube los viernes, entre semana
 *    se compara hasta donde hay datos y se dice hasta cuándo.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { compareVentasSede, type VentaRow, type VentasSedeComparison } from "@/lib/kpis/ventas-deck";

const sql = neon(process.env.DATABASE_URL!);

export type GroupVentasSede = VentasSedeComparison & { businessId: number };

const SEDES: [number, string][] = [
  [1, "Atelier"],
  [2, "Fonavi"],
  [3, "Centro"],
];

/** Filas de venta diaria de una sede con la cadena de fuentes del deck. */
async function loadVentaRows(
  bId: number,
  from: string,
): Promise<{ rows: VentaRow[]; fuente: "byte" | "registro" | null }> {
  try {
    const byte = (await sql`
      SELECT date::text AS date, total::float AS total
      FROM byte_ventas_daily
      WHERE business_id = ${bId} AND date >= ${from} AND total > 0
      ORDER BY date
    `) as VentaRow[];
    if (byte.length > 0) return { rows: byte, fuente: "byte" };
  } catch {
    // tabla byte_ventas_daily pendiente de migración → respaldo
  }
  if (bId === 1) {
    const reg = (await sql`
      SELECT date::text AS date, byte_total::float AS total
      FROM daily_records
      WHERE business_id = 1 AND date >= ${from} AND archived = false AND COALESCE(byte_total, 0) > 0
      ORDER BY date
    `) as VentaRow[];
    return { rows: reg, fuente: reg.length > 0 ? "registro" : null };
  }
  const reg = (await sql`
    SELECT date::text AS date, revenue::float AS total
    FROM upselling_daily
    WHERE business_id = ${bId} AND date >= ${from} AND COALESCE(revenue, 0) > 0
    ORDER BY date
  `) as VentaRow[];
  return { rows: reg, fuente: reg.length > 0 ? "registro" : null };
}

function shiftDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getGroupVentasComparison(): Promise<
  | { ok: true; sedes: GroupVentasSede[] }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "Solo para la dirección." };
  }
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    // 70 días cubren la ventana más larga que pide compareVentasSede
    // (mes pasado a mismos días + la semana previa a la última semana).
    const from = shiftDays(today, -70);

    const sedes: GroupVentasSede[] = [];
    for (const [bId, nombre] of SEDES) {
      const { rows, fuente } = await loadVentaRows(bId, from);
      if (rows.length === 0 || fuente === null) {
        sedes.push({
          businessId: bId,
          sede: nombre,
          rango: 0, rangoPrev: null, deltaRangoPct: null,
          mes: 0, mesPrev: null, deltaMesPct: null,
          hasta: null, fuente: null,
        });
        continue;
      }
      // "Al último reporte": la semana es los 7 días que TERMINAN en la
      // última fecha con datos (no la semana calendario a medias).
      const hasta = rows[rows.length - 1].date;
      const ws = shiftDays(hasta, -6);
      sedes.push({ businessId: bId, ...compareVentasSede(nombre, rows, ws, hasta, fuente) });
    }
    return { ok: true, sedes };
  } catch (err) {
    console.error("[getGroupVentasComparison] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar ventas por sede" };
  }
}
