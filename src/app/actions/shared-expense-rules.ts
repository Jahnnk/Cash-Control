"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { SharedSplitMode } from "@/lib/shared-split";

export type SharedRule = {
  id: string;
  category_id: string;
  category_name: string;
  concept: string;
  atelier_percentage: number;
  fonavi_percentage: number;
  /** 0 = Centro no participa (reglas históricas). */
  centro_percentage: number;
  split_mode: SharedSplitMode;
  atelier_fixed: number | null;
  fonavi_fixed: number | null;
  /** null = Centro no participa en modo fijo. */
  centro_fixed: number | null;
  active: boolean;
};

const RULE_SELECT = sql`
  r.id::text as id,
  r.category_id::text as category_id,
  ec.name as category_name,
  r.concept,
  r.atelier_percentage::float as atelier_percentage,
  r.fonavi_percentage::float as fonavi_percentage,
  r.centro_percentage::float as centro_percentage,
  r.split_mode,
  r.atelier_fixed::float as atelier_fixed,
  r.fonavi_fixed::float as fonavi_fixed,
  r.centro_fixed::float as centro_fixed,
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
  // modo porcentaje (centro 0 = no participa)
  atelierPercentage: number;
  fonaviPercentage: number;
  centroPercentage: number;
  // modo monto fijo (null = ese local no participa)
  atelierFixed: number | null;
  fonaviFixed: number | null;
  centroFixed: number | null;
};

type DerivedColumns = {
  atelierPercentage: number;
  fonaviPercentage: number;
  centroPercentage: number;
  splitMode: SharedSplitMode;
  atelierFixed: number | null;
  fonaviFixed: number | null;
  centroFixed: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Valida según el modo y deriva los valores a persistir (o un error). */
function deriveRuleColumns(
  data: SharedRuleInput,
): { error: string } | { cols: DerivedColumns } {
  if (data.splitMode === "fixed") {
    const af = data.atelierFixed;
    const ff = data.fonaviFixed;
    const cf = data.centroFixed; // null = Centro no participa
    if (af == null || !Number.isFinite(af)) {
      return { error: "Ingresa el monto fijo de Atelier" };
    }
    if (ff == null && cf == null) {
      return { error: "Al menos una cafetería (Fonavi o Centro) debe participar del reparto" };
    }
    if (af < 0 || (ff != null && ff < 0) || (cf != null && cf < 0)) {
      return { error: "Los montos no pueden ser negativos" };
    }
    const total = af + (ff ?? 0) + (cf ?? 0);
    if (total <= 0) return { error: "El total de los montos debe ser mayor a 0" };
    // Porcentajes implícitos (columnas NOT NULL) para lecturas legacy
    const atelierPercentage = round2((af / total) * 100);
    const fonaviPercentage = round2(((ff ?? 0) / total) * 100);
    const centroPercentage = round2(100 - atelierPercentage - fonaviPercentage);
    return {
      cols: {
        atelierPercentage,
        fonaviPercentage,
        centroPercentage,
        splitMode: "fixed",
        atelierFixed: round2(af),
        fonaviFixed: ff != null ? round2(ff) : null,
        centroFixed: cf != null ? round2(cf) : null,
      },
    };
  }
  // percentage (default) — a + f + c = 100; centro 0 = no participa
  const a = data.atelierPercentage, f = data.fonaviPercentage, c = data.centroPercentage ?? 0;
  if (Math.round((a + f + c) * 100) / 100 !== 100) {
    return { error: "Los porcentajes (Atelier + Fonavi + Centro) deben sumar 100%" };
  }
  if (a < 0 || f < 0 || c < 0) {
    return { error: "Los porcentajes no pueden ser negativos" };
  }
  if (f === 0 && c === 0) {
    return { error: "Al menos una cafetería (Fonavi o Centro) debe participar del reparto" };
  }
  return {
    cols: {
      atelierPercentage: a,
      fonaviPercentage: f,
      centroPercentage: c,
      splitMode: "percentage",
      atelierFixed: null,
      fonaviFixed: null,
      centroFixed: null,
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
      (category_id, concept, atelier_percentage, fonavi_percentage, centro_percentage, split_mode, atelier_fixed, fonavi_fixed, centro_fixed, active)
    VALUES
      (${data.categoryId}, ${concept}, ${c.atelierPercentage}, ${c.fonaviPercentage}, ${c.centroPercentage}, ${c.splitMode}, ${c.atelierFixed}, ${c.fonaviFixed}, ${c.centroFixed}, true)
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
          centro_percentage = ${c.centroPercentage},
          split_mode = ${c.splitMode},
          atelier_fixed = ${c.atelierFixed},
          fonavi_fixed = ${c.fonaviFixed},
          centro_fixed = ${c.centroFixed},
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
