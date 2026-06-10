"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath, updateTag, unstable_cache } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { isValidCostGroup } from "@/lib/cost-group";

// Cache: las categorías cambian muy rara vez (ediciones manuales en
// /configuracion). TTL 10 min. Tag global "categories" se invalida en
// create/update/delete; afecta a los 3 negocios pero las tablas son
// pequeñas (<50 filas total) y el refetch es trivial.
const _operativasCached = unstable_cache(
  async (bId: number, activeOnly: boolean) => {
    const result = activeOnly
      ? await db.execute(sql`
          SELECT * FROM expense_categories
          WHERE business_id = ${bId} AND is_active = true AND is_special_loan = false
          ORDER BY sort_order, name
        `)
      : await db.execute(sql`
          SELECT * FROM expense_categories
          WHERE business_id = ${bId} AND is_special_loan = false
          ORDER BY sort_order, name
        `);
    return result.rows;
  },
  ["categories-operativas"],
  { revalidate: 600, tags: ["categories"] },
);

const _completasCached = unstable_cache(
  async (bId: number, activeOnly: boolean) => {
    const result = activeOnly
      ? await db.execute(sql`
          SELECT * FROM expense_categories
          WHERE business_id = ${bId} AND is_active = true
          ORDER BY sort_order, name
        `)
      : await db.execute(sql`
          SELECT * FROM expense_categories
          WHERE business_id = ${bId}
          ORDER BY sort_order, name
        `);
    return result.rows;
  },
  ["categories-completas"],
  { revalidate: 600, tags: ["categories"] },
);

/**
 * Categorías "operativas" — usadas en el selector de Registro Diario.
 * Excluye categorías marcadas como is_special_loan=true (Préstamos del
 * socio) para que no aparezcan como opción de gasto regular.
 *
 * Cacheada con tag "categories" (TTL 10 min). Las mutaciones llaman
 * updateTag("categories") — API Next.js 16 para read-your-own-writes.
 */
export async function getCategories(activeOnly = true) {
  const bId = await activeBusinessId();
  return _operativasCached(bId, activeOnly);
}

/**
 * Versión completa para configuración / auditoría — incluye categorías
 * especiales (Préstamos del socio). Mismo cache que getCategories.
 */
export async function getAllCategoriesIncludingSpecial(activeOnly = true) {
  const bId = await activeBusinessId();
  return _completasCached(bId, activeOnly);
}

export async function createCategory(name: string) {
  const bId = await activeBusinessId();
  const maxOrder = await db.execute(sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM expense_categories WHERE business_id = ${bId}
  `);
  await db.execute(sql`
    INSERT INTO expense_categories (business_id, name, sort_order)
    VALUES (${bId}, ${name.trim()}, ${Number(maxOrder.rows[0].next)})
  `);
  updateTag("categories");
  revalidatePath("/", "layout");
}

export async function updateCategory(id: string, data: { name?: string; isActive?: boolean; excludeFromEbitda?: boolean; costGroup?: "fijo" | "variable" | null }) {
  const bId = await activeBusinessId();
  if (data.name !== undefined) {
    await db.execute(sql`UPDATE expense_categories SET name = ${data.name.trim()} WHERE id = ${id} AND business_id = ${bId}`);
  }
  if (data.isActive !== undefined) {
    await db.execute(sql`UPDATE expense_categories SET is_active = ${data.isActive} WHERE id = ${id} AND business_id = ${bId}`);
  }
  if (data.excludeFromEbitda !== undefined) {
    await db.execute(sql`UPDATE expense_categories SET exclude_from_ebitda = ${data.excludeFromEbitda} WHERE id = ${id} AND business_id = ${bId}`);
  }
  if (data.costGroup !== undefined) {
    // Grupo de costo (análisis Fijo/Variable). null = volver a "sin clasificar".
    if (data.costGroup !== null && !isValidCostGroup(data.costGroup)) {
      throw new Error("Grupo de costo inválido: debe ser Fijo, Variable o Sin clasificar");
    }
    await db.execute(sql`UPDATE expense_categories SET cost_group = ${data.costGroup} WHERE id = ${id} AND business_id = ${bId}`);
  }
  updateTag("categories");
  revalidatePath("/", "layout");
}

export async function deleteCategory(id: string) {
  const bId = await activeBusinessId();
  await db.execute(sql`UPDATE expense_categories SET is_active = false WHERE id = ${id} AND business_id = ${bId}`);
  updateTag("categories");
  revalidatePath("/", "layout");
}
