"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getCategories(activeOnly = true) {
  const result = activeOnly
    ? await db.execute(sql`
        SELECT * FROM expense_categories WHERE is_active = true ORDER BY sort_order, name
      `)
    : await db.execute(sql`
        SELECT * FROM expense_categories ORDER BY sort_order, name
      `);
  return result.rows;
}

export async function createCategory(name: string) {
  const maxOrder = await db.execute(sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM expense_categories
  `);
  await db.execute(sql`
    INSERT INTO expense_categories (name, sort_order)
    VALUES (${name.trim()}, ${Number(maxOrder.rows[0].next)})
  `);
  revalidatePath("/registro");
  revalidatePath("/configuracion");
}

export async function updateCategory(id: string, data: { name?: string; isActive?: boolean }) {
  if (data.name !== undefined) {
    await db.execute(sql`UPDATE expense_categories SET name = ${data.name.trim()} WHERE id = ${id}`);
  }
  if (data.isActive !== undefined) {
    await db.execute(sql`UPDATE expense_categories SET is_active = ${data.isActive} WHERE id = ${id}`);
  }
  revalidatePath("/registro");
  revalidatePath("/configuracion");
}

export async function deleteCategory(id: string) {
  // Soft delete — just deactivate
  await db.execute(sql`UPDATE expense_categories SET is_active = false WHERE id = ${id}`);
  revalidatePath("/registro");
  revalidatePath("/configuracion");
}
