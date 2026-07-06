"use server";

/**
 * Punto de equilibrio · Actions (por sede y consolidado del grupo).
 *
 * Fuentes (todas ya existentes — no se inventa nada):
 * - Ventas del mes: Byte por día (byte_sales_daily → daily_records →
 *   registro diario del admin en upselling_daily, en ese orden).
 * - Fijos/variables: la clasificación de categorías de egreso que Jahnn
 *   mantiene en Configuración (cost_group), con los MISMOS filtros
 *   operativos del EBITDA (buildFixedVariable).
 * El motor puro vive en lib/breakeven.ts.
 */

import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { requireFullSession } from "@/lib/session-access";
import { buildFixedVariable } from "@/lib/fixed-variable";
import { computeBreakeven, type BreakevenResult } from "@/lib/breakeven";

const sql = neon(process.env.DATABASE_URL!);

const SEDE_NAMES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

function monthMeta(month: string) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = `${month}-01`;
  const end = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const today = todayLima();
  const isCurrent = month === today.slice(0, 7);
  const daysElapsed = isCurrent ? Number(today.slice(8, 10)) : daysInMonth;
  return { start, end, daysInMonth, daysElapsed, isCurrent };
}

/** Ventas Byte del mes de una sede (misma cadena de fuentes del PIC). */
async function monthSales(bId: number, start: string, end: string): Promise<number> {
  const rows = (await sql`
    SELECT COALESCE(
      NULLIF((SELECT SUM(total)::float FROM byte_sales_daily
              WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}), 0),
      NULLIF((SELECT SUM(byte_total)::float FROM daily_records
              WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end} AND archived = false), 0),
      NULLIF((SELECT SUM(revenue)::float FROM upselling_daily
              WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}), 0),
      0
    ) AS total
  `) as { total: number }[];
  return rows[0]?.total ?? 0;
}

/** Fijos/variables/sin-clasificar operativos del mes de una sede. */
async function monthCosts(bId: number, start: string, end: string) {
  const [rows, cats] = await Promise.all([
    sql`
      SELECT category,
             (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS amount
      FROM expenses
      WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end}
        AND is_special_loan = false AND is_internal_transfer = false AND archived = false
        AND payment_method <> 'pendiente_atelier'
    `,
    sql`
      SELECT name, exclude_from_ebitda, cost_group
      FROM expense_categories WHERE business_id = ${bId}
    `,
  ]);
  const report = buildFixedVariable(
    (rows as { category: string; amount: number }[]).map((r) => ({ category: r.category, amount: Number(r.amount) })),
    (cats as { name: string; exclude_from_ebitda: boolean; cost_group: string | null }[]).map((c) => ({
      name: c.name,
      excludeFromEbitda: c.exclude_from_ebitda,
      costGroup: c.cost_group,
    })),
  );
  return {
    fijos: report.fijo.total,
    variables: report.variable.total,
    sinClasificar: report.sinClasificar.total,
  };
}

async function breakevenOf(bId: number, month: string): Promise<BreakevenResult> {
  const { start, end, daysInMonth, daysElapsed } = monthMeta(month);
  const [ventas, costs] = await Promise.all([
    monthSales(bId, start, end),
    monthCosts(bId, start, end),
  ]);
  return computeBreakeven({ ...costs, ventas, daysElapsed, daysInMonth });
}

/** Punto de equilibrio del mes para la sede activa (dashboard de sede). */
export async function getBreakevenMonth(month: string): Promise<
  | { ok: true; data: BreakevenResult; isCurrent: boolean }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    const bId = await activeBusinessId();
    const data = await breakevenOf(bId, month);
    return { ok: true, data, isCurrent: monthMeta(month).isCurrent };
  } catch (err) {
    console.error("[getBreakevenMonth] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al calcular el punto de equilibrio" };
  }
}

export type GroupBreakeven = {
  month: string;
  isCurrent: boolean;
  sedes: { businessId: number; name: string; result: BreakevenResult }[];
  /** Consolidado: Σ fijos / (1 − Σ variables / Σ ventas). */
  grupo: BreakevenResult;
};

/** Punto de equilibrio por sede + consolidado (dashboard del grupo). */
export async function getGroupBreakeven(month: string): Promise<
  | { ok: true; data: GroupBreakeven }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    const { start, end, daysInMonth, daysElapsed, isCurrent } = monthMeta(month);
    const ids = [1, 2, 3];
    const perSede = await Promise.all(
      ids.map(async (bId) => {
        const [ventas, costs] = await Promise.all([
          monthSales(bId, start, end),
          monthCosts(bId, start, end),
        ]);
        return { bId, ventas, ...costs };
      }),
    );
    const sedes = perSede.map((s) => ({
      businessId: s.bId,
      name: SEDE_NAMES[s.bId] ?? `Negocio ${s.bId}`,
      result: computeBreakeven({
        fijos: s.fijos,
        variables: s.variables,
        sinClasificar: s.sinClasificar,
        ventas: s.ventas,
        daysElapsed,
        daysInMonth,
      }),
    }));
    const grupo = computeBreakeven({
      fijos: perSede.reduce((t, s) => t + s.fijos, 0),
      variables: perSede.reduce((t, s) => t + s.variables, 0),
      sinClasificar: perSede.reduce((t, s) => t + s.sinClasificar, 0),
      ventas: perSede.reduce((t, s) => t + s.ventas, 0),
      daysElapsed,
      daysInMonth,
    });
    return { ok: true, data: { month, isCurrent, sedes, grupo } };
  } catch (err) {
    console.error("[getGroupBreakeven] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al calcular el punto de equilibrio del grupo" };
  }
}
