"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  impliedPercentagesFromFixed,
  type SharedSplitMode,
} from "@/lib/shared-split";

export type SharedRule = {
  id: string;
  category_id: string;
  category_name: string;
  concept: string;
  atelier_percentage: number;
  fonavi_percentage: number;
  split_mode: SharedSplitMode;
  atelier_fixed: number | null;
  fonavi_fixed: number | null;
  active: boolean;
};

const RULE_SELECT = sql`
  r.id::text as id,
  r.category_id::text as category_id,
  ec.name as category_name,
  r.concept,
  r.atelier_percentage::float as atelier_percentage,
  r.fonavi_percentage::float as fonavi_percentage,
  r.split_mode,
  r.atelier_fixed::float as atelier_fixed,
  r.fonavi_fixed::float as fonavi_fixed,
  r.active
`;

export async function getSharedRules(): Promise<SharedRule[]> {
  const rows = await db.execute(sql`
    SELECT ${RULE_SELECT}
    FROM shared_expense_rules r
    JOIN expense_categories ec ON ec.id = r.category_id
    ORDER BY r.active DESC, ec.name ASC, r.concept ASC
  `);
  return rows.rows as unknown as SharedRule[];
}

// Devuelve TODAS las reglas activas para una categoría (puede haber varias por concepto distinto)
export async function getActiveRulesForCategory(categoryName: string): Promise<SharedRule[]> {
  const rows = await db.execute(sql`
    SELECT ${RULE_SELECT}
    FROM shared_expense_rules r
    JOIN expense_categories ec ON ec.id = r.category_id
    WHERE r.active = true AND ec.name = ${categoryName}
    ORDER BY r.concept ASC
  `);
  return rows.rows as unknown as SharedRule[];
}

export type SharedRuleInput = {
  categoryId: string;
  concept: string;
  splitMode: SharedSplitMode;
  // modo porcentaje
  atelierPercentage: number;
  fonaviPercentage: number;
  // modo monto fijo
  atelierFixed: number | null;
  fonaviFixed: number | null;
};

type DerivedColumns = {
  atelierPercentage: number;
  fonaviPercentage: number;
  splitMode: SharedSplitMode;
  atelierFixed: number | null;
  fonaviFixed: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Valida según el modo y deriva los valores a persistir (o un error). */
function deriveRuleColumns(
  data: SharedRuleInput,
): { error: string } | { cols: DerivedColumns } {
  if (data.splitMode === "fixed") {
    const af = data.atelierFixed;
    const ff = data.fonaviFixed;
    if (af == null || ff == null || !Number.isFinite(af) || !Number.isFinite(ff)) {
      return { error: "Ingresa los montos fijos de Atelier y Fonavi" };
    }
    if (af < 0 || ff < 0) return { error: "Los montos no pueden ser negativos" };
    if (af + ff <= 0) return { error: "El total de los montos debe ser mayor a 0" };
    // Guardamos también los porcentajes implícitos (columnas NOT NULL) para
    // compatibilidad con cualquier lectura legacy.
    const { atelierPercentage, fonaviPercentage } = impliedPercentagesFromFixed(af, ff);
    return {
      cols: {
        atelierPercentage,
        fonaviPercentage,
        splitMode: "fixed",
        atelierFixed: round2(af),
        fonaviFixed: round2(ff),
      },
    };
  }
  // percentage (default)
  if (Math.round((data.atelierPercentage + data.fonaviPercentage) * 100) / 100 !== 100) {
    return { error: "Los porcentajes deben sumar 100%" };
  }
  if (data.atelierPercentage < 0 || data.fonaviPercentage < 0) {
    return { error: "Los porcentajes no pueden ser negativos" };
  }
  return {
    cols: {
      atelierPercentage: data.atelierPercentage,
      fonaviPercentage: data.fonaviPercentage,
      splitMode: "percentage",
      atelierFixed: null,
      fonaviFixed: null,
    },
  };
}

export async function createSharedRule(data: SharedRuleInput) {
  const derived = deriveRuleColumns(data);
  if ("error" in derived) return { success: false, error: derived.error };
  const c = derived.cols;
  const concept = data.concept.trim();
  if (!concept) return { success: false, error: "El concepto no puede estar vacío" };

  // Si ya hay regla activa para esa (categoría, concepto), desactivarla
  await db.execute(sql`
    UPDATE shared_expense_rules SET active = false, updated_at = now()
    WHERE category_id = ${data.categoryId} AND concept = ${concept} AND active = true
  `);

  await db.execute(sql`
    INSERT INTO shared_expense_rules
      (category_id, concept, atelier_percentage, fonavi_percentage, split_mode, atelier_fixed, fonavi_fixed, active)
    VALUES
      (${data.categoryId}, ${concept}, ${c.atelierPercentage}, ${c.fonaviPercentage}, ${c.splitMode}, ${c.atelierFixed}, ${c.fonaviFixed}, true)
  `);

  revalidatePath("/", "layout");
  return { success: true };
}

// Cuenta cuántos egresos están vinculados a una regla (para advertir al editar)
export async function countExpensesForRule(ruleId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int as n FROM expenses WHERE shared_rule_id = ${ruleId}
  `);
  return (r.rows[0] as { n: number }).n;
}

export async function updateSharedRule(id: string, data: SharedRuleInput) {
  const derived = deriveRuleColumns(data);
  if ("error" in derived) return { success: false, error: derived.error };
  const c = derived.cols;
  const concept = data.concept.trim();
  if (!concept) return { success: false, error: "El concepto no puede estar vacío" };

  // Solo permitir editar reglas activas
  const existing = await db.execute(sql`SELECT active FROM shared_expense_rules WHERE id = ${id}`);
  const row = existing.rows[0] as { active: boolean } | undefined;
  if (!row) return { success: false, error: "Regla no encontrada" };
  if (!row.active) return { success: false, error: "Solo se pueden editar reglas activas" };

  // Validar unicidad de (category, concept) entre reglas activas distintas a esta
  const dup = await db.execute(sql`
    SELECT 1 FROM shared_expense_rules
    WHERE active = true AND category_id = ${data.categoryId} AND concept = ${concept} AND id <> ${id}
    LIMIT 1
  `);
  if (dup.rows.length > 0) {
    return { success: false, error: "Ya existe otra regla activa para esa categoría y concepto" };
  }

  try {
    await db.execute(sql`
      UPDATE shared_expense_rules
      SET category_id = ${data.categoryId},
          concept = ${concept},
          atelier_percentage = ${c.atelierPercentage},
          fonavi_percentage = ${c.fonaviPercentage},
          split_mode = ${c.splitMode},
          atelier_fixed = ${c.atelierFixed},
          fonavi_fixed = ${c.fonaviFixed},
          updated_at = now()
      WHERE id = ${id}
    `);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar" };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deactivateSharedRule(id: string) {
  await db.execute(sql`
    UPDATE shared_expense_rules SET active = false, updated_at = now() WHERE id = ${id}
  `);
  revalidatePath("/", "layout");
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
  revalidatePath("/", "layout");
  return { success: true };
}
