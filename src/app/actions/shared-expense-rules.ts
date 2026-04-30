"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type SharedRule = {
  id: string;
  category_id: string;
  category_name: string;
  concept: string;
  atelier_percentage: number;
  fonavi_percentage: number;
  active: boolean;
};

export async function getSharedRules(): Promise<SharedRule[]> {
  const rows = await db.execute(sql`
    SELECT
      r.id::text as id,
      r.category_id::text as category_id,
      ec.name as category_name,
      r.concept,
      r.atelier_percentage::float as atelier_percentage,
      r.fonavi_percentage::float as fonavi_percentage,
      r.active
    FROM shared_expense_rules r
    JOIN expense_categories ec ON ec.id = r.category_id
    ORDER BY r.active DESC, ec.name ASC, r.concept ASC
  `);
  return rows.rows as unknown as SharedRule[];
}

// Devuelve TODAS las reglas activas para una categoría (puede haber varias por concepto distinto)
export async function getActiveRulesForCategory(categoryName: string): Promise<SharedRule[]> {
  const rows = await db.execute(sql`
    SELECT
      r.id::text as id,
      r.category_id::text as category_id,
      ec.name as category_name,
      r.concept,
      r.atelier_percentage::float as atelier_percentage,
      r.fonavi_percentage::float as fonavi_percentage,
      r.active
    FROM shared_expense_rules r
    JOIN expense_categories ec ON ec.id = r.category_id
    WHERE r.active = true AND ec.name = ${categoryName}
    ORDER BY r.concept ASC
  `);
  return rows.rows as unknown as SharedRule[];
}

export async function createSharedRule(data: {
  categoryId: string;
  concept: string;
  atelierPercentage: number;
  fonaviPercentage: number;
}) {
  if (Math.round((data.atelierPercentage + data.fonaviPercentage) * 100) / 100 !== 100) {
    return { success: false, error: "Los porcentajes deben sumar 100%" };
  }
  if (data.atelierPercentage < 0 || data.fonaviPercentage < 0) {
    return { success: false, error: "Los porcentajes no pueden ser negativos" };
  }
  const concept = data.concept.trim();
  if (!concept) return { success: false, error: "El concepto no puede estar vacío" };

  // Si ya hay regla activa para esa (categoría, concepto), desactivarla
  await db.execute(sql`
    UPDATE shared_expense_rules SET active = false, updated_at = now()
    WHERE category_id = ${data.categoryId} AND concept = ${concept} AND active = true
  `);

  await db.execute(sql`
    INSERT INTO shared_expense_rules (category_id, concept, atelier_percentage, fonavi_percentage, active)
    VALUES (${data.categoryId}, ${concept}, ${data.atelierPercentage}, ${data.fonaviPercentage}, true)
  `);

  revalidatePath("/configuracion");
  revalidatePath("/registro");
  return { success: true };
}

export async function deactivateSharedRule(id: string) {
  await db.execute(sql`
    UPDATE shared_expense_rules SET active = false, updated_at = now() WHERE id = ${id}
  `);
  revalidatePath("/configuracion");
  revalidatePath("/registro");
  return { success: true };
}

export async function reactivateSharedRule(id: string) {
  const target = await db.execute(sql`SELECT category_id, concept FROM shared_expense_rules WHERE id = ${id}`);
  const row = target.rows[0] as { category_id: string; concept: string } | undefined;
  if (!row) return { success: false, error: "Regla no encontrada" };

  await db.execute(sql`
    UPDATE shared_expense_rules SET active = false, updated_at = now()
    WHERE category_id = ${row.category_id} AND concept = ${row.concept} AND active = true
  `);
  await db.execute(sql`
    UPDATE shared_expense_rules SET active = true, updated_at = now() WHERE id = ${id}
  `);
  revalidatePath("/configuracion");
  revalidatePath("/registro");
  return { success: true };
}
