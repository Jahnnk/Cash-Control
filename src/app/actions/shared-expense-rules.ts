"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type SharedRule = {
  id: string;
  category_id: string;
  category_name: string;
  atelier_percentage: number;
  fonavi_percentage: number;
  active: boolean;
};

// Listar todas las reglas (activas + inactivas) con nombre de categoría
export async function getSharedRules(): Promise<SharedRule[]> {
  const rows = await db.execute(sql`
    SELECT
      r.id::text as id,
      r.category_id::text as category_id,
      ec.name as category_name,
      r.atelier_percentage::float as atelier_percentage,
      r.fonavi_percentage::float as fonavi_percentage,
      r.active
    FROM shared_expense_rules r
    JOIN expense_categories ec ON ec.id = r.category_id
    ORDER BY r.active DESC, ec.name ASC
  `);
  return rows.rows as unknown as SharedRule[];
}

// Devolver la regla ACTIVA para un nombre de categoría (lookup desde el form de egreso)
export async function getActiveRuleForCategory(categoryName: string): Promise<SharedRule | null> {
  const rows = await db.execute(sql`
    SELECT
      r.id::text as id,
      r.category_id::text as category_id,
      ec.name as category_name,
      r.atelier_percentage::float as atelier_percentage,
      r.fonavi_percentage::float as fonavi_percentage,
      r.active
    FROM shared_expense_rules r
    JOIN expense_categories ec ON ec.id = r.category_id
    WHERE r.active = true AND ec.name = ${categoryName}
    LIMIT 1
  `);
  return (rows.rows[0] as unknown as SharedRule) ?? null;
}

export async function createSharedRule(data: {
  categoryId: string;
  atelierPercentage: number;
  fonaviPercentage: number;
}) {
  if (Math.round((data.atelierPercentage + data.fonaviPercentage) * 100) / 100 !== 100) {
    return { success: false, error: "Los porcentajes deben sumar 100%" };
  }
  if (data.atelierPercentage < 0 || data.fonaviPercentage < 0) {
    return { success: false, error: "Los porcentajes no pueden ser negativos" };
  }

  // Si ya hay una activa para esa categoría, desactivarla (constraint UNIQUE WHERE active=true)
  await db.execute(sql`
    UPDATE shared_expense_rules SET active = false, updated_at = now()
    WHERE category_id = ${data.categoryId} AND active = true
  `);

  await db.execute(sql`
    INSERT INTO shared_expense_rules (category_id, atelier_percentage, fonavi_percentage, active)
    VALUES (${data.categoryId}, ${data.atelierPercentage}, ${data.fonaviPercentage}, true)
  `);

  revalidatePath("/configuracion");
  revalidatePath("/registro");
  return { success: true };
}

export async function deactivateSharedRule(id: string) {
  await db.execute(sql`
    UPDATE shared_expense_rules SET active = false, updated_at = now()
    WHERE id = ${id}
  `);
  revalidatePath("/configuracion");
  revalidatePath("/registro");
  return { success: true };
}

export async function reactivateSharedRule(id: string) {
  // Desactivar cualquier otra activa de la misma categoría primero
  const target = await db.execute(sql`SELECT category_id FROM shared_expense_rules WHERE id = ${id}`);
  const categoryId = (target.rows[0] as { category_id: string } | undefined)?.category_id;
  if (!categoryId) return { success: false, error: "Regla no encontrada" };

  await db.execute(sql`
    UPDATE shared_expense_rules SET active = false, updated_at = now()
    WHERE category_id = ${categoryId} AND active = true
  `);
  await db.execute(sql`
    UPDATE shared_expense_rules SET active = true, updated_at = now() WHERE id = ${id}
  `);
  revalidatePath("/configuracion");
  revalidatePath("/registro");
  return { success: true };
}
