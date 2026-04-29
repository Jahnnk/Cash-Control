// Capa 2 — Matemática total. Solo lectura.
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const SALDO_INICIAL_31_MAR = 4050.32;
const SALDO_SISTEMA = 9255.94;
const SALDO_BANCO_REAL = 7668.72;

function fmt(n: number) {
  return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  console.log("===== CAPA 2: Matemática total =====\n");

  // 2.A — Sumas en tablas detalladas
  const incItems = (await sql`SELECT COALESCE(SUM(amount), 0)::float as t, COUNT(*)::int as n FROM bank_income_items`) as { t: number; n: number }[];
  const expBankAll = (await sql`SELECT COALESCE(SUM(amount), 0)::float as t, COUNT(*)::int as n FROM expenses WHERE payment_method != 'efectivo'`) as { t: number; n: number }[];
  const expEfectivo = (await sql`SELECT COALESCE(SUM(amount), 0)::float as t, COUNT(*)::int as n FROM expenses WHERE payment_method = 'efectivo'`) as { t: number; n: number }[];
  const expNullMethod = (await sql`SELECT COALESCE(SUM(amount), 0)::float as t, COUNT(*)::int as n FROM expenses WHERE payment_method IS NULL`) as { t: number; n: number }[];

  console.log(`bank_income_items:        ${fmt(incItems[0].t)}  (${incItems[0].n} filas)`);
  console.log(`expenses no-efectivo:     ${fmt(expBankAll[0].t)}  (${expBankAll[0].n} filas)`);
  console.log(`expenses efectivo:        ${fmt(expEfectivo[0].t)}  (${expEfectivo[0].n} filas) — NO afectan banco`);
  console.log(`expenses payment NULL:    ${fmt(expNullMethod[0].t)}  (${expNullMethod[0].n} filas)`);

  // 2.B — Sumas en daily_records (campos cacheados)
  const dailyTotals = (await sql`
    SELECT
      COALESCE(SUM(bank_income), 0)::float as inc,
      COALESCE(SUM(bank_expense), 0)::float as exp
    FROM daily_records
  `) as { inc: number; exp: number }[];

  console.log(`\ndaily_records.bank_income (acumulado): ${fmt(dailyTotals[0].inc)}`);
  console.log(`daily_records.bank_expense (acumulado): ${fmt(dailyTotals[0].exp)}`);

  // 2.C — Cálculo del saldo según fórmula
  console.log("\n----- CÁLCULO -----");
  const calculadoFromItems = SALDO_INICIAL_31_MAR + incItems[0].t - expBankAll[0].t;
  const calculadoFromDaily = SALDO_INICIAL_31_MAR + dailyTotals[0].inc - dailyTotals[0].exp;

  console.log(`\nUsando bank_income_items + expenses (fuente DETALLADA):`);
  console.log(`  ${fmt(SALDO_INICIAL_31_MAR)} + ${fmt(incItems[0].t)} − ${fmt(expBankAll[0].t)} = ${fmt(calculadoFromItems)}`);

  console.log(`\nUsando daily_records.bank_income/bank_expense (fuente CACHEADA):`);
  console.log(`  ${fmt(SALDO_INICIAL_31_MAR)} + ${fmt(dailyTotals[0].inc)} − ${fmt(dailyTotals[0].exp)} = ${fmt(calculadoFromDaily)}`);

  console.log("\n----- COMPARATIVAS -----");
  console.log(`Saldo según sistema (Dashboard):  ${fmt(SALDO_SISTEMA)}`);
  console.log(`Saldo real banco BCP:             ${fmt(SALDO_BANCO_REAL)}`);
  console.log(`Saldo calculado desde detalle:    ${fmt(calculadoFromItems)}`);
  console.log(`Saldo calculado desde daily:      ${fmt(calculadoFromDaily)}`);

  console.log("\n----- DIFERENCIAS -----");
  console.log(`Sistema vs banco real:            ${fmt(SALDO_SISTEMA - SALDO_BANCO_REAL)}  (lo que dice Jahnn)`);
  console.log(`Calculado-detalle vs sistema:     ${fmt(calculadoFromItems - SALDO_SISTEMA)}`);
  console.log(`Calculado-detalle vs banco real:  ${fmt(calculadoFromItems - SALDO_BANCO_REAL)}`);
  console.log(`Calculado-daily vs sistema:       ${fmt(calculadoFromDaily - SALDO_SISTEMA)}`);

  // 2.D — Consistencia entre tablas detalladas y daily_records
  console.log("\n----- CONSISTENCIA TABLA DETALLADA vs CACHE daily_records -----");
  const incDelta = incItems[0].t - dailyTotals[0].inc;
  const expDelta = expBankAll[0].t - dailyTotals[0].exp;
  console.log(`Δ ingresos (items − daily.bank_income):  ${fmt(incDelta)}`);
  console.log(`Δ egresos (no-efectivo − daily.bank_expense):  ${fmt(expDelta)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
