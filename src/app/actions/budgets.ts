"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getBudgets(activeOnly = true) {
  const result = activeOnly
    ? await db.execute(sql`SELECT * FROM budgets WHERE is_active = true ORDER BY has_traffic_light DESC, budget_percentage DESC`)
    : await db.execute(sql`SELECT * FROM budgets ORDER BY has_traffic_light DESC, budget_percentage DESC`);
  return result.rows;
}

export async function getBudgetDashboard(month: string) {
  const startDate = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  // Ingresos brutos del período (bank_income)
  const incomeResult = await db.execute(sql`
    SELECT COALESCE(SUM(bank_income), 0) as total
    FROM daily_records
    WHERE date >= ${startDate} AND date <= ${endDate}
  `);
  const grossIncome = parseFloat(incomeResult.rows[0].total as string);

  // Gasto real por categoría
  const expensesByCategory = await db.execute(sql`
    SELECT category, SUM(amount) as total
    FROM expenses
    WHERE date >= ${startDate} AND date <= ${endDate}
    GROUP BY category
  `);

  const expenseMap = new Map<string, number>();
  let totalSpent = 0;
  for (const row of expensesByCategory.rows) {
    const amount = parseFloat(row.total as string);
    expenseMap.set(row.category as string, amount);
    totalSpent += amount;
  }

  // All active budgets
  const budgets = await db.execute(sql`
    SELECT * FROM budgets WHERE is_active = true ORDER BY has_traffic_light DESC, budget_percentage DESC
  `);

  // Build dashboard data
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
  if (data.budgetPercentage !== undefined) {
    await db.execute(sql`UPDATE budgets SET budget_percentage = ${data.budgetPercentage}, updated_at = now() WHERE id = ${id}`);
  }
  if (data.costType !== undefined) {
    await db.execute(sql`UPDATE budgets SET cost_type = ${data.costType}, updated_at = now() WHERE id = ${id}`);
  }
  if (data.thresholdGreen !== undefined) {
    await db.execute(sql`UPDATE budgets SET threshold_green = ${data.thresholdGreen}, updated_at = now() WHERE id = ${id}`);
  }
  if (data.thresholdYellow !== undefined) {
    await db.execute(sql`UPDATE budgets SET threshold_yellow = ${data.thresholdYellow}, updated_at = now() WHERE id = ${id}`);
  }
  if (data.description !== undefined) {
    await db.execute(sql`UPDATE budgets SET description = ${data.description}, updated_at = now() WHERE id = ${id}`);
  }
  if (data.isActive !== undefined) {
    await db.execute(sql`UPDATE budgets SET is_active = ${data.isActive}, updated_at = now() WHERE id = ${id}`);
  }
  revalidatePath("/presupuesto");
  revalidatePath("/configuracion");
}

export async function createBudget(data: {
  categoryName: string;
  budgetPercentage: number;
  costType: string;
  hasTrafficLight: boolean;
  description?: string;
}) {
  await db.execute(sql`
    INSERT INTO budgets (category_name, budget_percentage, cost_type, has_traffic_light, description)
    VALUES (${data.categoryName}, ${data.budgetPercentage}, ${data.costType}, ${data.hasTrafficLight}, ${data.description || null})
  `);
  revalidatePath("/presupuesto");
  revalidatePath("/configuracion");
}
