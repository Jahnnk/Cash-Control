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
import { computeBreakeven, type BreakevenResult, type BreakevenReference } from "@/lib/breakeven";

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

function prevMonths(month: string, n: number): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out; // del más reciente al más antiguo
}

/** Agregado interno de la referencia (permite consolidar el grupo). */
type RefAgg = BreakevenReference & { sumVariables: number; sumVentas: number };

/**
 * Referencia histórica para el MES EN CURSO: hasta 3 meses cerrados con
 * fijos clasificados Y ventas (mirando máx. 6 atrás). Fijos = promedio
 * mensual; ratio variable = Σvariables/Σventas de esos meses.
 * Sin la referencia, comparar contra los fijos registrados a la fecha
 * daría un equilibrio falso de bajo (lección del piloto de Jahnn).
 */
async function buildReference(bId: number, month: string): Promise<RefAgg | null> {
  const candidates = prevMonths(month, 6);
  const rows = await Promise.all(
    candidates.map(async (m) => {
      const { start, end } = monthMeta(m);
      const [ventas, costs] = await Promise.all([
        monthSales(bId, start, end),
        monthCosts(bId, start, end),
      ]);
      return { month: m, ventas, ...costs };
    }),
  );
  const usable = rows.filter((r) => r.fijos > 0 && r.ventas > 0).slice(0, 3);
  if (usable.length === 0) return null;
  const sumVariables = usable.reduce((s, r) => s + r.variables, 0);
  const sumVentas = usable.reduce((s, r) => s + r.ventas, 0);
  return {
    fijos: usable.reduce((s, r) => s + r.fijos, 0) / usable.length,
    varRatio: sumVentas > 0 ? sumVariables / sumVentas : 0,
    monthsUsed: usable.map((r) => r.month).sort(),
    sumVariables,
    sumVentas,
  };
}

async function breakevenOf(bId: number, month: string): Promise<BreakevenResult> {
  const { start, end, daysInMonth, daysElapsed, isCurrent } = monthMeta(month);
  const [ventas, costs, reference] = await Promise.all([
    monthSales(bId, start, end),
    monthCosts(bId, start, end),
    isCurrent ? buildReference(bId, month) : Promise.resolve(null),
  ]);
  if (isCurrent && !reference) {
    // Sin meses cerrados con datos no hay contra qué compararse — se
    // dice claro, nunca un "superado" falso con fijos a medio registrar.
    const r = computeBreakeven({ ...costs, fijos: 0, ventas, daysElapsed, daysInMonth });
    r.warnings = [
      ...r.warnings.filter((w) => !w.includes("No hay costos fijos clasificados")),
      "Mes en curso sin referencia histórica: se necesita al menos un mes cerrado con ventas y costos fijos clasificados para calcular el equilibrio.",
    ];
    return r;
  }
  return computeBreakeven({ ...costs, ventas, daysElapsed, daysInMonth, reference });
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
        const [ventas, costs, reference] = await Promise.all([
          monthSales(bId, start, end),
          monthCosts(bId, start, end),
          isCurrent ? buildReference(bId, month) : Promise.resolve(null),
        ]);
        return { bId, ventas, reference, ...costs };
      }),
    );
    const sedes = perSede.map((s) => {
      if (isCurrent && !s.reference) {
        const r = computeBreakeven({
          fijos: 0, variables: s.variables, sinClasificar: s.sinClasificar,
          ventas: s.ventas, daysElapsed, daysInMonth,
        });
        r.warnings = [
          ...r.warnings.filter((w) => !w.includes("No hay costos fijos clasificados")),
          "Mes en curso sin referencia histórica: se necesita al menos un mes cerrado con ventas y costos fijos clasificados.",
        ];
        return { businessId: s.bId, name: SEDE_NAMES[s.bId] ?? `Negocio ${s.bId}`, result: r };
      }
      return {
        businessId: s.bId,
        name: SEDE_NAMES[s.bId] ?? `Negocio ${s.bId}`,
        result: computeBreakeven({
          fijos: s.fijos,
          variables: s.variables,
          sinClasificar: s.sinClasificar,
          ventas: s.ventas,
          daysElapsed,
          daysInMonth,
          reference: s.reference,
        }),
      };
    });

    let grupo: BreakevenResult;
    if (isCurrent) {
      // Consolidado del mes en curso: SOLO las sedes con referencia
      // histórica (fijos y ventas de las demás quedan fuera — se avisa).
      const withRef = perSede.filter((s) => s.reference);
      const sumVar = withRef.reduce((t, s) => t + s.reference!.sumVariables, 0);
      const sumVen = withRef.reduce((t, s) => t + s.reference!.sumVentas, 0);
      const groupRef: BreakevenReference | null =
        withRef.length > 0
          ? {
              fijos: withRef.reduce((t, s) => t + s.reference!.fijos, 0),
              varRatio: sumVen > 0 ? sumVar / sumVen : 0,
              monthsUsed: [...new Set(withRef.flatMap((s) => s.reference!.monthsUsed))].sort(),
            }
          : null;
      grupo = computeBreakeven({
        fijos: 0,
        variables: withRef.reduce((t, s) => t + s.variables, 0),
        sinClasificar: perSede.reduce((t, s) => t + s.sinClasificar, 0),
        ventas: withRef.reduce((t, s) => t + s.ventas, 0),
        daysElapsed,
        daysInMonth,
        reference: groupRef,
      });
      const sinRef = perSede.filter((s) => !s.reference).map((s) => SEDE_NAMES[s.bId]);
      if (sinRef.length > 0 && groupRef) {
        grupo.warnings.push(
          `El consolidado solo incluye sedes con referencia histórica — falta: ${sinRef.join(", ")} (clasificar sus categorías fijo/variable y cerrar un mes con ventas).`,
        );
      }
    } else {
      grupo = computeBreakeven({
        fijos: perSede.reduce((t, s) => t + s.fijos, 0),
        variables: perSede.reduce((t, s) => t + s.variables, 0),
        sinClasificar: perSede.reduce((t, s) => t + s.sinClasificar, 0),
        ventas: perSede.reduce((t, s) => t + s.ventas, 0),
        daysElapsed,
        daysInMonth,
      });
    }
    return { ok: true, data: { month, isCurrent, sedes, grupo } };
  } catch (err) {
    console.error("[getGroupBreakeven] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al calcular el punto de equilibrio del grupo" };
  }
}
