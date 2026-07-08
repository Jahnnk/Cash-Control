"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

export async function getBudgets(activeOnly = true) {
  const bId = await activeBusinessId();
  const result = activeOnly
    ? await db.execute(sql`SELECT * FROM budgets WHERE business_id = ${bId} AND is_active = true ORDER BY has_traffic_light DESC, budget_percentage DESC`)
    : await db.execute(sql`SELECT * FROM budgets WHERE business_id = ${bId} ORDER BY has_traffic_light DESC, budget_percentage DESC`);
  return result.rows;
}

/** Ingresos bancarios de un mes completo (misma base que usaba el presupuesto). */
async function monthBankIncome(bId: number, month: string): Promise<number> {
  const [y, m] = month.split("-").map(Number);
  const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(bank_income), 0) as total
    FROM daily_records
    WHERE business_id = ${bId} AND date >= ${month + "-01"} AND date <= ${end}
  `);
  return parseFloat(r.rows[0].total as string);
}

export async function getBudgetDashboard(month: string) {
  const bId = await activeBusinessId();
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  // Lo realmente cobrado en el mes navegado (en el mes en curso: hasta hoy).
  const realIncome = await monthBankIncome(bId, month);

  // BASE del presupuesto. La trampa detectada por Jahnn: en el mes en
  // curso, usar lo cobrado hasta hoy castiga a Atelier (los clientes B2B
  // pagan a 7/15/30+ días y los fijos como el alquiler caen al inicio del
  // mes) — todo se pintaba de rojo los primeros días. Por eso:
  //  - Mes CERRADO: base = ingresos reales del mes completo (como siempre).
  //  - Mes EN CURSO: base = promedio de los últimos meses cerrados con
  //    ingresos (hasta 3, mirando máx. 6 atrás) — una proyección estable
  //    desde el día 1. Misma receta que el punto de equilibrio.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const isCurrent = month === today.slice(0, 7);
  let grossIncome = realIncome;
  let baseSource: "real" | "proyectada" = "real";
  let referenceMonths: string[] = [];
  if (isCurrent) {
    const candidates: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(Date.UTC(year, m - 1 - i, 1));
      candidates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    const prev = await Promise.all(
      candidates.map(async (c) => ({ month: c, total: await monthBankIncome(bId, c) })),
    );
    const usable = prev.filter((r) => r.total > 0).slice(0, 3);
    if (usable.length > 0) {
      grossIncome = Math.round((usable.reduce((s, r) => s + r.total, 0) / usable.length) * 100) / 100;
      baseSource = "proyectada";
      referenceMonths = usable.map((r) => r.month).sort();
    }
  }

  // Excluye préstamos del socio: no son gasto operativo.
  const expensesByCategory = await db.execute(sql`
    SELECT category, SUM(amount) as total
    FROM expenses
    WHERE business_id = ${bId} AND date >= ${startDate} AND date <= ${endDate} AND is_special_loan = false AND is_internal_transfer = false AND archived = false
    GROUP BY category
  `);

  const expenseMap = new Map<string, number>();
  let totalSpent = 0;
  for (const row of expensesByCategory.rows) {
    const amount = parseFloat(row.total as string);
    expenseMap.set(row.category as string, amount);
    totalSpent += amount;
  }

  const budgets = await db.execute(sql`
    SELECT * FROM budgets WHERE business_id = ${bId} AND is_active = true ORDER BY has_traffic_light DESC, budget_percentage DESC
  `);

  const categories = budgets.rows.map((b) => {
    const name = b.category_name as string;
    const pct = parseFloat((b.budget_percentage as string) || "0");
    const hasTrafficLight = b.has_traffic_light as boolean;
    const thresholdGreen = Number(b.threshold_green) || 70;
    const thresholdYellow = Number(b.threshold_yellow) || 90;
    const spent = expenseMap.get(name) || 0;
    const budgetSoles = grossIncome > 0 ? grossIncome * (pct / 100) : 0;
    const consumedPct = budgetSoles > 0 ? (spent / budgetSoles) * 100 : (spent > 0 ? 100 : 0);

    let color: "green" | "yellow" | "red" = "green";
    if (hasTrafficLight && consumedPct >= thresholdYellow) color = "red";
    else if (hasTrafficLight && consumedPct >= thresholdGreen) color = "yellow";

    return {
      id: b.id as string,
      name,
      percentage: pct,
      costType: b.cost_type as string,
      hasTrafficLight,
      thresholdGreen,
      thresholdYellow,
      description: b.description as string,
      spent,
      budgetSoles,
      consumedPct: Math.round(consumedPct * 10) / 10,
      color,
    };
  });

  const operativos = categories.filter((c) => c.hasTrafficLight);
  const obligaciones = categories.filter((c) => !c.hasTrafficLight);
  const totalOperativo = operativos.reduce((s, c) => s + c.spent, 0);
  const totalObligaciones = obligaciones.reduce((s, c) => s + c.spent, 0);
  const spentPct = grossIncome > 0 ? (totalSpent / grossIncome) * 100 : 0;
  const alerts = operativos.filter((c) => c.color === "red" || c.color === "yellow");

  return {
    grossIncome,
    /** Lo realmente cobrado en el mes (hasta hoy si es el mes en curso). */
    realIncome,
    /** "proyectada" = base del promedio de meses cerrados (mes en curso). */
    baseSource,
    referenceMonths,
    totalSpent,
    totalOperativo,
    totalObligaciones,
    spentPct: Math.round(spentPct * 10) / 10,
    utilidad: grossIncome - totalSpent,
    operativos,
    obligaciones,
    alerts,
  };
}

export async function updateBudget(
  id: string,
  data: {
    budgetPercentage?: number;
    costType?: string;
    thresholdGreen?: number;
    thresholdYellow?: number;
    description?: string;
    isActive?: boolean;
  }
) {
  const bId = await activeBusinessId();
  if (data.budgetPercentage !== undefined) {
    await db.execute(sql`UPDATE budgets SET budget_percentage = ${data.budgetPercentage}, updated_at = now() WHERE id = ${id} AND business_id = ${bId}`);
  }
  if (data.costType !== undefined) {
    await db.execute(sql`UPDATE budgets SET cost_type = ${data.costType}, updated_at = now() WHERE id = ${id} AND business_id = ${bId}`);
  }
  if (data.thresholdGreen !== undefined) {
    await db.execute(sql`UPDATE budgets SET threshold_green = ${data.thresholdGreen}, updated_at = now() WHERE id = ${id} AND business_id = ${bId}`);
  }
  if (data.thresholdYellow !== undefined) {
    await db.execute(sql`UPDATE budgets SET threshold_yellow = ${data.thresholdYellow}, updated_at = now() WHERE id = ${id} AND business_id = ${bId}`);
  }
  if (data.description !== undefined) {
    await db.execute(sql`UPDATE budgets SET description = ${data.description}, updated_at = now() WHERE id = ${id} AND business_id = ${bId}`);
  }
  if (data.isActive !== undefined) {
    await db.execute(sql`UPDATE budgets SET is_active = ${data.isActive}, updated_at = now() WHERE id = ${id} AND business_id = ${bId}`);
  }
  revalidatePath("/", "layout");
}

export async function createBudget(data: {
  categoryName: string;
  budgetPercentage: number;
  costType: string;
  hasTrafficLight: boolean;
  description?: string;
}) {
  const bId = await activeBusinessId();
  await db.execute(sql`
    INSERT INTO budgets (business_id, category_name, budget_percentage, cost_type, has_traffic_light, description)
    VALUES (${bId}, ${data.categoryName}, ${data.budgetPercentage}, ${data.costType}, ${data.hasTrafficLight}, ${data.description || null})
  `);
  revalidatePath("/", "layout");
}
