"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";

export async function getCategories(activeOnly = true) {
  const bId = await activeBusinessId();
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
  revalidatePath("/", "layout");
}

export async function updateCategory(id: string, data: { name?: string; isActive?: boolean; excludeFromEbitda?: boolean }) {
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
  revalidatePath("/", "layout");
}

export async function deleteCategory(id: string) {
  const bId = await activeBusinessId();
  await db.execute(sql`UPDATE expense_categories SET is_active = false WHERE id = ${id} AND business_id = ${bId}`);
  revalidatePath("/", "layout");
}
