"use server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Datos consolidados para la vista /grupo/dashboard.
 *
 * Convenciones:
 * - Saldo BCP por negocio = método híbrido (último anchor + flujo).
 *   Reusamos la misma fórmula que getUnifiedBankBalance() pero ejecutada
 *   3 veces (una por negocio) y agregada.
 * - Ingresos del mes = SUM(bank_income_items.amount) por negocio.
 * - Gastos del mes = SUM(expenses) por negocio. **Para evitar contar
 *   doble los gastos compartidos**, se usa atelier_amount cuando
 *   is_shared=true; el lado Fonavi de la regla aún no genera fila
 *   propia en su tabla (CAMBIO 7.5 pendiente).
 */
export type BusinessSummary = {
  businessId: number;
  code: string;
  name: string;
  bankBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  margin: number;
};

// ─────────────────────────────────────────────────────────────────
// Frescura de datos por sede: ¿hasta qué fecha hay información?
// Kelly registra Fonavi/Centro en su Excel y a veces la entrega con
// días/semanas de atraso — esta señal le dice a Jahnn exactamente qué
// rango pedirle para tener las 3 sedes al día.
// ─────────────────────────────────────────────────────────────────

export type DataFreshness = {
  businessId: number;
  name: string;
  /** Última fecha con actividad financiera registrada (null = nada). */
  lastDate: string | null;
  /** Días de atraso vs hoy (0 = al día). */
  daysBehind: number | null;
};

export async function getDataFreshness(): Promise<DataFreshness[]> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const rows = await db.execute(sql`
    SELECT b.id, b.name,
      GREATEST(
        (SELECT MAX(date) FROM expenses e
          WHERE e.business_id = b.id AND e.archived = false AND e.date <= ${today}),
        (SELECT MAX(date) FROM bank_income_items i
          WHERE i.business_id = b.id AND i.archived = false AND i.date <= ${today}),
        (SELECT MAX(date) FROM daily_records d
          WHERE d.business_id = b.id AND d.archived = false AND d.date <= ${today}
            AND (COALESCE(d.byte_total, 0) > 0 OR COALESCE(d.bank_income, 0) > 0 OR d.bank_balance_real IS NOT NULL))
      )::text AS last_date
    FROM businesses b
    WHERE b.active = true
    ORDER BY b.id
  `);
  return (rows.rows as { id: number; name: string; last_date: string | null }[]).map((r) => {
    let daysBehind: number | null = null;
    if (r.last_date) {
      const a = new Date(r.last_date + "T00:00:00Z").getTime();
      const b = new Date(today + "T00:00:00Z").getTime();
      daysBehind = Math.max(0, Math.round((b - a) / 86400000));
    }
    return { businessId: r.id, name: r.name, lastDate: r.last_date, daysBehind };
  });
}

export type KellyLoadStatus = {
  businessId: number;
  name: string;
  /** Última carga de Excel completada (fecha de subida, Lima) o null. */
  lastImportAt: string | null;
  /** Hasta qué fecha cubren los datos cargados (fin del rango del batch). */
  coversThrough: string | null;
  /** Días desde la última carga; null = nunca ha cargado. */
  daysSinceImport: number | null;
  /** Semáforo del acuerdo semanal (viernes): verde ≤7d, ámbar 8-14, rojo >14 o nunca. */
  level: "verde" | "ambar" | "rojo";
};

/**
 * Semáforo de cargas del Excel de Kelly por sede (transición ago-2026:
 * ella lleva las finanzas de las 3 sedes y sube los viernes; Jahnn
 * verifica desde aquí). Regla auditable: verde ≤7 días desde la última
 * carga completada, ámbar 8-14, rojo >14 o nunca.
 */
export async function getKellyLoadStatus(): Promise<KellyLoadStatus[]> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const rows = await db.execute(sql`
    SELECT b.id, b.name,
      (SELECT MAX(ib.imported_at AT TIME ZONE 'America/Lima')::date::text
         FROM import_batches ib
        WHERE ib.business_id = b.id AND ib.status = 'completed') AS last_import,
      -- "Cubre hasta" = último DÍA CON DATOS reales del Excel, no el fin
      -- del rango de la pestaña: una pestaña "Julio" dice 31/07 aunque
      -- los datos lleguen al 22.
      --
      -- Se mira el MOVIMIENTO más reciente que trajo el Excel, no solo
      -- la venta diaria. Atelier es centro de producción: su pestaña
      -- "Control de VTAS" llega vacía porque no tiene ventas de
      -- mostrador, y mirando solo esa tabla el panel decía "datos hasta
      -- el 19/08" cuando su Excel estaba cargado hasta el 03/09 igual
      -- que las otras dos sedes. Una alarma falsa en el tablero de
      -- dirección es peor que no tener alarma: enseña a ignorarlas.
      --
      -- GREATEST ignora los NULL, así que cada sede aporta las fuentes
      -- que su operación produce y ninguna queda castigada por las que
      -- no le corresponden.
      COALESCE(
        GREATEST(
          (SELECT MAX(bs.date) FROM byte_sales_daily bs
            WHERE bs.business_id = b.id AND COALESCE(bs.total, 0) > 0),
          (SELECT MAX(bi.date) FROM bank_income_items bi
            WHERE bi.business_id = b.id AND bi.imported_from_excel = true AND bi.archived = false),
          (SELECT MAX(e.date) FROM expenses e
            WHERE e.business_id = b.id AND e.imported_from_excel = true AND e.archived = false)
        )::text,
        (SELECT MAX(ib.date_range_end)::text FROM import_batches ib
          WHERE ib.business_id = b.id AND ib.status = 'completed')
      ) AS covers
    FROM businesses b
    WHERE b.active = true
    ORDER BY b.id
  `);
  return (rows.rows as { id: number; name: string; last_import: string | null; covers: string | null }[]).map((r) => {
    let days: number | null = null;
    if (r.last_import) {
      const a = new Date(r.last_import + "T00:00:00Z").getTime();
      const b = new Date(today + "T00:00:00Z").getTime();
      days = Math.max(0, Math.round((b - a) / 86400000));
    }
    const level = days === null ? "rojo" : days <= 7 ? "verde" : days <= 14 ? "ambar" : "rojo";
    return { businessId: r.id, name: r.name, lastImportAt: r.last_import, coversThrough: r.covers, daysSinceImport: days, level };
  });
}

export async function getGroupDashboard(monthInput?: string) {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.substring(0, 7);
  const month = monthInput && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput) ? monthInput : currentMonth;
  const startOfMonth = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const endOfMonth = `${month}-${String(lastDay).padStart(2, "0")}`;
  const isCurrentMonth = month === currentMonth;
  const monthEndDate = isCurrentMonth ? today : endOfMonth;

  const businesses = await db.execute(sql`
    SELECT id, code, name FROM businesses WHERE active = true ORDER BY id
  `);

  const summaries: BusinessSummary[] = [];
  for (const b of businesses.rows as Array<{ id: number; code: string; name: string }>) {
    // Saldo BCP — método híbrido por negocio (MISMA lógica que
    // getUnifiedBankBalance): último saldo real registrado o, si no
    // hay, el saldo inicial del corte (Fonavi/Centro con reset). Sin
    // este respaldo, al limpiar las anclas basura (auditoría 27-jul)
    // el Grupo mostraba S/0.00 mientras la sede mostraba el saldo bien.
    const anchorRes = await db.execute(sql`
      SELECT bank_balance_real::text AS anchor, date::text AS date FROM daily_records
      WHERE business_id = ${b.id} AND bank_balance_real IS NOT NULL AND date <= ${today}
        AND archived = false
      ORDER BY date DESC LIMIT 1
    `);
    let anchorRow = anchorRes.rows[0] as { anchor: string; date: string } | undefined;
    if (!anchorRow) {
      const cfgRes = await db.execute(sql`
        SELECT initial_bcp_balance::text AS anchor, initial_balance_date::text AS date
        FROM businesses
        WHERE id = ${b.id} AND system_start_date IS NOT NULL AND initial_balance_date IS NOT NULL
      `);
      anchorRow = cfgRes.rows[0] as { anchor: string; date: string } | undefined;
    }
    let bankBalance = 0;
    if (anchorRow) {
      const anchor = parseFloat(anchorRow.anchor);
      const anchorDate = anchorRow.date;
      const incRes = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) AS t FROM bank_income_items
        WHERE business_id = ${b.id} AND date > ${anchorDate} AND date <= ${today} AND (is_special_loan = false OR loan_via_bank = true) AND payment_method <> 'efectivo' AND archived = false
      `);
      const expRes = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) AS t FROM expenses
        WHERE business_id = ${b.id} AND date > ${anchorDate} AND date <= ${today} AND payment_method NOT IN ('efectivo','pendiente_atelier','socio') AND (is_special_loan = false OR loan_via_bank = true) AND archived = false
      `);
      bankBalance = Math.round((anchor + parseFloat(incRes.rows[0].t as string) - parseFloat(expRes.rows[0].t as string)) * 100) / 100;
    }

    // Ingresos del mes (operativos: excluye reembolsos Fonavi, préstamos socio e ingresos no operativos)
    const incomeRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) AS t FROM bank_income_items
      WHERE business_id = ${b.id} AND date >= ${startOfMonth} AND date <= ${monthEndDate} AND is_fonavi_reimbursement = false AND is_special_loan = false AND is_internal_transfer = false AND archived = false AND non_operative_category IS NULL
    `);
    const monthlyIncome = parseFloat(incomeRes.rows[0].t as string);

    // Gastos del mes — atelier_amount cuando es compartido (no contar la parte Fonavi).
    // Excluye préstamos del socio (no son gasto operativo).
    const expRes = await db.execute(sql`
      SELECT COALESCE(SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END), 0) AS t
      FROM expenses
      WHERE business_id = ${b.id} AND date >= ${startOfMonth} AND date <= ${monthEndDate} AND is_special_loan = false AND is_internal_transfer = false AND archived = false
    `);
    const monthlyExpenses = parseFloat(expRes.rows[0].t as string);

    summaries.push({
      businessId: b.id,
      code: b.code,
      name: b.name,
      bankBalance,
      monthlyIncome,
      monthlyExpenses,
      margin: monthlyIncome - monthlyExpenses,
    });
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      bankBalance: acc.bankBalance + s.bankBalance,
      monthlyIncome: acc.monthlyIncome + s.monthlyIncome,
      monthlyExpenses: acc.monthlyExpenses + s.monthlyExpenses,
      margin: acc.margin + s.margin,
    }),
    { bankBalance: 0, monthlyIncome: 0, monthlyExpenses: 0, margin: 0 }
  );

  return {
    selectedMonth: month,
    currentMonth,
    isCurrentMonth,
    summaries,
    totals,
  };
}
