import * as XLSX from "xlsx";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const EXCEL_PATH = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/Análisis Financiero/1. Atelier/Control Bancario.xlsx";

function excelDate(serial: number): string {
  return new Date((serial - 25569) * 86400000).toISOString().split("T")[0];
}

async function sync() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const data = XLSX.utils.sheet_to_json(wb.Sheets["Transacciones"], { header: 1 }) as unknown[][];

  // Parse saldo inicial
  const saldoInicial = Number(data[13]?.[5]) || 4050.32;
  console.log(`Saldo Inicial: S/${saldoInicial}`);

  // Parse all transactions
  type Tx = { date: string; amount: number; type: "ingreso" | "gasto" };
  const transactions: Tx[] = [];
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0] || typeof row[0] !== "number") continue;
    const date = excelDate(row[0] as number);
    const amount = Math.round(Number(row[1]) * 100) / 100;
    const type = String(row[2] || "").toLowerCase() as "ingreso" | "gasto";
    if (amount > 0 && (type === "ingreso" || type === "gasto")) {
      transactions.push({ date, amount, type });
    }
  }

  // Group by date
  const byDate = new Map<string, { ingresos: number[]; gastos: number[] }>();
  for (const tx of transactions) {
    if (!byDate.has(tx.date)) byDate.set(tx.date, { ingresos: [], gastos: [] });
    const d = byDate.get(tx.date)!;
    if (tx.type === "ingreso") d.ingresos.push(tx.amount);
    else d.gastos.push(tx.amount);
  }

  // =============================================
  // 1. Get existing expenses from DB (to preserve categories)
  // =============================================
  const existingExpenses = await sql`
    SELECT id, date, amount, category, concept, payment_method
    FROM expenses ORDER BY date, sort_order, created_at
  `;

  // Build a lookup: date -> list of expenses with their categories
  const expByDate = new Map<string, Array<{ id: string; amount: number; category: string; concept: string; method: string; used: boolean }>>();
  for (const exp of existingExpenses) {
    const d = new Date(exp.date as string).toISOString().split("T")[0];
    if (!expByDate.has(d)) expByDate.set(d, []);
    expByDate.get(d)!.push({
      id: exp.id as string,
      amount: Math.round(Number(exp.amount) * 100) / 100,
      category: exp.category as string,
      concept: exp.concept as string,
      method: exp.payment_method as string,
      used: false,
    });
  }

  // =============================================
  // 2. Clear and rebuild income items
  // =============================================
  console.log("\n🏦 Sincronizando ingresos BCP...");
  await sql`DELETE FROM bank_income_items`;
  let incomeCount = 0;

  for (const [date, day] of byDate) {
    for (let i = 0; i < day.ingresos.length; i++) {
      await sql`
        INSERT INTO bank_income_items (date, amount, sort_order)
        VALUES (${date}, ${day.ingresos[i]}, ${i})
      `;
      incomeCount++;
    }
  }
  console.log(`  ✅ ${incomeCount} ingresos individuales importados`);

  // =============================================
  // 3. Sync bank expenses (match by date+amount, keep categories)
  // =============================================
  console.log("\n💸 Sincronizando egresos bancarios...");

  // Delete ALL existing expenses (we'll recreate with proper matching)
  await sql`DELETE FROM expenses`;
  let matchedCount = 0;
  let newCount = 0;

  for (const [date, day] of byDate) {
    const existing = expByDate.get(date) || [];

    for (let i = 0; i < day.gastos.length; i++) {
      const amount = day.gastos[i];

      // Try to find a matching expense by amount (not yet used)
      const match = existing.find(e => !e.used && Math.abs(e.amount - amount) < 0.02);

      if (match) {
        // Found match — keep category and concept
        match.used = true;
        await sql`
          INSERT INTO expenses (date, category, concept, payment_method, amount, sort_order)
          VALUES (${date}, ${match.category}, ${match.concept}, ${"transferencia"}, ${amount}, ${i})
        `;
        matchedCount++;
      } else {
        // No match — mark as Desconocido
        await sql`
          INSERT INTO expenses (date, category, concept, payment_method, amount, sort_order)
          VALUES (${date}, ${"Desconocido"}, ${"Por regularizar"}, ${"transferencia"}, ${amount}, ${i})
        `;
        newCount++;
      }
    }

    // Also re-add cash expenses that were in DB but not in the Excel (they're not bank transactions)
    const cashExpenses = existing.filter(e => !e.used && e.method === "efectivo");
    for (let i = 0; i < cashExpenses.length; i++) {
      const ce = cashExpenses[i];
      await sql`
        INSERT INTO expenses (date, category, concept, payment_method, amount, sort_order)
        VALUES (${date}, ${ce.category}, ${ce.concept}, ${"efectivo"}, ${ce.amount}, ${100 + i})
      `;
      matchedCount++;
    }
  }

  console.log(`  ✅ ${matchedCount} egresos con categoría preservada`);
  console.log(`  ⚠️  ${newCount} egresos nuevos marcados como "Desconocido" (por regularizar)`);

  // =============================================
  // 4. Update daily_records with correct totals and running balance
  // =============================================
  console.log("\n📊 Actualizando registros diarios y saldos...");

  let runningBalance = saldoInicial;
  const sortedDates = Array.from(byDate.keys()).sort();

  for (const date of sortedDates) {
    const day = byDate.get(date)!;
    const totalIncome = day.ingresos.reduce((s, a) => s + a, 0);
    const totalExpenseBank = day.gastos.reduce((s, a) => s + a, 0);

    // Get cash expenses for this date
    const cashExp = await sql`
      SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      WHERE date = ${date} AND payment_method = 'efectivo'
    `;
    const totalExpenseCash = Number(cashExp[0].total) || 0;
    const totalExpenseAll = totalExpenseBank + totalExpenseCash;

    runningBalance = Math.round((runningBalance + totalIncome - totalExpenseBank) * 100) / 100;

    await sql`
      INSERT INTO daily_records (date, bank_income, bank_expense, bank_balance_real)
      VALUES (${date}, ${totalIncome}, ${totalExpenseAll}, ${runningBalance})
      ON CONFLICT (date) DO UPDATE SET
        bank_income = ${totalIncome},
        bank_expense = ${totalExpenseAll},
        bank_balance_real = ${runningBalance}
    `;

    console.log(`  ${date}: +${totalIncome.toFixed(2)} -${totalExpenseBank.toFixed(2)} (banco) -${totalExpenseCash.toFixed(2)} (efect.) = Saldo: S/${runningBalance.toFixed(2)}`);
  }

  // =============================================
  // 5. Summary
  // =============================================
  const totalIngresos = transactions.filter(t => t.type === "ingreso").reduce((s, t) => s + t.amount, 0);
  const totalGastos = transactions.filter(t => t.type === "gasto").reduce((s, t) => s + t.amount, 0);

  console.log("\n🎉 Sincronización completa!");
  console.log(`  Saldo Inicial: S/${saldoInicial}`);
  console.log(`  Total Ingresos: S/${totalIngresos.toFixed(2)}`);
  console.log(`  Total Gastos Banco: S/${totalGastos.toFixed(2)}`);
  console.log(`  Saldo Final Calculado: S/${runningBalance.toFixed(2)}`);
  console.log(`  Ingresos importados: ${incomeCount}`);
  console.log(`  Egresos con categoría: ${matchedCount}`);
  console.log(`  Egresos por regularizar: ${newCount}`);

  // List the desconocidos
  if (newCount > 0) {
    const desc = await sql`SELECT date, amount FROM expenses WHERE category = 'Desconocido' ORDER BY date, amount`;
    console.log("\n  ⚠️  Gastos por regularizar:");
    desc.forEach(r => {
      const d = new Date(r.date as string).toISOString().split("T")[0];
      console.log(`    ${d}: S/${Number(r.amount).toFixed(2)}`);
    });
  }
}

sync().catch(console.error);
