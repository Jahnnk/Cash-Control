"use server";

/**
 * PIC · Alias de productos: vincular un nombre de venta (Byte) con su
 * producto del catálogo. Un clic, una vez — los imports siguientes
 * matchean solos y los meses YA cargados se re-vinculan retroactivamente.
 *
 * Reversible: desvincular borra el alias y devuelve las ventas afectadas
 * a product_id NULL (un vínculo equivocado envenenaría los márgenes).
 * Resiliente pre-migración: sin la tabla product_aliases, las lecturas
 * devuelven vacío y las escrituras explican qué falta.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { normalizeProductName } from "@/lib/product-matching";

const sql = neon(process.env.DATABASE_URL!);

export type UnmatchedProduct = {
  nameRaw: string;
  totalRevenue: number;
  totalUnits: number;
  months: number;
};

/** Nombres de venta sin producto vinculado (todas las cargas del negocio). */
export async function getUnmatchedSales(): Promise<{
  unmatched: UnmatchedProduct[];
  catalog: { id: string; name: string; category: string | null }[];
}> {
  const bId = await activeBusinessId();
  const unmatched = (await sql`
    SELECT product_name_raw AS name_raw,
           SUM(revenue)::float AS total_revenue,
           SUM(units)::float AS total_units,
           COUNT(DISTINCT month)::int AS months
    FROM product_month_sales
    WHERE business_id = ${bId} AND product_id IS NULL
    GROUP BY product_name_raw
    ORDER BY SUM(revenue) DESC
  `) as { name_raw: string; total_revenue: number; total_units: number; months: number }[];
  const catalog = (await sql`
    SELECT id::text, name, category FROM products
    WHERE business_id = ${bId} AND active = true
    ORDER BY name
  `) as { id: string; name: string; category: string | null }[];
  return {
    unmatched: unmatched.map((u) => ({
      nameRaw: u.name_raw,
      totalRevenue: Math.round(u.total_revenue * 100) / 100,
      totalUnits: u.total_units,
      months: u.months,
    })),
    catalog,
  };
}

/** Vincula un nombre crudo → producto y re-matchea lo ya cargado. */
export async function linkProductAlias(input: {
  nameRaw: string;
  productId: string;
}): Promise<{ ok: true; relinkedRows: number } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const norm = normalizeProductName(input.nameRaw);
  if (!norm) return { ok: false, error: "Nombre inválido." };
  try {
    // Validar que el producto es del negocio activo.
    const prod = (await sql`
      SELECT id::text FROM products WHERE id = ${input.productId} AND business_id = ${bId}
    `) as { id: string }[];
    if (prod.length === 0) return { ok: false, error: "Producto no encontrado en esta sede." };

    // Alias persistente (upsert: re-vincular corrige un vínculo previo).
    await sql`
      INSERT INTO product_aliases (business_id, alias_normalized, product_id)
      VALUES (${bId}, ${norm}, ${input.productId})
      ON CONFLICT (business_id, alias_normalized)
      DO UPDATE SET product_id = EXCLUDED.product_id, created_at = NOW()
    `;

    // Re-match retroactivo: filas sin vínculo cuyo nombre normaliza igual.
    const nullRows = (await sql`
      SELECT id::text, product_name_raw FROM product_month_sales
      WHERE business_id = ${bId} AND product_id IS NULL
    `) as { id: string; product_name_raw: string }[];
    const ids = nullRows.filter((r) => normalizeProductName(r.product_name_raw) === norm).map((r) => r.id);
    if (ids.length > 0) {
      await sql`
        UPDATE product_month_sales SET product_id = ${input.productId}
        WHERE id = ANY(${ids}::uuid[]) AND business_id = ${bId}
      `;
    }
    revalidatePath("/[negocio]/productos", "page");
    return { ok: true, relinkedRows: ids.length };
  } catch (err) {
    console.error("[linkProductAlias] failed:", err);
    const msg = err instanceof Error ? err.message : "";
    if (/product_aliases/.test(msg)) {
      return { ok: false, error: "Falta la migración de alias en la base de datos (tabla product_aliases)." };
    }
    return { ok: false, error: msg || "Error al vincular" };
  }
}

/** Deshace un vínculo: borra el alias y devuelve sus ventas a 'sin match'. */
export async function unlinkProductAlias(input: {
  nameRaw: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const norm = normalizeProductName(input.nameRaw);
  try {
    const alias = (await sql`
      SELECT product_id::text FROM product_aliases
      WHERE business_id = ${bId} AND alias_normalized = ${norm}
    `) as { product_id: string }[];
    if (alias.length === 0) return { ok: false, error: "Ese nombre no tiene vínculo manual." };

    // Solo des-vincula las filas de ESTE nombre crudo (no todo el producto).
    const rows = (await sql`
      SELECT id::text, product_name_raw FROM product_month_sales
      WHERE business_id = ${bId} AND product_id = ${alias[0].product_id}
    `) as { id: string; product_name_raw: string }[];
    const ids = rows.filter((r) => normalizeProductName(r.product_name_raw) === norm).map((r) => r.id);
    if (ids.length > 0) {
      await sql`
        UPDATE product_month_sales SET product_id = NULL
        WHERE id = ANY(${ids}::uuid[]) AND business_id = ${bId}
      `;
    }
    await sql`
      DELETE FROM product_aliases WHERE business_id = ${bId} AND alias_normalized = ${norm}
    `;
    revalidatePath("/[negocio]/productos", "page");
    return { ok: true };
  } catch (err) {
    console.error("[unlinkProductAlias] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al desvincular" };
  }
}

/** Alias del negocio activo (para el importador). Vacío si falta la tabla. */
export async function getAliasMap(): Promise<Record<string, string>> {
  const bId = await activeBusinessId();
  try {
    const rows = (await sql`
      SELECT alias_normalized, product_id::text FROM product_aliases WHERE business_id = ${bId}
    `) as { alias_normalized: string; product_id: string }[];
    return Object.fromEntries(rows.map((r) => [r.alias_normalized, r.product_id]));
  } catch {
    return {}; // migración pendiente: el import funciona sin alias
  }
}
