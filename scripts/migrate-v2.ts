import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("Migrating to v2: daily_records table...");

  // New table: daily summary from Byte + bank
  await sql`
    CREATE TABLE IF NOT EXISTS daily_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL UNIQUE,
      -- Byte fields
      byte_cash NUMERIC(10,2) DEFAULT 0,
      byte_credit_day NUMERIC(10,2) DEFAULT 0,
      byte_credit_collected NUMERIC(10,2) DEFAULT 0,
      byte_credit_balance NUMERIC(10,2) DEFAULT 0,
      byte_discounts NUMERIC(10,2) DEFAULT 0,
      byte_total NUMERIC(10,2) DEFAULT 0,
      -- Bank fields
      bank_income NUMERIC(10,2) DEFAULT 0,
      bank_expense NUMERIC(10,2) DEFAULT 0,
      bank_balance_real NUMERIC(10,2),
      -- Computed
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  // Migrate existing data from sales/collections/bank_balance into daily_records
  const existingSales = await sql`
    SELECT date, amount as byte_total, discount as byte_discounts
    FROM sales ORDER BY date
  `;

  const existingCollections = await sql`
    SELECT date, amount as bank_income FROM collections ORDER BY date
  `;

  const existingBank = await sql`
    SELECT date, closing_balance FROM bank_balance ORDER BY date
  `;

  // Build a map by date
  const dateMap = new Map<string, Record<string, number>>();

  for (const s of existingSales) {
    const d = String(s.date);
    const rec = dateMap.get(d) || {};
    rec.byte_total = Number(s.byte_total) || 0;
    rec.byte_discounts = Number(s.byte_discounts) || 0;
    dateMap.set(d, rec);
  }

  for (const c of existingCollections) {
    const d = String(c.date);
    const rec = dateMap.get(d) || {};
    rec.bank_income = Number(c.bank_income) || 0;
    dateMap.set(d, rec);
  }

  for (const b of existingBank) {
    const d = String(b.date);
    const rec = dateMap.get(d) || {};
    rec.bank_balance_real = Number(b.closing_balance) || 0;
    dateMap.set(d, rec);
  }

  let count = 0;
  for (const [date, rec] of dateMap) {
    await sql`
      INSERT INTO daily_records (date, byte_total, byte_discounts, bank_income, bank_balance_real)
      VALUES (
        ${date},
        ${rec.byte_total || 0},
        ${rec.byte_discounts || 0},
        ${rec.bank_income || 0},
        ${rec.bank_balance_real ?? null}
      )
      ON CONFLICT (date) DO UPDATE SET
        byte_total = ${rec.byte_total || 0},
        byte_discounts = ${rec.byte_discounts || 0},
        bank_income = ${rec.bank_income || 0},
        bank_balance_real = ${rec.bank_balance_real ?? null}
    `;
    count++;
  }

  console.log(`Migrated ${count} daily records`);

  // Now re-import from Excel with full Byte detail
  console.log("Re-importing CONCILIACIÓN with full Byte fields...");

  const XLSX = require("xlsx");
  const wb = XLSX.readFile(
    "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/Análisis Financiero/1. Atelier/Finanzas_Atelier_2026.xlsx"
  );
  const conc = XLSX.utils.sheet_to_json(wb.Sheets["💳 CONCILIACIÓN"], {
    header: 1,
  }) as unknown[][];

  let updated = 0;
  for (let i = 4; i < conc.length; i++) {
    const row = conc[i];
    if (!row || !row[0] || typeof row[0] !== "number") continue;

    const date = new Date(((row[0] as number) - 25569) * 86400000)
      .toISOString()
      .split("T")[0];

    const byteCash = num(row[5]); // Contado
    const byteCreditDay = num(row[6]); // Créd. Día
    const byteCreditCollected = num(row[7]); // Créd. Cobr.
    const byteCreditBalance = num(row[8]); // Saldo Créd.
    const byteDiscounts = num(row[9]); // Descuentos
    const byteTotal = num(row[10]); // TOTAL BYTE
    const bankIncome = num(row[11]); // Ingreso BCP
    const bankExpense = num(row[12]); // Egreso BCP
    const bankBalanceReal = row[20] !== undefined && row[20] !== null && row[20] !== "" ? num(row[20]) : null;

    if (byteTotal === 0 && bankIncome === 0 && bankExpense === 0 && bankBalanceReal === null)
      continue;

    await sql`
      INSERT INTO daily_records (
        date, byte_cash, byte_credit_day, byte_credit_collected,
        byte_credit_balance, byte_discounts, byte_total,
        bank_income, bank_expense, bank_balance_real
      ) VALUES (
        ${date}, ${byteCash}, ${byteCreditDay}, ${byteCreditCollected},
        ${byteCreditBalance}, ${byteDiscounts}, ${byteTotal},
        ${bankIncome}, ${bankExpense}, ${bankBalanceReal}
      )
      ON CONFLICT (date) DO UPDATE SET
        byte_cash = ${byteCash},
        byte_credit_day = ${byteCreditDay},
        byte_credit_collected = ${byteCreditCollected},
        byte_credit_balance = ${byteCreditBalance},
        byte_discounts = ${byteDiscounts},
        byte_total = ${byteTotal},
        bank_income = ${bankIncome},
        bank_expense = ${bankExpense},
        bank_balance_real = ${bankBalanceReal}
    `;
    updated++;
  }

  console.log(`Updated ${updated} daily records with full Byte detail`);
  console.log("Migration v2 complete!");
}

function num(val: unknown): number {
  if (val === undefined || val === null || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

migrate().catch(console.error);
