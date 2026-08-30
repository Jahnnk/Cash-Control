"use server";

/**
 * Server actions para importación masiva desde Excel.
 *
 * GUARDS CRÍTICOS DE AISLAMIENTO ENTRE NEGOCIOS:
 *   - El businessId viene de activeBusinessId() (URL/cookie); la ÚNICA
 *     excepción es el import CENTRAL desde Grupo (jul-2026): sede
 *     explícita elegida por la dirección (requireFullSession) — jamás
 *     adivinada de la cookie, que en /grupo apunta a la última sede
 *     visitada y habría importado en la sede equivocada.
 *   - Fuera de ese camino, jamás se acepta del cliente como parámetro.
 *   - Toda mutación filtra por business_id = bId.
 *   - Cross-check post-import: saldos de los OTROS 2 negocios deben
 *     ser idénticos antes/después. Si difieren > S/0.01 → throw.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { requireFullSession } from "@/lib/session-access";
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
import { sheetMonthKey, monthRange } from "@/lib/excel-month-pairing";
import {
  grupoDelCatalogo,
  grupoAColumnas,
  type GrupoCategoria,
} from "@/lib/catalogo-categorias";
import {
  revisarFechasDelMes, mensajeFechasFueraDelMes, type RevisionFechas,
} from "@/lib/filas-fuera-del-mes";
import {
  construirCuadre, motivoSoloSistema,
  type CuadreExcel, type MovimientoSoloSistema,
} from "@/lib/cuadre-excel";
import { recalcBankBalance } from "./daily-records";

// Cliente neon directo para sql.transaction([...]) atómico (mismo patrón que
// record-edits.ts). Se usa SOLO para el bloque de escritura por mes; el resto
// sigue con `db` (drizzle).
const txSql = neon(process.env.DATABASE_URL!);

/**
 * Rango de borrado de un mes: el MES CALENDARIO COMPLETO derivado del nombre
 * de la(s) pestaña(s), NO solo las fechas presentes en el archivo nuevo. Así
 * un reemplazo elimina también registros del archivo anterior cuyas fechas no
 * estén en el archivo nuevo (sin huérfanos). Si no se puede deducir el mes,
 * cae al rango real del archivo (comportamiento previo) como red de seguridad.
 */
function fullMonthDeleteRange(
  ingGtosSheet: string | null,
  controlVtasSheet: string | null,
  fileStart: string,
  fileEnd: string,
): { delStart: string; delEnd: string } {
  const ranges = [ingGtosSheet, controlVtasSheet]
    .filter(Boolean)
    .map((s) => sheetMonthKey(s as string))
    .filter(Boolean)
    .map((k) => monthRange(k as string))
    .filter(Boolean) as { start: string; end: string }[];
  if (ranges.length === 0) return { delStart: fileStart, delEnd: fileEnd };
  const delStart = ranges.map((r) => r.start).sort()[0];
  const delEnd = ranges.map((r) => r.end).sort().slice(-1)[0];
  return { delStart, delEnd };
}

/**
 * Suma los ingresos y egresos del Excel que pertenecen al mes de la
 * pestaña. Sin `mes` (nombre de hoja no reconocido) suma todo, que es el
 * comportamiento razonable cuando no hay con qué filtrar.
 */
function totalesDelMes(
  movimientos: { date: string; type: "income" | "expense"; amount: number }[],
  mes: string | null,
): { excelIngresos: number; excelEgresos: number } {
  let excelIngresos = 0;
  let excelEgresos = 0;
  for (const m of movimientos) {
    if (mes && m.date?.slice(0, 7) !== mes) continue;
    if (m.type === "income") excelIngresos += m.amount;
    else excelEgresos += m.amount;
  }
  return {
    excelIngresos: Math.round(excelIngresos * 100) / 100,
    excelEgresos: Math.round(excelEgresos * 100) / 100,
  };
}

const VALID_BIDS = [1, 2, 3];

// Desde jul-2026 Kelly también lleva las finanzas de Atelier (acuerdo de
// reunión), así que las 3 sedes aceptan su Excel. PROTECCIÓN CLAVE: los
// registros manuales ESPECIALES (clientes B2B, préstamos socio, gastos
// compartidos, clasificaciones no operativas, transferencias internas)
// NUNCA se archivan al importar — el Excel no sabe expresarlos y
// aplastarlos rompería CxC, capital inyectado y espejos compartidos.
// Ver las condiciones "PROTEGIDOS" en el archivado de manuales.
const IMPORT_ALLOWED_BIDS = [1, 2, 3];
const IMPORT_NOT_ALLOWED_MSG =
  "La importación desde Excel no está disponible para esta sede.";

export type ImportPreview = {
  parseResult: ParseResult | null;
  controlVtasResult: ControlVtasParseResult | null;
  manualesEnRango: { ingresos: number; egresos: number };
  /** Registros manuales ESPECIALES del rango (clientes B2B, préstamos
   * socio, compartidos, clasificaciones): protegidos — no se archivan. */
  protegidosEnRango?: { ingresos: number; egresos: number };
  byteSalesDailyEnRango: number;
  tipsPendingEnRango: number;
  roundingAlertsEnRango: number;
  categoriasNuevas: string[];
  /**
   * Las categorías que el sistema NO supo clasificar solo y que hoy
   * quedarían sueltas (nuevas, o ya existentes pero sin grupo). Es
   * la lista que la pantalla de importación le pone a dirección
   * para decidir de una vez, antes de que el gasto entre.
   */
  categoriasPorClasificar: {
    nombre: string;
    motivo: string;
    /** Sugerencia por defecto — se aplica si nadie la cambia. */
    sugerencia: GrupoCategoria;
    /** Cuánta plata trae en este archivo, para dimensionar. */
    monto: number;
  }[];
  saldosAntes: Record<number, { cash: number; bcp: number; code: string }>;
  fileName: string;
  ingGtosSheet: string | null;
  controlVtasSheet: string | null;
  rangoUnificado: { start: string | null; end: string | null };
  /**
   * Filas con fecha de OTRO mes dentro de la pestaña. null = todo en
   * orden. Si viene, la importación se bloquea: esas filas descuadran
   * el total del Excel y se duplican en cada re-importación (ver
   * lib/filas-fuera-del-mes.ts).
   */
  fechasFueraDelMes: RevisionFechas | null;
  /**
   * Comparación contra el Excel: qué va a mostrar el sistema después de
   * importar y por qué puede no ser idéntico al archivo. null si no se
   * pudo calcular (sin pestaña de Ing&Gtos).
   */
  cuadre: CuadreExcel | null;
};

export type ImportOptions = {
  aplicarSaldoInicial: boolean;
  archivarManualesExistentes: boolean;
  crearCategoriasNuevas: boolean;
  /**
   * Qué grupo darle a las categorías que el resolvedor no supo clasificar.
   * Lo llena dirección en la pantalla de importación, una vez por
   * categoría nueva; de ahí en adelante ya queda guardada.
   *
   * Clave = nombre de la categoría, valor = 'fijo' | 'variable' |
   * 'financiamiento' | 'fuera'. Lo que no venga acá se crea sin grupo,
   * como antes.
   */
  clasificacionesNuevas?: Record<string, GrupoCategoria>;
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
          AND (is_special_loan = false OR loan_via_bank = true) AND payment_method <> 'efectivo' AND archived = false
      `)).rows[0] as { t: number };
      const exp = (await db.execute(sql`
        SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
        WHERE business_id = ${bId} AND date > ${anchorDate} AND date <= ${today}
          AND payment_method NOT IN ('efectivo','pendiente_atelier','socio')
          AND (is_special_loan = false OR loan_via_bank = true) AND archived = false
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

async function existingCategoryNames(bId: number): Promise<Set<string>> {
  const r = await db.execute(sql`
    SELECT name FROM expense_categories WHERE business_id = ${bId}
  `);
  return new Set((r.rows as { name: string }[]).map((x) => x.name.toUpperCase()));
}

/** Las que ya existen Y ya tienen grupo: esas no hay que preguntarlas. */
async function categoriasYaClasificadas(bId: number): Promise<Set<string>> {
  const r = await db.execute(sql`
    SELECT name FROM expense_categories
    WHERE business_id = ${bId}
      AND (cost_group IS NOT NULL OR exclude_from_ebitda = true)
  `);
  return new Set((r.rows as { name: string }[]).map((x) => x.name.toUpperCase()));
}

/**
 * Sede del import. null = acceso denegado (el caller lo convierte a su
 * forma de error). Camino central (sedeCentral): solo dirección; desde
 * jul-2026 Kelly lleva las 3 sedes, así que las 3 se aceptan.
 */
async function importBusinessId(sedeCentral?: string): Promise<number | null> {
  if (sedeCentral !== undefined) {
    if (sedeCentral !== "atelier" && sedeCentral !== "fonavi" && sedeCentral !== "centro") return null;
    if (!(await requireFullSession())) return null;
    return activeBusinessId(sedeCentral);
  }
  return activeBusinessId();
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
  controlVtasSheet?: string | null,
  sedeCentral?: string
): Promise<ImportPreview | { error: string }> {
  const bId = await importBusinessId(sedeCentral);
  if (bId === null) return { error: "El import central es solo para la dirección." };
  if (!VALID_BIDS.includes(bId)) {
    return { error: "Negocio activo inválido" };
  }
  if (!IMPORT_ALLOWED_BIDS.includes(bId)) {
    return { error: IMPORT_NOT_ALLOWED_MSG };
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
  // Especiales del rango: mismas condiciones que la protección del archivado.
  const protegidosIn = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM bank_income_items
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
      AND archived = false AND imported_from_excel = false
      AND (client_id IS NOT NULL OR is_special_loan = true OR non_operative_category IS NOT NULL OR is_internal_transfer = true OR is_fonavi_reimbursement = true)
  `)).rows[0] as { n: number };
  const protegidosEx = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM expenses
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
      AND archived = false AND imported_from_excel = false
      AND (is_shared = true OR is_special_loan = true OR is_internal_transfer = true OR payment_method IN ('socio', 'pendiente_atelier'))
  `)).rows[0] as { n: number };

  // ── Lo que el sistema tiene y el Excel no trae ────────────────────
  // Se piden los movimientos ENTEROS (no un conteo) porque el cuadre
  // tiene que poder decir CUÁL es la diferencia, no solo cuánta.
  const soloSistemaIn = (await db.execute(sql`
    SELECT date::text AS fecha, COALESCE(note, '') AS detalle, amount::float AS monto,
           client_id, is_special_loan, is_internal_transfer,
           non_operative_category, is_fonavi_reimbursement, payment_method
    FROM bank_income_items
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
      AND archived = false AND imported_from_excel = false
  `)).rows as Record<string, unknown>[];
  const soloSistemaEx = (await db.execute(sql`
    SELECT date::text AS fecha,
           (category || COALESCE(' · ' || concept, '')) AS detalle,
           -- La parte PROPIA de la sede: un compartido de S/2,700 suma
           -- S/1,800 a Atelier, que es lo que se compara con el Excel.
           (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS monto,
           is_shared, is_special_loan, is_internal_transfer, payment_method
    FROM expenses
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
      AND archived = false AND imported_from_excel = false
      AND payment_method <> 'pendiente_atelier'
  `)).rows as Record<string, unknown>[];

  const movimientosSoloSistema: MovimientoSoloSistema[] = [
    ...soloSistemaIn.map((r) => ({
      tipo: "ingreso" as const,
      fecha: String(r.fecha),
      detalle: String(r.detalle || "(sin detalle)"),
      monto: Number(r.monto) || 0,
      motivo: motivoSoloSistema({
        clientId: r.client_id as string | null,
        isSpecialLoan: r.is_special_loan as boolean,
        isInternalTransfer: r.is_internal_transfer as boolean,
        nonOperativeCategory: r.non_operative_category as string | null,
        isFonaviReimbursement: r.is_fonavi_reimbursement as boolean,
        paymentMethod: r.payment_method as string | null,
      }),
    })),
    ...soloSistemaEx.map((r) => ({
      tipo: "egreso" as const,
      fecha: String(r.fecha),
      detalle: String(r.detalle || "(sin detalle)"),
      monto: Number(r.monto) || 0,
      motivo: motivoSoloSistema({
        isShared: r.is_shared as boolean,
        isSpecialLoan: r.is_special_loan as boolean,
        isInternalTransfer: r.is_internal_transfer as boolean,
        paymentMethod: r.payment_method as string | null,
      }),
    })),
  ];

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

  const existing = await existingCategoryNames(bId);
  const categoriasNuevas = parseResult
    ? parseResult.categoriasUnicas.filter((c) => !existing.has(c.toUpperCase()))
    : [];

  // Las que van a quedar sueltas si nadie decide: el resolvedor no las
  // reconoció Y la sede tampoco las tiene clasificadas de antes.
  // SUGERENCIA por defecto: 'fijo'. De los dos errores posibles es el
  // barato — un costo fijo tratado como variable hunde el margen y baja
  // el punto de equilibrio, o sea dice que el negocio se sostiene
  // vendiendo menos de lo que necesita. Al revés solo exige de más.
  const yaClasificadas = await categoriasYaClasificadas(bId);
  const montoPorCategoria = new Map<string, number>();
  for (const m of parseResult?.movimientos ?? []) {
    if (m.type !== "expense") continue;
    montoPorCategoria.set(m.category, (montoPorCategoria.get(m.category) ?? 0) + m.amount);
  }
  const categoriasPorClasificar = (parseResult?.resolucionCategorias ?? [])
    .filter((r) => r.confianza === "desconocida")
    .filter((r) => !yaClasificadas.has(r.canonica.toUpperCase()))
    .map((r) => ({
      nombre: r.canonica,
      motivo: r.motivo,
      sugerencia: "fijo" as GrupoCategoria,
      monto: Math.round((montoPorCategoria.get(r.canonica) ?? 0) * 100) / 100,
    }))
    .sort((a, b) => b.monto - a.monto);

  const saldosAntes = await getSaldosTodosNegocios();

  return {
    parseResult,
    controlVtasResult,
    manualesEnRango: { ingresos: manualesIn.n, egresos: manualesEx.n },
    protegidosEnRango: { ingresos: protegidosIn.n, egresos: protegidosEx.n },
    byteSalesDailyEnRango: byteSalesDaily.n,
    tipsPendingEnRango: tipsPending.n,
    roundingAlertsEnRango: roundingAlerts.n,
    categoriasNuevas,
    categoriasPorClasificar,
    saldosAntes,
    fileName,
    ingGtosSheet: ingGtosSheet ?? null,
    controlVtasSheet: controlVtasSheet ?? null,
    rangoUnificado: { start, end },
    // Se calcula acá para que la pantalla lo muestre ANTES de que Jahnn
    // le dé a importar, no como un error después del clic.
    fechasFueraDelMes: revisarFechasDelMes(
      parseResult?.movimientos ?? [],
      ingGtosSheet ? sheetMonthKey(ingGtosSheet) : null,
    ),
    cuadre: parseResult
      ? construirCuadre({
          // Se suman los movimientos del MES DE LA PESTAÑA, no los
          // totales crudos del parser: si el archivo trae filas con
          // fecha de otro mes, incluirlas daría un total del Excel que
          // no corresponde al mes y el cuadre compararía peras con
          // manzanas. (En Atelier, agosto salía S/47,697.34 en vez de
          // S/47,642.34 por tres filas del 12 de julio.)
          ...totalesDelMes(
            parseResult.movimientos,
            ingGtosSheet ? sheetMonthKey(ingGtosSheet) : null,
          ),
          movimientos: movimientosSoloSistema,
        })
      : null,
  };
}

export async function executeExcelImport(
  fileBase64: string,
  fileName: string,
  ingGtosSheet: string | null,
  controlVtasSheet: string | null,
  options: ImportOptions,
  sedeCentral?: string
): Promise<ImportResult & { byteSalesDays?: number; tipsCount?: number; alertsCount?: number }> {
  const bId = await importBusinessId(sedeCentral);
  if (bId === null) return { success: false, error: "El import central es solo para la dirección." };
  if (!VALID_BIDS.includes(bId)) {
    return { success: false, error: "Negocio activo inválido" };
  }
  if (!IMPORT_ALLOWED_BIDS.includes(bId)) {
    return { success: false, error: IMPORT_NOT_ALLOWED_MSG };
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

  // Bloqueo si hay filas con fecha de otro mes. Va ANTES de tocar nada:
  // esas filas caen fuera del rango de limpieza y se acumulan una copia
  // por importación — así se juntaron S/4,613 de harina repetida en
  // julio de Atelier. Decisión de Jahnn (26-ago-2026): avisar y parar,
  // no autocorregir, porque el error hay que arreglarlo en el Excel.
  const fueraDelMes = revisarFechasDelMes(
    parseResult?.movimientos ?? [],
    ingGtosSheet ? sheetMonthKey(ingGtosSheet) : null,
  );
  if (fueraDelMes) {
    return { success: false, error: mensajeFechasFueraDelMes(fueraDelMes) };
  }

  // Bloqueo si el parser detectó filas que no puede autocorregir
  // (Casos A/B mixtos según Prompt 18). El usuario debe arreglar el
  // Excel antes de re-intentar.
  const blockingWarnings = parseResult?.parseWarnings.filter(
    (w) => w.severity === "blocking_error",
  ) ?? [];
  if (blockingWarnings.length > 0) {
    const filas = blockingWarnings.map((w) => `R${w.rowNumber}`).join(", ");
    return {
      success: false,
      error:
        `${blockingWarnings.length} fila(s) del Excel tienen tipo y montos contradictorios y el parser no puede autocorregirlas: ${filas}. ` +
        "Pídele a Kelly que arregle estas filas antes de importar.",
    };
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
  // Persistencia de warnings estructurados (Prompt 18). null si no hay
  // ninguno para no llenar la tabla con []s vacíos.
  const warningsJson =
    parseResult?.parseWarnings.length
      ? JSON.stringify(parseResult.parseWarnings)
      : null;
  const batchRes = await db.execute(sql`
    INSERT INTO import_batches (
      business_id, file_name, sheet_name, date_range_start, date_range_end,
      movements_count, ingresos_count, egresos_count, warnings_json
    ) VALUES (
      ${bId}, ${fileName}, ${sheetLabel}, ${start}, ${end},
      ${parseResult?.movimientos.length ?? 0},
      ${parseResult?.ingresos ?? 0},
      ${parseResult?.egresos ?? 0},
      ${warningsJson}::jsonb
    )
    RETURNING id::text AS id
  `);
  const batchId = (batchRes.rows[0] as { id: string }).id;

  // Rango de borrado = MES CALENDARIO COMPLETO (no solo las fechas del
  // archivo nuevo), para que un reemplazo no deje huérfanos del archivo
  // anterior cuyas fechas no vengan en el nuevo.
  const { delStart, delEnd } = fullMonthDeleteRange(ingGtosSheet, controlVtasSheet, start, end);

  let archivedCount = 0;
  let initialCashApplied: number | null = null;
  let initialBcpApplied: number | null = null;
  let byteSalesDays = 0;
  let tipsCount = 0;
  let alertsCount = 0;

  // Conteo de manuales a archivar (lectura previa, solo para el reporte).
  if (parseResult && options.archivarManualesExistentes) {
    const c = (await db.execute(sql`
      SELECT (
        (SELECT COUNT(*) FROM bank_income_items WHERE business_id = ${bId} AND date BETWEEN ${delStart} AND ${delEnd} AND archived = false AND imported_from_excel = false)
        + (SELECT COUNT(*) FROM expenses WHERE business_id = ${bId} AND date BETWEEN ${delStart} AND ${delEnd} AND archived = false AND imported_from_excel = false)
      )::int AS n
    `)).rows[0] as { n: number };
    archivedCount = Number(c.n);
  }

  // ─── ESCRITURA ATÓMICA DEL MES ───────────────────────────────────
  // Todo el reemplazo del mes — archivar manuales + DELETE de importados del
  // MES COMPLETO + INSERT del archivo nuevo (Ing&Gtos y Control de VTAS) — va
  // en UNA sola transacción neon. Si algo falla, el mes no queda a medias
  // (ni duplicado ni vacío).
  const q: ReturnType<typeof txSql>[] = [];

  if (parseResult) {
    if (options.archivarManualesExistentes) {
      q.push(txSql`UPDATE bank_income_items SET archived = true WHERE business_id = ${bId} AND date BETWEEN ${delStart} AND ${delEnd} AND archived = false AND imported_from_excel = false
        AND client_id IS NULL AND is_special_loan = false AND non_operative_category IS NULL AND is_internal_transfer = false AND is_fonavi_reimbursement = false`); // PROTEGIDOS: el Excel no sabe expresarlos
      q.push(txSql`UPDATE expenses SET archived = true WHERE business_id = ${bId} AND date BETWEEN ${delStart} AND ${delEnd} AND archived = false AND imported_from_excel = false
        AND is_shared = false AND is_special_loan = false AND is_internal_transfer = false AND payment_method NOT IN ('socio', 'pendiente_atelier')`); // PROTEGIDOS: espejos y préstamos
    }
    // IDEMPOTENCIA: borrar importados previos del MES COMPLETO.
    q.push(txSql`DELETE FROM bank_income_items WHERE business_id = ${bId} AND date BETWEEN ${delStart} AND ${delEnd} AND imported_from_excel = true`);
    q.push(txSql`DELETE FROM expenses WHERE business_id = ${bId} AND date BETWEEN ${delStart} AND ${delEnd} AND imported_from_excel = true`);
    // Categorías nuevas (ON CONFLICT DO NOTHING = idempotente).
    //
    // Nacen YA clasificadas. Antes se creaban vacías y el gasto quedaba
    // fuera del punto de equilibrio sin que nadie lo notara: así se
    // perdían S/34,549 en Atelier y S/11,568 en Fonavi (ago-2026). El
    // grupo sale del catálogo, y si el resolvedor no la reconoció, de lo
    // que dirección eligió en la pantalla de importación.
    if (options.crearCategoriasNuevas) {
      for (const cat of parseResult.categoriasUnicas) {
        const grupo = grupoDelCatalogo(cat) ?? options.clasificacionesNuevas?.[cat] ?? null;
        const cols = grupo ? grupoAColumnas(grupo) : null;
        q.push(txSql`INSERT INTO expense_categories (business_id, name, is_active, cost_group, exclude_from_ebitda)
          VALUES (${bId}, ${cat}, true, ${cols?.costGroup ?? null}, ${cols?.excludeFromEbitda ?? false})
          ON CONFLICT (business_id, name) DO NOTHING`);
        // Y si la categoría YA existía pero seguía suelta, se le rellena
        // el grupo. Rellenar un hueco nunca pisa una decisión: solo toca
        // las filas que no tienen ninguna.
        if (cols) {
          q.push(txSql`UPDATE expense_categories
            SET cost_group = ${cols.costGroup}, exclude_from_ebitda = ${cols.excludeFromEbitda}
            WHERE business_id = ${bId} AND name = ${cat}
              AND cost_group IS NULL AND exclude_from_ebitda = false`);
        }
      }
    }
    for (const m of parseResult.movimientos) {
      if (m.type === "income") {
        q.push(txSql`INSERT INTO bank_income_items (business_id, date, amount, payment_method, note, is_byte_sale, is_refund, imported_from_excel, import_batch_id) VALUES (${bId}, ${m.date}, ${m.amount.toFixed(2)}, ${m.paymentMethod}, ${m.note}, ${m.isByteSale}, ${m.isRefund}, true, ${batchId}::uuid)`);
      } else {
        q.push(txSql`INSERT INTO expenses (business_id, date, category, concept, amount, payment_method, notes, imported_from_excel, import_batch_id) VALUES (${bId}, ${m.date}, ${m.category}, ${m.note}, ${m.amount.toFixed(2)}, ${m.paymentMethod}, NULL, true, ${batchId}::uuid)`);
      }
    }
    if (options.aplicarSaldoInicial && parseResult.saldoInicial.fechaCierre) {
      const cierre = parseResult.saldoInicial.fechaCierre;
      const ef = parseResult.saldoInicial.efectivo ?? 0;
      const bcp = parseResult.saldoInicial.bcp ?? 0;
      const sd = new Date(cierre + "T12:00:00");
      sd.setDate(sd.getDate() + 1);
      const systemStart = sd.toISOString().slice(0, 10);
      q.push(txSql`UPDATE businesses SET initial_cash_balance = ${ef.toFixed(2)}, initial_bcp_balance = ${bcp.toFixed(2)}, initial_balance_date = ${cierre}, system_start_date = ${systemStart}, updated_at = now() WHERE id = ${bId}`);
      initialCashApplied = ef;
      initialBcpApplied = bcp;
    }
  }

  if (controlVtasResult) {
    q.push(txSql`DELETE FROM byte_sales_daily WHERE business_id = ${bId} AND date BETWEEN ${delStart} AND ${delEnd} AND imported_from_excel = true`);
    q.push(txSql`DELETE FROM tips_pending WHERE business_id = ${bId} AND date BETWEEN ${delStart} AND ${delEnd} AND imported_from_excel = true AND status = 'pending'`);
    q.push(txSql`DELETE FROM rounding_alerts WHERE business_id = ${bId} AND date BETWEEN ${delStart} AND ${delEnd} AND imported_from_excel = true AND status = 'pending'`);
    for (const v of controlVtasResult.ventasDiarias) {
      q.push(txSql`INSERT INTO byte_sales_daily (business_id, date, efectivo, yape_plin, pos, total_pos_excel, imported_from_excel, import_batch_id) VALUES (${bId}, ${v.date}, ${v.efectivo.toFixed(2)}, ${v.yape_plin.toFixed(2)}, ${v.pos.toFixed(2)}, ${v.total_pos_excel.toFixed(2)}, true, ${batchId}::uuid) ON CONFLICT (business_id, date) DO UPDATE SET efectivo = EXCLUDED.efectivo, yape_plin = EXCLUDED.yape_plin, pos = EXCLUDED.pos, total_pos_excel = EXCLUDED.total_pos_excel, imported_from_excel = true, import_batch_id = EXCLUDED.import_batch_id, updated_at = now()`);
    }
    byteSalesDays = controlVtasResult.ventasDiarias.length;
    for (const p of controlVtasResult.propinas) {
      q.push(txSql`INSERT INTO tips_pending (business_id, date, amount, source, source_concept, note_text, imported_from_excel, import_batch_id) VALUES (${bId}, ${p.date}, ${p.amount.toFixed(2)}, 'excel', ${p.source_concept}, ${p.note_text}, true, ${batchId}::uuid)`);
    }
    tipsCount = controlVtasResult.propinas.length;
    for (const a of controlVtasResult.alertasRedondeo) {
      q.push(txSql`INSERT INTO rounding_alerts (business_id, date, payment_method, amount_quipupos, amount_cuentas, difference, note_text, imported_from_excel, import_batch_id) VALUES (${bId}, ${a.date}, ${a.payment_method}, ${a.amount_quipupos.toFixed(2)}, ${a.amount_cuentas.toFixed(2)}, ${a.difference.toFixed(2)}, ${a.note_text}, true, ${batchId}::uuid)`);
    }
    alertsCount = controlVtasResult.alertasRedondeo.length;
  }

  // Commit atómico del mes completo.
  if (q.length > 0) {
    await txSql.transaction(q);
  }

  // ─── Recalcular saldo BCP en cadena ─────────────────────────────
  // bId EXPLÍCITO: desde /grupo la cookie dice "grupo" y resolverla aquí
  // lanzaba — con los datos YA escritos (la transacción había cerrado).
  // El recálculo además no debe tumbar un import exitoso: si falla, se
  // loggea y los saldos se refrescan en el siguiente registro del día.
  try {
    await recalcBankBalance(start, bId);
  } catch (err) {
    console.error("[executeExcelImport] recalcBankBalance falló (import OK):", err);
  }

  // ─── Corte de datos: hasta cuándo los números de la sede son
  // completos. Por defecto el ÚLTIMO DÍA CON MOVIMIENTOS a las 23:59
  // (día completo); si el corte real fue a media tarde (ej. Kelly
  // cerró el Excel un viernes 6:30 p.m.), se ajusta la hora en
  // Grupo → Configuración. Tolerante: sin la columna, el dashboard
  // cae al último movimiento igual.
  try {
    await db.execute(sql`
      UPDATE businesses SET data_cutoff_at = (
        SELECT (MAX(d)::date + TIME '23:59') AT TIME ZONE 'America/Lima' FROM (
          SELECT MAX(date) AS d FROM bank_income_items WHERE business_id = ${bId} AND archived = false
          UNION ALL
          SELECT MAX(date) FROM expenses WHERE business_id = ${bId} AND archived = false
        ) t
      )
      WHERE id = ${bId}
    `);
  } catch (err) {
    console.error("[executeExcelImport] data_cutoff_at no aplicado (columna pendiente):", err);
  }

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

// ═══════════════════════════════════════════════════════════════════
// MULTI-MES: detección de meses cargados + orquestador
// ═══════════════════════════════════════════════════════════════════

export type MonthLoadDetection = {
  monthKey: string;        // "2026-04"
  start: string;
  end: string;
  ingresos: number;        // bank_income_items importados del mes
  egresos: number;         // expenses importados del mes
  byteSales: number;       // byte_sales_daily importados del mes
  total: number;
  loaded: boolean;         // total > 0
};

/**
 * Detección READ-ONLY (no escribe) de qué meses ya están cargados para el
 * negocio activo, con conteo de registros importados por mes. Lo consume la
 * UI para mostrar el aviso y la elección Reemplazar/Saltar ANTES de escribir.
 */
export async function getMonthsLoadStatus(
  monthKeys: string[],
  sedeCentral?: string
): Promise<MonthLoadDetection[]> {
  const bId = await importBusinessId(sedeCentral);
  if (bId === null) return [];
  if (!IMPORT_ALLOWED_BIDS.includes(bId)) return [];
  const out: MonthLoadDetection[] = [];
  for (const monthKey of monthKeys) {
    const r = monthRange(monthKey);
    if (!r) continue;
    const { start, end } = r;
    const row = (await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM bank_income_items WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end} AND imported_from_excel = true)::int AS ingresos,
        (SELECT COUNT(*) FROM expenses WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end} AND imported_from_excel = true)::int AS egresos,
        (SELECT COUNT(*) FROM byte_sales_daily WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end} AND imported_from_excel = true)::int AS byte_sales
    `)).rows[0] as { ingresos: number; egresos: number; byte_sales: number };
    const total = Number(row.ingresos) + Number(row.egresos) + Number(row.byte_sales);
    out.push({
      monthKey, start, end,
      ingresos: Number(row.ingresos),
      egresos: Number(row.egresos),
      byteSales: Number(row.byte_sales),
      total,
      loaded: total > 0,
    });
  }
  return out;
}

export type MonthImportPlanItem = {
  monthKey: string;
  ingGtosSheet: string | null;
  controlVtasSheet: string | null;
  /** "import" = importar (reemplaza si ya existe); "skip" = no tocar. */
  action: "import" | "skip";
};

export type MultiMonthResult = {
  perMonth: Array<{
    monthKey: string;
    status: "imported" | "skipped" | "error";
    movementsCount?: number;
    byteSalesDays?: number;
    error?: string;
  }>;
  importedMonths: number;
  skippedMonths: number;
  errorMonths: number;
};

/**
 * Orquestador multi-mes. Recorre el plan y procesa cada mes con action="import"
 * llamando al executeExcelImport ya probado (que ahora borra el MES CALENDARIO
 * COMPLETO de forma atómica). Cada mes es independiente y atómico: si uno
 * falla, los demás ya quedaron commiteados. Los meses "skip" no se tocan.
 *
 * No duplica en silencio (executeExcelImport reemplaza el mes completo) ni
 * borra sin que el plan lo indique explícitamente (action="import").
 */
export async function executeMultiMonthImport(
  fileBase64: string,
  fileName: string,
  plan: MonthImportPlanItem[],
  options: ImportOptions,
  sedeCentral?: string
): Promise<MultiMonthResult> {
  const bId = await importBusinessId(sedeCentral);
  if (bId === null) {
    return {
      perMonth: plan.map((p) => ({ monthKey: p.monthKey, status: "error" as const, error: "El import central es solo para la dirección." })),
      importedMonths: 0, skippedMonths: 0, errorMonths: plan.length,
    };
  }
  if (!IMPORT_ALLOWED_BIDS.includes(bId)) {
    return {
      perMonth: plan.map((p) => ({ monthKey: p.monthKey, status: "error" as const, error: IMPORT_NOT_ALLOWED_MSG })),
      importedMonths: 0, skippedMonths: 0, errorMonths: plan.length,
    };
  }

  const perMonth: MultiMonthResult["perMonth"] = [];
  let importedMonths = 0, skippedMonths = 0, errorMonths = 0;

  // Orden cronológico ascendente para que el recálculo de saldos en cadena
  // procese los meses de más antiguo a más reciente.
  const ordered = [...plan].sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  for (const item of ordered) {
    if (item.action === "skip") {
      perMonth.push({ monthKey: item.monthKey, status: "skipped" });
      skippedMonths++;
      continue;
    }
    if (!item.ingGtosSheet && !item.controlVtasSheet) {
      perMonth.push({ monthKey: item.monthKey, status: "error", error: "Sin pestañas para este mes" });
      errorMonths++;
      continue;
    }
    // sedeCentral DEBE viajar a cada mes (el bug del import desde Grupo:
    // sin esto, cada mes resolvía la sede por cookie = "grupo" → throw).
    // Y un mes que reviente inesperadamente marca SU error, no tumba el lote.
    let r: Awaited<ReturnType<typeof executeExcelImport>>;
    try {
      r = await executeExcelImport(fileBase64, fileName, item.ingGtosSheet, item.controlVtasSheet, options, sedeCentral);
    } catch (err) {
      console.error(`[executeMultiMonthImport] mes ${item.monthKey} reventó:`, err);
      r = { success: false, error: err instanceof Error ? err.message : "Error inesperado en este mes" };
    }
    if (r.success) {
      perMonth.push({
        monthKey: item.monthKey,
        status: "imported",
        movementsCount: r.movementsCount,
        byteSalesDays: r.byteSalesDays,
      });
      importedMonths++;
    } else {
      perMonth.push({ monthKey: item.monthKey, status: "error", error: r.error });
      errorMonths++;
    }
  }

  return { perMonth, importedMonths, skippedMonths, errorMonths };
}
