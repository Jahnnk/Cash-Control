"use server";

/**
 * Server actions para importación masiva desde Excel.
 *
 * GUARDS CRÍTICOS DE AISLAMIENTO ENTRE NEGOCIOS:
 *   - El businessId SIEMPRE viene de activeBusinessId() (URL/cookie).
 *   - Jamás se acepta del cliente como parámetro mutable.
 *   - Toda mutación filtra por business_id = bId.
 *   - Cross-check post-import: saldos de los OTROS 2 negocios deben
 *     ser idénticos antes/después. Si difieren > S/0.01 → throw.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import {
  parseExcelFile,
  listSheets,
  type ParseResult,
} from "@/lib/excel-importer";
import { recalcBankBalance } from "./daily-records";

const VALID_BIDS = [1, 2, 3];

export type ImportPreview = {
  parseResult: ParseResult;
  manualesEnRango: { ingresos: number; egresos: number };
  categoriasNuevas: string[];
  saldosAntes: Record<number, { cash: number; bcp: number; code: string }>;
  fileName: string;
  sheetName: string;
};

export type ImportOptions = {
  aplicarSaldoInicial: boolean;
  archivarManualesExistentes: boolean;
  crearCategoriasNuevas: boolean;
};

export type ImportResult = {
  success: true;
  batchId: string;
  movementsCount: number;
  archivedCount: number;
  saldosDespues: Record<number, { cash: number; bcp: number; code: string }>;
} | {
  success: false;
  error: string;
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function getSaldosTodosNegocios(): Promise<
  Record<number, { cash: number; bcp: number; code: string }>
> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const out: Record<number, { cash: number; bcp: number; code: string }> = {};
  const businesses = await db.execute(sql`SELECT id, code, system_start_date::text AS s, initial_bcp_balance::float AS init_bcp, initial_cash_balance::float AS init_cash, initial_balance_date::text AS init_date FROM businesses ORDER BY id`);
  for (const r of businesses.rows as Array<{
    id: number; code: string; s: string | null;
    init_bcp: number; init_cash: number; init_date: string | null;
  }>) {
    const bId = r.id;
    // BCP
    const anchor = (await db.execute(sql`
      SELECT bank_balance_real::float AS b, date::text AS d FROM daily_records
      WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND date <= ${today} AND archived = false
      ORDER BY date DESC LIMIT 1
    `)).rows[0] as { b: number; d: string } | undefined;
    let bcp = 0;
    let anchorBalance = 0;
    let anchorDate: string | null = null;
    if (anchor) {
      anchorBalance = anchor.b;
      anchorDate = anchor.d;
    } else if (r.s && r.init_date) {
      anchorBalance = r.init_bcp;
      anchorDate = r.init_date;
    }
    if (anchorDate) {
      const inc = (await db.execute(sql`
        SELECT COALESCE(SUM(amount),0)::float AS t FROM bank_income_items
        WHERE business_id = ${bId} AND date > ${anchorDate} AND date <= ${today}
          AND is_special_loan=false AND payment_method <> 'efectivo' AND archived = false
      `)).rows[0] as { t: number };
      const exp = (await db.execute(sql`
        SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
        WHERE business_id = ${bId} AND date > ${anchorDate} AND date <= ${today}
          AND payment_method NOT IN ('efectivo','pendiente_atelier')
          AND is_special_loan = false AND archived = false
      `)).rows[0] as { t: number };
      bcp = Math.round((anchorBalance + inc.t - exp.t) * 100) / 100;
    }
    // Efectivo
    const inEf = (await db.execute(sql`
      SELECT COALESCE(SUM(amount),0)::float AS t FROM bank_income_items
      WHERE business_id = ${bId} AND payment_method='efectivo' AND archived = false
    `)).rows[0] as { t: number };
    const exEf = (await db.execute(sql`
      SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
      WHERE business_id = ${bId} AND payment_method='efectivo' AND archived = false
    `)).rows[0] as { t: number };
    const cash = Math.round((r.init_cash + inEf.t - exEf.t) * 100) / 100;
    out[bId] = { cash, bcp, code: r.code };
  }
  return out;
}

async function existingCategoryNames(): Promise<Set<string>> {
  const bId = await activeBusinessId();
  const r = await db.execute(sql`
    SELECT name FROM expense_categories WHERE business_id = ${bId}
  `);
  return new Set((r.rows as { name: string }[]).map((x) => x.name.toUpperCase()));
}

// ─────────────────────────────────────────────────────────────────
// Public actions
// ─────────────────────────────────────────────────────────────────

export async function listExcelSheets(
  fileBase64: string
): Promise<{ sheets: string[]; candidatesIngGtos: string[] }> {
  const buf = Buffer.from(fileBase64, "base64");
  const all = (await import("@/lib/excel-importer")).listAllSheets(buf);
  const candidates = listSheets(buf);
  return { sheets: all, candidatesIngGtos: candidates };
}

export async function previewExcelImport(
  fileBase64: string,
  fileName: string,
  sheetName?: string
): Promise<ImportPreview | { error: string }> {
  const bId = await activeBusinessId();
  if (!VALID_BIDS.includes(bId)) {
    return { error: "Negocio activo inválido" };
  }
  const buf = Buffer.from(fileBase64, "base64");
  const parseResult = parseExcelFile(buf, sheetName);

  if (parseResult.errores.length > 0) {
    return { error: parseResult.errores.join("; ") };
  }
  if (parseResult.movimientos.length === 0) {
    return { error: "El archivo no contiene movimientos válidos." };
  }

  const start = parseResult.rangoFechas.start;
  const end = parseResult.rangoFechas.end;
  if (!start || !end) {
    return { error: "No se pudo determinar el rango de fechas." };
  }

  // Manuales del rango (en este negocio, no archivados, no importados previamente)
  const manualesIn = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM bank_income_items
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
      AND archived = false AND imported_from_excel = false
  `)).rows[0] as { n: number };
  const manualesEx = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM expenses
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
      AND archived = false AND imported_from_excel = false
  `)).rows[0] as { n: number };

  // Categorías nuevas
  const existing = await existingCategoryNames();
  const categoriasNuevas = parseResult.categoriasUnicas.filter(
    (c) => !existing.has(c.toUpperCase())
  );

  const saldosAntes = await getSaldosTodosNegocios();

  return {
    parseResult,
    manualesEnRango: { ingresos: manualesIn.n, egresos: manualesEx.n },
    categoriasNuevas,
    saldosAntes,
    fileName,
    sheetName: sheetName ?? "(auto-detectado)",
  };
}

export async function executeExcelImport(
  fileBase64: string,
  fileName: string,
  sheetName: string,
  options: ImportOptions
): Promise<ImportResult> {
  const bId = await activeBusinessId();
  if (!VALID_BIDS.includes(bId)) {
    return { success: false, error: "Negocio activo inválido" };
  }

  const buf = Buffer.from(fileBase64, "base64");
  const parseResult = parseExcelFile(buf, sheetName);
  if (parseResult.errores.length > 0) {
    return { success: false, error: parseResult.errores.join("; ") };
  }
  if (parseResult.movimientos.length === 0) {
    return { success: false, error: "Sin movimientos para importar" };
  }
  const start = parseResult.rangoFechas.start;
  const end = parseResult.rangoFechas.end;
  if (!start || !end) return { success: false, error: "Rango de fechas inválido" };

  // CROSS-CONTAMINATION CHECK (1/2): saldos de los otros 2 negocios ANTES
  const saldosAntes = await getSaldosTodosNegocios();
  const otrosBids = VALID_BIDS.filter((x) => x !== bId);

  // 1. Crear batch
  const batchRes = await db.execute(sql`
    INSERT INTO import_batches (
      business_id, file_name, sheet_name, date_range_start, date_range_end,
      movements_count, ingresos_count, egresos_count
    ) VALUES (
      ${bId}, ${fileName}, ${sheetName}, ${start}, ${end},
      ${parseResult.movimientos.length}, ${parseResult.ingresos}, ${parseResult.egresos}
    )
    RETURNING id::text AS id
  `);
  const batchId = (batchRes.rows[0] as { id: string }).id;

  // 2. Archivar manuales existentes en el rango (SOLO este negocio,
  //    SOLO no-importados, SOLO no-archivados ya).
  let archivedCount = 0;
  if (options.archivarManualesExistentes) {
    const r1 = await db.execute(sql`
      UPDATE bank_income_items SET archived = true
      WHERE business_id = ${bId}
        AND date BETWEEN ${start} AND ${end}
        AND archived = false
        AND imported_from_excel = false
    `);
    const r2 = await db.execute(sql`
      UPDATE expenses SET archived = true
      WHERE business_id = ${bId}
        AND date BETWEEN ${start} AND ${end}
        AND archived = false
        AND imported_from_excel = false
    `);
    archivedCount = (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
  }

  // 3. Crear categorías nuevas (solo en este negocio)
  if (options.crearCategoriasNuevas) {
    const existing = await existingCategoryNames();
    for (const cat of parseResult.categoriasUnicas) {
      if (!existing.has(cat.toUpperCase())) {
        await db.execute(sql`
          INSERT INTO expense_categories (business_id, name, is_active)
          VALUES (${bId}, ${cat}, true)
          ON CONFLICT (business_id, name) DO NOTHING
        `);
      }
    }
  }

  // 4. INSERT masivo (siempre business_id = bId)
  for (const m of parseResult.movimientos) {
    if (m.type === "income") {
      await db.execute(sql`
        INSERT INTO bank_income_items (
          business_id, date, amount, payment_method, note,
          is_byte_sale, is_refund, imported_from_excel, import_batch_id
        ) VALUES (
          ${bId}, ${m.date}, ${m.amount.toFixed(2)}, ${m.paymentMethod}, ${m.note},
          ${m.isByteSale}, ${m.isRefund}, true, ${batchId}::uuid
        )
      `);
    } else {
      await db.execute(sql`
        INSERT INTO expenses (
          business_id, date, category, concept, amount, payment_method, notes,
          imported_from_excel, import_batch_id
        ) VALUES (
          ${bId}, ${m.date}, ${m.category}, ${m.note},
          ${m.amount.toFixed(2)}, ${m.paymentMethod}, NULL,
          true, ${batchId}::uuid
        )
      `);
    }
  }

  // 5. Aplicar saldo inicial si confirmó
  let initialCashApplied: number | null = null;
  let initialBcpApplied: number | null = null;
  if (options.aplicarSaldoInicial && parseResult.saldoInicial.fechaCierre) {
    const cierre = parseResult.saldoInicial.fechaCierre;
    const ef = parseResult.saldoInicial.efectivo ?? 0;
    const bcp = parseResult.saldoInicial.bcp ?? 0;
    const startDate = new Date(cierre + "T12:00:00");
    startDate.setDate(startDate.getDate() + 1);
    const systemStart = startDate.toISOString().slice(0, 10);

    await db.execute(sql`
      UPDATE businesses
      SET initial_cash_balance = ${ef.toFixed(2)},
          initial_bcp_balance = ${bcp.toFixed(2)},
          initial_balance_date = ${cierre},
          system_start_date = ${systemStart},
          updated_at = now()
      WHERE id = ${bId}
    `);
    initialCashApplied = ef;
    initialBcpApplied = bcp;
  }

  // 6. Recalcular saldo BCP en cadena
  await recalcBankBalance(start);

  // 7. Update batch con counts finales
  await db.execute(sql`
    UPDATE import_batches
    SET archived_count = ${archivedCount},
        initial_cash_applied = ${initialCashApplied !== null ? initialCashApplied.toFixed(2) : null},
        initial_bcp_applied = ${initialBcpApplied !== null ? initialBcpApplied.toFixed(2) : null}
    WHERE id = ${batchId}::uuid
  `);

  // 8. CROSS-CONTAMINATION CHECK (2/2): saldos de los OTROS 2 negocios después
  const saldosDespues = await getSaldosTodosNegocios();
  for (const oId of otrosBids) {
    const a = saldosAntes[oId];
    const b = saldosDespues[oId];
    if (Math.abs(a.cash - b.cash) > 0.01 || Math.abs(a.bcp - b.bcp) > 0.01) {
      // Marcar batch como cross-contaminated y throw para que no quede invisible.
      await db.execute(sql`
        UPDATE import_batches SET status='cross-contaminated', notes=${`Otros negocios cambiaron tras import: id ${oId} antes ef=${a.cash} bcp=${a.bcp} → después ef=${b.cash} bcp=${b.bcp}`}
        WHERE id = ${batchId}::uuid
      `);
      return {
        success: false,
        error: `CROSS-CONTAMINATION: saldos de ${b.code} cambiaron tras importar a ${saldosAntes[bId].code}. Batch ${batchId} marcado como cross-contaminated. Snapshot de Neon requerido para rollback.`,
      };
    }
  }

  revalidatePath("/", "layout");
  return {
    success: true,
    batchId,
    movementsCount: parseResult.movimientos.length,
    archivedCount,
    saldosDespues,
  };
}
