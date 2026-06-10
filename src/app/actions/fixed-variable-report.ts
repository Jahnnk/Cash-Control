"use server";

import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { buildFixedVariable, type FixedVariableReport } from "@/lib/fixed-variable";
import { monthLabelEs, monthRangeOf } from "@/lib/partner-report";

const sql = neon(process.env.DATABASE_URL!);

export type FixedVariableMonth = FixedVariableReport & { monthLabel: string };

/**
 * Análisis Fijo/Variable del mes para el negocio activo.
 *
 * Los egresos usan los MISMOS filtros operativos que la base del EBITDA
 * (sin préstamos del socio, sin transferencias internas, sin archivados,
 * sin 'pendiente_atelier') y la porción Atelier en los compartidos —
 * así fijo + variable + sinClasificar = egresos operativos exactos.
 * Solo lectura: no toca EBITDA ni saldos.
 */
export async function getFixedVariableMonth(month: string): Promise<FixedVariableMonth> {
  const bId = await activeBusinessId();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mes inválido");
  const { start, end } = monthRangeOf(month);

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
    (rows as { category: string; amount: number }[]).map((r) => ({
      category: r.category,
      amount: Number(r.amount),
    })),
    (cats as { name: string; exclude_from_ebitda: boolean; cost_group: string | null }[]).map((c) => ({
      name: c.name,
      excludeFromEbitda: c.exclude_from_ebitda,
      costGroup: c.cost_group,
    })),
  );

  return { ...report, monthLabel: monthLabelEs(month) };
}
