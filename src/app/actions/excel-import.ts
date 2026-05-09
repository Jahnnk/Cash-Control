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
import {
  parseControlVtas,
  listControlVtasSheets,
  type ControlVtasParseResult,
} from "@/lib/control-vtas-parser";
import { recalcBankBalance } from "./daily-records";

const VALID_BIDS = [1, 2, 3];

export type ImportPreview = {
  parseResult: ParseResult | null;
  controlVtasResult: ControlVtasParseResult | null;
  manualesEnRango: { ingresos: number; egresos: number };
  byteSalesDailyEnRango: number;
  tipsPendingEnRango: number;
  roundingAlertsEnRango: number;
  categoriasNuevas: string[];
  saldosAntes: Record<number, { cash: number; bcp: number; code: string }>;
  fileName: string;
  ingGtosSheet: string | null;
  controlVtasSheet: string | null;
  rangoUnificado: { start: string | null; end: string | null };
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
): Promise<{
  sheets: string[];
  candidatesIngGtos: string[];
  candidatesControlVtas: string[];
}> {
  const buf = Buffer.from(fileBase64, "base64");
  const all = (await import("@/lib/excel-importer")).listAllSheets(buf);
  const candidatesIngGtos = listSheets(buf);
  const candidatesControlVtas = listControlVtasSheets(buf);
  return { sheets: all, candidatesIngGtos, candidatesControlVtas };
}

export async function previewExcelImport(
  fileBase64: string,
  fileName: string,
  ingGtosSheet?: string | null,
  controlVtasSheet?: string | null
): Promise<ImportPreview | { error: string }> {
  const bId = await activeBusinessId();
  if (!VALID_BIDS.includes(bId)) {
    return { error: "Negocio activo inválido" };
  }
  const buf = Buffer.from(fileBase64, "base64");

  const parseResult = ingGtosSheet ? parseExcelFile(buf, ingGtosSheet) : null;
  const controlVtasResult = controlVtasSheet ? parseControlVtas(buf, controlVtasSheet) : null;

  if (parseResult && parseResult.errores.length > 0) {
    return { error: "Ing&Gtos: " + parseResult.errores.join("; ") };
  }
  if (controlVtasResult && controlVtasResult.errores.length > 0) {
    return { error: "Control de VTAS: " + controlVtasResult.errores.join("; ") };
  }
  if (!parseResult && !controlVtasResult) {
    return { error: "Debes seleccionar al menos una pestaña a importar." };
  }
  if (parseResult && parseResult.movimientos.length === 0 && !controlVtasResult) {
    return { error: "El archivo no contiene movimientos válidos." };
  }

  // Rango unificado (mín de starts, máx de ends)
  const starts = [parseResult?.rangoFechas.start, controlVtasResult?.rangoFechas.start].filter(Boolean) as string[];
  const ends = [parseResult?.rangoFechas.end, controlVtasResult?.rangoFechas.end].filter(Boolean) as string[];
  const start = starts.length ? starts.sort()[0] : null;
  const end = ends.length ? ends.sort().slice(-1)[0] : null;
  if (!start || !end) {
    return { error: "No se pudo determinar el rango de fechas." };
  }

  // Manuales del rango (Ing&Gtos)
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

  // Datos en tablas Control de VTAS para el rango
  const byteSalesDaily = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM byte_sales_daily
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
  `)).rows[0] as { n: number };
  const tipsPending = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM tips_pending
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
      AND imported_from_excel = true AND status = 'pending'
  `)).rows[0] as { n: number };
  const roundingAlerts = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM rounding_alerts
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
      AND imported_from_excel = true AND status = 'pending'
  `)).rows[0] as { n: number };

  const existing = await existingCategoryNames();
  const categoriasNuevas = parseResult
    ? parseResult.categoriasUnicas.filter((c) => !existing.has(c.toUpperCase()))
    : [];

  const saldosAntes = await getSaldosTodosNegocios();

  return {
    parseResult,
    controlVtasResult,
    manualesEnRango: { ingresos: manualesIn.n, egresos: manualesEx.n },
    byteSalesDailyEnRango: byteSalesDaily.n,
    tipsPendingEnRango: tipsPending.n,
    roundingAlertsEnRango: roundingAlerts.n,
    categoriasNuevas,
    saldosAntes,
    fileName,
    ingGtosSheet: ingGtosSheet ?? null,
    controlVtasSheet: controlVtasSheet ?? null,
    rangoUnificado: { start, end },
  };
}

export async function executeExcelImport(
  fileBase64: string,
  fileName: string,
  ingGtosSheet: string | null,
  controlVtasSheet: string | null,
  options: ImportOptions
): Promise<ImportResult & { byteSalesDays?: number; tipsCount?: number; alertsCount?: number }> {
  const bId = await activeBusinessId();
  if (!VALID_BIDS.includes(bId)) {
    return { success: false, error: "Negocio activo inválido" };
  }
  if (!ingGtosSheet && !controlVtasSheet) {
    return { success: false, error: "Debes seleccionar al menos una pestaña a importar" };
  }

  const buf = Buffer.from(fileBase64, "base64");
  const parseResult = ingGtosSheet ? parseExcelFile(buf, ingGtosSheet) : null;
  const controlVtasResult = controlVtasSheet ? parseControlVtas(buf, controlVtasSheet) : null;

  if (parseResult && parseResult.errores.length > 0) {
    return { success: false, error: "Ing&Gtos: " + parseResult.errores.join("; ") };
  }
  if (controlVtasResult && controlVtasResult.errores.length > 0) {
    return { success: false, error: "Control de VTAS: " + controlVtasResult.errores.join("; ") };
  }

  // Rango unificado
  const starts = [parseResult?.rangoFechas.start, controlVtasResult?.rangoFechas.start].filter(Boolean) as string[];
  const ends = [parseResult?.rangoFechas.end, controlVtasResult?.rangoFechas.end].filter(Boolean) as string[];
  const start = starts.length ? starts.sort()[0] : null;
  const end = ends.length ? ends.sort().slice(-1)[0] : null;
  if (!start || !end) return { success: false, error: "Rango de fechas inválido" };

  // CROSS-CONTAMINATION CHECK (1/2): saldos de los otros 2 negocios ANTES
  const saldosAntes = await getSaldosTodosNegocios();
  const otrosBids = VALID_BIDS.filter((x) => x !== bId);

  // 1. Crear batch
  const sheetLabel = [ingGtosSheet, controlVtasSheet].filter(Boolean).join(" + ");
  const batchRes = await db.execute(sql`
    INSERT INTO import_batches (
      business_id, file_name, sheet_name, date_range_start, date_range_end,
      movements_count, ingresos_count, egresos_count
    ) VALUES (
      ${bId}, ${fileName}, ${sheetLabel}, ${start}, ${end},
      ${parseResult?.movimientos.length ?? 0},
      ${parseResult?.ingresos ?? 0},
      ${parseResult?.egresos ?? 0}
    )
    RETURNING id::text AS id
  `);
  const batchId = (batchRes.rows[0] as { id: string }).id;

  let archivedCount = 0;
  let initialCashApplied: number | null = null;
  let initialBcpApplied: number | null = null;
  let byteSalesDays = 0;
  let tipsCount = 0;
  let alertsCount = 0;

  // ─── PROCESAR Ing&Gtos (si aplica) ───────────────────────────────
  if (parseResult) {
    // 2. Archivar manuales existentes en el rango (este negocio, no-importados)
    if (options.archivarManualesExistentes) {
      const r1 = await db.execute(sql`
        UPDATE bank_income_items SET archived = true
        WHERE business_id = ${bId}
          AND date BETWEEN ${start} AND ${end}
          AND archived = false AND imported_from_excel = false
      `);
      const r2 = await db.execute(sql`
        UPDATE expenses SET archived = true
        WHERE business_id = ${bId}
          AND date BETWEEN ${start} AND ${end}
          AND archived = false AND imported_from_excel = false
      `);
      archivedCount = (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
    }

    // 3. Crear categorías nuevas
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

    // 4. INSERT masivo
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

    // 5. Aplicar saldo inicial
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
  }

  // ─── PROCESAR Control de VTAS (si aplica) ───────────────────────
  if (controlVtasResult) {
    const cStart = controlVtasResult.rangoFechas.start ?? start;
    const cEnd = controlVtasResult.rangoFechas.end ?? end;

    // Idempotencia: chancar byte_sales_daily importados del rango
    await db.execute(sql`
      DELETE FROM byte_sales_daily
      WHERE business_id = ${bId}
        AND date BETWEEN ${cStart} AND ${cEnd}
        AND imported_from_excel = true
    `);
    // Idempotencia: chancar propinas pending importadas del rango
    await db.execute(sql`
      DELETE FROM tips_pending
      WHERE business_id = ${bId}
        AND date BETWEEN ${cStart} AND ${cEnd}
        AND imported_from_excel = true
        AND status = 'pending'
    `);
    // Idempotencia: chancar alertas pending importadas del rango
    await db.execute(sql`
      DELETE FROM rounding_alerts
      WHERE business_id = ${bId}
        AND date BETWEEN ${cStart} AND ${cEnd}
        AND imported_from_excel = true
        AND status = 'pending'
    `);

    // INSERT byte_sales_daily
    for (const v of controlVtasResult.ventasDiarias) {
      await db.execute(sql`
        INSERT INTO byte_sales_daily
          (business_id, date, efectivo, yape_plin, pos, imported_from_excel, import_batch_id)
        VALUES
          (${bId}, ${v.date}, ${v.efectivo.toFixed(2)}, ${v.yape_plin.toFixed(2)},
           ${v.pos.toFixed(2)}, true, ${batchId}::uuid)
        ON CONFLICT (business_id, date) DO UPDATE SET
          efectivo = EXCLUDED.efectivo,
          yape_plin = EXCLUDED.yape_plin,
          pos = EXCLUDED.pos,
          imported_from_excel = true,
          import_batch_id = EXCLUDED.import_batch_id,
          updated_at = now()
      `);
    }
    byteSalesDays = controlVtasResult.ventasDiarias.length;

    // INSERT propinas
    for (const p of controlVtasResult.propinas) {
      await db.execute(sql`
        INSERT INTO tips_pending
          (business_id, date, amount, source, source_concept, note_text,
           imported_from_excel, import_batch_id)
        VALUES
          (${bId}, ${p.date}, ${p.amount.toFixed(2)}, 'excel',
           ${p.source_concept}, ${p.note_text}, true, ${batchId}::uuid)
      `);
    }
    tipsCount = controlVtasResult.propinas.length;

    // INSERT alertas
    for (const a of controlVtasResult.alertasRedondeo) {
      await db.execute(sql`
        INSERT INTO rounding_alerts
          (business_id, date, payment_method, amount_quipupos, amount_cuentas,
           difference, note_text, imported_from_excel, import_batch_id)
        VALUES
          (${bId}, ${a.date}, ${a.payment_method},
           ${a.amount_quipupos.toFixed(2)}, ${a.amount_cuentas.toFixed(2)},
           ${a.difference.toFixed(2)}, ${a.note_text}, true, ${batchId}::uuid)
      `);
    }
    alertsCount = controlVtasResult.alertasRedondeo.length;
  }

  // ─── Recalcular saldo BCP en cadena ─────────────────────────────
  await recalcBankBalance(start);

  // ─── Update batch con counts finales ────────────────────────────
  await db.execute(sql`
    UPDATE import_batches
    SET archived_count = ${archivedCount},
        initial_cash_applied = ${initialCashApplied !== null ? initialCashApplied.toFixed(2) : null},
        initial_bcp_applied = ${initialBcpApplied !== null ? initialBcpApplied.toFixed(2) : null},
        notes = ${`byte_sales_days=${byteSalesDays}, tips=${tipsCount}, alerts=${alertsCount}`}
    WHERE id = ${batchId}::uuid
  `);

  // ─── CROSS-CONTAMINATION CHECK (2/2) ────────────────────────────
  const saldosDespues = await getSaldosTodosNegocios();
  for (const oId of otrosBids) {
    const a = saldosAntes[oId];
    const b = saldosDespues[oId];
    if (Math.abs(a.cash - b.cash) > 0.01 || Math.abs(a.bcp - b.bcp) > 0.01) {
      await db.execute(sql`
        UPDATE import_batches SET status='cross-contaminated', notes=${`Otros negocios cambiaron tras import: id ${oId} antes ef=${a.cash} bcp=${a.bcp} → después ef=${b.cash} bcp=${b.bcp}`}
        WHERE id = ${batchId}::uuid
      `);
      return {
        success: false,
        error: `CROSS-CONTAMINATION: saldos de ${b.code} cambiaron tras importar a ${saldosAntes[bId].code}. Batch ${batchId} marcado como cross-contaminated.`,
      };
    }
  }

  revalidatePath("/", "layout");
  return {
    success: true,
    batchId,
    movementsCount: parseResult?.movimientos.length ?? 0,
    archivedCount,
    saldosDespues,
    byteSalesDays,
    tipsCount,
    alertsCount,
  };
}
