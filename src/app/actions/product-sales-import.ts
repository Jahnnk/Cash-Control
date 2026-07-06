"use server";

/**
 * PIC · Import de ventas por producto (fuente: Byte, reporte "Productos
 * con mayor rotación"). Fase 0b del Business Knowledge Engine.
 *
 * Convenciones BKE (docs/PIC-ARQUITECTURA.md):
 * - Escritura atómica e IDEMPOTENTE: re-importar un mes reemplaza ese
 *   mes+fuente+negocio completo (DELETE+INSERT en una transacción,
 *   mismo patrón exento de snapshot que executeExcelImport).
 * - Procedencia total: source='byte', import_batch_id (fila real en
 *   import_batches), imported_at.
 * - Ninguna venta se pierde: sin match de catálogo → product_id NULL
 *   con product_name_raw, y se reporta en calidad de datos.
 * - Check de integridad natural: Σ archivo vs ventas Byte del mes que
 *   el sistema ya conoce (byte_sales_daily / daily_records).
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import { matchSalesToCatalog } from "@/lib/product-matching";
import type { ByteRotacionItem } from "@/lib/byte-rotacion-parser";

const sql = neon(process.env.DATABASE_URL!);

function currentMonthLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}

export type ProductSalesImportResult =
  | {
      ok: true;
      imported: number;
      matchedCount: number;
      unmatched: string[];
      totalRevenue: number;
      /** Ventas Byte del mes según el sistema (null si no hay registro). */
      systemMonthTotal: number | null;
      deltaVsSystem: number | null;
    }
  | { ok: false; error: string };

type ImportInput = {
  month: string;
  fileName: string | null;
  items: ByteRotacionItem[];
  declaredTotal: number | null;
  parseWarnings: string[];
};

/** Import completo desde la página Productos — solo dirección. */
export async function importProductSales(input: ImportInput): Promise<ProductSalesImportResult> {
  const bId = await activeBusinessId();
  if (!(await requireFullSession())) {
    return { ok: false, error: "El import de Productos es solo para la dirección." };
  }
  return runImport(bId, input, `PIC · ventas por producto (Byte rotación) · ${input.month}`);
}

/**
 * Import semanal desde el Panel de Sede (admin o dirección). Alimenta la
 * MISMA tabla canónica, con dos candados que protegen la historia:
 * - SOLO el mes en curso (el admin no puede pisar un mes cerrado).
 * - Solo el formato Rotación canónico (el modal filtra Rentabilidad).
 * Con esto el foco del día usa ventas frescas y el PIC se alimenta solo.
 */
export async function importProductSalesFromPanel(input: ImportInput): Promise<ProductSalesImportResult> {
  const bId = await activeBusinessId();
  const role = await getSessionRole();
  const allowed = role?.kind === "full" || (role?.kind === "admin" && role.sede === bId);
  if (!allowed) return { ok: false, error: "Sin acceso." };
  const current = currentMonthLima();
  if (input.month !== current) {
    return {
      ok: false,
      error: `Desde el panel solo se sube el mes en curso (${current}). Exporta el reporte con el rango del 1 del mes hasta hoy.`,
    };
  }
  return runImport(bId, input, `PIC · rotación semanal desde Panel de Sede · ${input.month}`);
}

async function runImport(bId: number, input: ImportInput, batchNote: string): Promise<ProductSalesImportResult> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) {
    return { ok: false, error: "Mes inválido (formato AAAA-MM)." };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "No hay productos para importar." };
  }
  for (const it of input.items) {
    if (!it.name?.trim() || !Number.isFinite(it.units) || !Number.isFinite(it.revenue) || it.units < 0 || it.revenue < 0) {
      return { ok: false, error: `Fila inválida en el archivo: "${it.name ?? "(sin nombre)"}".` };
    }
  }

  try {
    // 1) Matching contra el catálogo canónico + alias manuales del dueño.
    const catalog = (await sql`
      SELECT id::text, name FROM products WHERE business_id = ${bId}
    `) as { id: string; name: string }[];
    let aliasRows: { alias_normalized: string; product_id: string }[] = [];
    try {
      aliasRows = (await sql`
        SELECT alias_normalized, product_id::text FROM product_aliases WHERE business_id = ${bId}
      `) as typeof aliasRows;
    } catch {
      // migración de alias pendiente: se matchea solo por nombre
    }
    const match = matchSalesToCatalog(
      input.items,
      catalog,
      new Map(aliasRows.map((a) => [a.alias_normalized, a.product_id])),
    );

    // 2) Escritura atómica e idempotente + lote de procedencia.
    const batchId = crypto.randomUUID();
    const [y, m] = input.month.split("-").map(Number);
    const monthStart = `${input.month}-01`;
    const monthEnd = `${input.month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const totalRevenue = Math.round(input.items.reduce((s, it) => s + it.revenue, 0) * 100) / 100;
    const warnings = [
      ...input.parseWarnings,
      ...(match.ambiguous.length > 0
        ? [`Nombres ambiguos en catálogo (no se matchean): ${match.ambiguous.join(", ")}`]
        : []),
    ];

    const rows = [
      ...match.matched.map((it) => ({ ...it, productId: it.productId as string | null })),
      ...match.unmatched.map((it) => ({ ...it, productId: null as string | null })),
    ];
    await sql.transaction([
      sql`INSERT INTO import_batches (id, business_id, file_name, date_range_start, date_range_end,
            movements_count, status, rollback_available, notes, warnings_json)
          VALUES (${batchId}, ${bId}, ${input.fileName}, ${monthStart}, ${monthEnd},
            ${rows.length}, 'completed', false,
            ${batchNote},
            ${JSON.stringify(warnings)}::jsonb)`,
      sql`DELETE FROM product_month_sales
          WHERE business_id = ${bId} AND month = ${input.month} AND source = 'byte'`,
      ...rows.map(
        (it) => sql`
          INSERT INTO product_month_sales
            (business_id, product_id, product_name_raw, month, units, revenue, source, import_batch_id)
          VALUES (${bId}, ${it.productId}, ${it.name}, ${input.month},
                  ${it.units}, ${it.revenue}, 'byte', ${batchId})`,
      ),
    ]);

    // 3) Check de integridad natural contra las ventas Byte del sistema
    //    (tercera fuente: el registro diario del admin en upselling_daily,
    //    clave para el mes en curso subido desde el Panel de Sede).
    const sys = (await sql`
      SELECT COALESCE(
        NULLIF((SELECT SUM(total)::float FROM byte_sales_daily
                WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}), 0),
        NULLIF((SELECT SUM(byte_total)::float FROM daily_records
                WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd} AND archived = false), 0),
        NULLIF((SELECT SUM(revenue)::float FROM upselling_daily
                WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}), 0)
      ) AS total
    `) as { total: number | null }[];
    const systemMonthTotal = sys[0]?.total ?? null;

    revalidatePath("/[negocio]/productos", "page");
    revalidatePath("/[negocio]/panel", "page");
    return {
      ok: true,
      imported: rows.length,
      matchedCount: match.matched.length,
      unmatched: match.unmatched.map((u) => u.name),
      totalRevenue,
      systemMonthTotal,
      deltaVsSystem: systemMonthTotal !== null ? Math.round((totalRevenue - systemMonthTotal) * 100) / 100 : null,
    };
  } catch (err) {
    console.error("[importProductSales] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al importar las ventas" };
  }
}

/**
 * Elimina las ventas por producto de UN mes (sede activa). Pensado para
 * retirar meses incompletos (ej. marzo cargado desde un reporte parcial).
 * Reversible: re-subir el archivo del mes lo recupera. Los lotes en
 * import_batches quedan marcados 'rolled_back' (auditoría, no se borran).
 * NO toca saldos ni movimientos financieros — solo la tabla canónica PIC.
 */
export async function deleteProductSalesMonth(
  month: string,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { ok: false, error: "Mes inválido." };
  }
  try {
    const batches = (await sql`
      SELECT DISTINCT import_batch_id::text AS id FROM product_month_sales
      WHERE business_id = ${bId} AND month = ${month} AND source = 'byte' AND import_batch_id IS NOT NULL
    `) as { id: string }[];
    const deleted = (await sql`
      DELETE FROM product_month_sales
      WHERE business_id = ${bId} AND month = ${month} AND source = 'byte'
      RETURNING id
    `) as { id: string }[];
    if (batches.length > 0) {
      await sql`
        UPDATE import_batches SET status = 'rolled_back', rollback_available = false
        WHERE id = ANY(${batches.map((b) => b.id)}::uuid[]) AND business_id = ${bId}
      `;
    }
    revalidatePath("/[negocio]/productos", "page");
    return { ok: true, deleted: deleted.length };
  } catch (err) {
    console.error("[deleteProductSalesMonth] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al eliminar el mes" };
  }
}

export type ProductDataStatus = {
  catalog: { total: number; active: number; latestSnapshotMonth: string | null };
  months: {
    month: string;
    products: number;
    matched: number;
    totalRevenue: number;
    importedAt: string;
  }[];
};

/** Estado del cimiento de datos PIC para el negocio activo (solo lectura). */
export async function getProductDataStatus(): Promise<ProductDataStatus> {
  const bId = await activeBusinessId();
  const cat = (await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE active)::int AS active,
           (SELECT MAX(month) FROM product_cost_snapshots s
             JOIN products p ON p.id = s.product_id WHERE p.business_id = ${bId}) AS latest
    FROM products WHERE business_id = ${bId}
  `) as { total: number; active: number; latest: string | null }[];
  const months = (await sql`
    SELECT month,
           COUNT(*)::int AS products,
           COUNT(product_id)::int AS matched,
           SUM(revenue)::float AS total_revenue,
           MAX(imported_at)::text AS imported_at
    FROM product_month_sales
    WHERE business_id = ${bId}
    GROUP BY month ORDER BY month DESC
  `) as { month: string; products: number; matched: number; total_revenue: number; imported_at: string }[];
  return {
    catalog: {
      total: cat[0]?.total ?? 0,
      active: cat[0]?.active ?? 0,
      latestSnapshotMonth: cat[0]?.latest ?? null,
    },
    months: months.map((m) => ({
      month: m.month,
      products: m.products,
      matched: m.matched,
      totalRevenue: Math.round((m.total_revenue ?? 0) * 100) / 100,
      importedAt: m.imported_at,
    })),
  };
}
