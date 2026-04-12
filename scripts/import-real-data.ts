import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function importAll() {
  console.log("🗑️  Limpiando datos anteriores...");
  await sql`DELETE FROM bank_income_items`;
  await sql`DELETE FROM expenses`;
  await sql`DELETE FROM daily_records`;
  console.log("Limpiado.");

  // =============================================
  // 1. DAILY RECORDS — Byte + BCP Ingresos
  // =============================================
  console.log("\n📊 Importando registros diarios (Byte + BCP)...");

  const days = [
    // date, creditDay, creditCollected, discounts, efectivo, digital, bankIncome, bankBalanceReal
    // Semana 14
    { date: "2026-04-01", creditDay: 1766.35, creditCollected: 184.80, discounts: 334.47, efectivo: 72, digital: 0, bankIncome: 68.80, saldo: 2004.67 },
    { date: "2026-04-02", creditDay: 1138.63, creditCollected: 197.13, discounts: 268.43, efectivo: 0, digital: 74.40, bankIncome: 305.33, saldo: 1938.80 },
    { date: "2026-04-03", creditDay: 674.12, creditCollected: 10978.77, discounts: 252.97, efectivo: 0, digital: 0, bankIncome: 36.40, saldo: 2085.80 },
    { date: "2026-04-04", creditDay: 1230.45, creditCollected: 522.73, discounts: 239.22, efectivo: 0, digital: 11, bankIncome: 584.13, saldo: 2614.43 },
    { date: "2026-04-05", creditDay: 447.07, creditCollected: 0, discounts: 174.13, efectivo: 0, digital: 0, bankIncome: 32.00, saldo: 2646.43 },
    // Semana 15
    { date: "2026-04-06", creditDay: 3174.93, creditCollected: 5202.13, discounts: 458.95, efectivo: 0, digital: 0, bankIncome: 4605.03, saldo: 6280.46 },
    { date: "2026-04-07", creditDay: 880.37, creditCollected: 77.20, discounts: 239.04, efectivo: 0, digital: 0, bankIncome: 47.10, saldo: 1512.55 },
    { date: "2026-04-08", creditDay: 2188.20, creditCollected: 180.73, discounts: 330.82, efectivo: 0, digital: 0, bankIncome: 2882.88, saldo: 2472.88 },
    { date: "2026-04-09", creditDay: 1039.33, creditCollected: 392.60, discounts: 361.29, efectivo: 0, digital: 0, bankIncome: 144.80, saldo: 1856.92 },
    { date: "2026-04-10", creditDay: 1211.73, creditCollected: 128.62, discounts: 294.32, efectivo: 0, digital: 0, bankIncome: 2852.62, saldo: 3232.94 },
  ];

  for (const d of days) {
    const byteTotal = d.creditDay + d.efectivo + d.digital;
    const creditBalance = d.creditDay - d.creditCollected;
    await sql`
      INSERT INTO daily_records (
        date, byte_cash_physical, byte_digital, byte_cash,
        byte_credit_day, byte_credit_collected, byte_credit_balance,
        byte_discounts, byte_total,
        bank_income, bank_balance_real
      ) VALUES (
        ${d.date}, ${d.efectivo}, ${d.digital}, ${d.efectivo + d.digital},
        ${d.creditDay}, ${d.creditCollected}, ${creditBalance},
        ${d.discounts}, ${byteTotal},
        ${d.bankIncome}, ${d.saldo}
      )
      ON CONFLICT (date) DO UPDATE SET
        byte_cash_physical = ${d.efectivo}, byte_digital = ${d.digital},
        byte_cash = ${d.efectivo + d.digital},
        byte_credit_day = ${d.creditDay}, byte_credit_collected = ${d.creditCollected},
        byte_credit_balance = ${creditBalance}, byte_discounts = ${d.discounts},
        byte_total = ${byteTotal},
        bank_income = ${d.bankIncome}, bank_balance_real = ${d.saldo}
    `;
  }
  console.log(`  ✅ ${days.length} registros diarios importados`);

  // =============================================
  // 2. BANK INCOME ITEMS (para detalle)
  // =============================================
  console.log("\n🏦 Importando ingresos BCP individuales...");
  const incomes = [
    { date: "2026-04-01", amount: 68.80, note: "" },
    { date: "2026-04-02", amount: 305.33, note: "" },
    { date: "2026-04-03", amount: 36.40, note: "" },
    { date: "2026-04-04", amount: 584.13, note: "" },
    { date: "2026-04-05", amount: 32.00, note: "" },
    { date: "2026-04-06", amount: 4605.03, note: "" },
    { date: "2026-04-07", amount: 47.10, note: "" },
    { date: "2026-04-08", amount: 2882.88, note: "" },
    { date: "2026-04-09", amount: 144.80, note: "" },
    { date: "2026-04-10", amount: 2852.62, note: "" },
  ];

  for (const inc of incomes) {
    await sql`INSERT INTO bank_income_items (date, amount, note) VALUES (${inc.date}, ${inc.amount}, ${inc.note || null})`;
  }
  console.log(`  ✅ ${incomes.length} ingresos BCP importados`);

  // =============================================
  // 3. EXPENSES (egresos detallados)
  // =============================================
  console.log("\n💸 Importando egresos...");

  const expenses = [
    // 01/04
    { date: "2026-04-01", category: "Insumos", concept: "Compras metro, harina pastelera", method: "transferencia", amount: 130.90 },
    { date: "2026-04-01", category: "Insumos", concept: "Compra de 10 harinas panaderas y 3 pasteleras", method: "transferencia", amount: 1676.70 },
    { date: "2026-04-01", category: "Insumos", concept: "Huevos semanales", method: "transferencia", amount: 388.50 },
    { date: "2026-04-01", category: "Ss Bancarios", concept: "ITF", method: "transferencia", amount: 0.10 },
    // 02/04
    { date: "2026-04-02", category: "Insumos", concept: "Compras Onda orgánica", method: "transferencia", amount: 172.00 },
    { date: "2026-04-02", category: "Deliverys", concept: "Delivery Jormar - compras Onda", method: "transferencia", amount: 7.00 },
    // 03/04
    { date: "2026-04-03", category: "Ss Bancarios", concept: "ITF", method: "transferencia", amount: 0.10 },
    { date: "2026-04-03", category: "Deliverys", concept: "Deliverys punto de venta", method: "transferencia", amount: 39.00 },
    { date: "2026-04-03", category: "Oficina", concept: "Micas", method: "transferencia", amount: 16.50 },
    // 06/04
    { date: "2026-04-06", category: "Insumos", concept: "Insumos Caja chica Luis (del 28/03 al 05/04)", method: "transferencia", amount: 730.40 },
    { date: "2026-04-06", category: "Deliverys", concept: "Delivery caja Luis", method: "transferencia", amount: 85.00 },
    { date: "2026-04-06", category: "Limpieza", concept: "Artículos de limpieza - Caja Luis", method: "transferencia", amount: 53.00 },
    { date: "2026-04-06", category: "Vueltos y Devoluciones", concept: "Vueltos caja Luis", method: "transferencia", amount: 22.00 },
    { date: "2026-04-06", category: "Ss Bancarios", concept: "ITF", method: "transferencia", amount: 0.10 },
    { date: "2026-04-06", category: "SUNAT", concept: "Impuestos", method: "transferencia", amount: 315.23 },
    { date: "2026-04-06", category: "Alquiler", concept: "Pago de alquiler del mes", method: "transferencia", amount: 2700.00 },
    { date: "2026-04-06", category: "Insumos", concept: "Compra de mantequilla y quesos semanales", method: "transferencia", amount: 840.00 },
    { date: "2026-04-06", category: "Ss Bancarios", concept: "ITF", method: "transferencia", amount: 0.30 },
    { date: "2026-04-06", category: "Mantenimientos", concept: "Pago a Juan por vestidor de hombres", method: "transferencia", amount: 110.00 },
    { date: "2026-04-06", category: "Planilla", concept: "Reembolso Claudia Fabiana", method: "transferencia", amount: 55.00 },
    { date: "2026-04-06", category: "Planilla", concept: "Reembolso Isa", method: "transferencia", amount: 6.18 },
    { date: "2026-04-06", category: "Planilla", concept: "Reembolso Claudio", method: "transferencia", amount: 8.70 },
    // 07/04
    { date: "2026-04-07", category: "Insumos", concept: "Insumos onda orgánica", method: "transferencia", amount: 846.70 },
    { date: "2026-04-07", category: "Deliverys", concept: "Delivery onda orgánica", method: "transferencia", amount: 10.00 },
    // 08/04
    { date: "2026-04-08", category: "Insumos", concept: "8920 g de tapa de lomo", method: "transferencia", amount: 330.00 },
    { date: "2026-04-08", category: "Ss Bancarios", concept: "ITF", method: "transferencia", amount: 0.05 },
    { date: "2026-04-08", category: "Préstamos", concept: "Pago préstamo Diners", method: "transferencia", amount: 1596.00 },
    // 09/04
    { date: "2026-04-09", category: "Limpieza", concept: "Productos de limpieza", method: "transferencia", amount: 118.70 },
    { date: "2026-04-09", category: "Deliverys", concept: "Delivery caja Luis", method: "transferencia", amount: 31.00 },
    { date: "2026-04-09", category: "Insumos", concept: "Insumos (metro, crema de leche, leche)", method: "transferencia", amount: 542.76 },
    { date: "2026-04-09", category: "Fletes", concept: "Flete Shalom", method: "transferencia", amount: 53.00 },
    { date: "2026-04-09", category: "Insumos", concept: "Leche Gloria en Bolsa", method: "transferencia", amount: 15.30 },
    // 10/04
    { date: "2026-04-10", category: "Ss Bancarios", concept: "ITF", method: "transferencia", amount: 0.10 },
    { date: "2026-04-10", category: "Insumos", concept: "Insumos pagados por Luis", method: "transferencia", amount: 531.80 },
    { date: "2026-04-10", category: "Limpieza", concept: "Artículos de limpieza - Caja Luis", method: "transferencia", amount: 61.80 },
    { date: "2026-04-10", category: "Deliverys", concept: "Delivery caja Luis", method: "transferencia", amount: 50.00 },
    { date: "2026-04-10", category: "Otros", concept: "Packaging", method: "transferencia", amount: 34.00 },
    { date: "2026-04-10", category: "Fletes", concept: "Pago en efectivo por fletes", method: "efectivo", amount: 125.00 },
    { date: "2026-04-10", category: "Deliverys", concept: "Pago deliverys Luis", method: "efectivo", amount: 96.00 },
    { date: "2026-04-10", category: "Insumos", concept: "Insumos pagados por Luis", method: "efectivo", amount: 67.00 },
    { date: "2026-04-10", category: "Otros", concept: "Packaging", method: "efectivo", amount: 10.00 },
  ];

  for (const exp of expenses) {
    await sql`
      INSERT INTO expenses (date, category, concept, payment_method, amount)
      VALUES (${exp.date}, ${exp.category}, ${exp.concept}, ${exp.method}, ${exp.amount})
    `;
  }
  console.log(`  ✅ ${expenses.length} egresos importados`);

  // Update bank_expense totals in daily_records
  console.log("\n🔄 Actualizando totales de egresos en registros diarios...");
  await sql`
    UPDATE daily_records dr SET bank_expense = COALESCE((
      SELECT SUM(amount) FROM expenses WHERE date = dr.date
    ), 0)
  `;

  // =============================================
  // SUMMARY
  // =============================================
  const totals = await sql`
    SELECT
      (SELECT COUNT(*) FROM daily_records) as days,
      (SELECT COUNT(*) FROM expenses) as expenses,
      (SELECT COUNT(*) FROM bank_income_items) as incomes,
      (SELECT COALESCE(SUM(byte_total), 0) FROM daily_records) as total_byte,
      (SELECT COALESCE(SUM(bank_income), 0) FROM daily_records) as total_income,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses) as total_expenses
  `;

  console.log("\n🎉 Importación completa!");
  console.log(`  Días: ${totals[0].days}`);
  console.log(`  Ingresos BCP: ${totals[0].incomes}`);
  console.log(`  Egresos: ${totals[0].expenses}`);
  console.log(`  Total Byte: S/${Number(totals[0].total_byte).toFixed(2)}`);
  console.log(`  Total Ingresos BCP: S/${Number(totals[0].total_income).toFixed(2)}`);
  console.log(`  Total Egresos: S/${Number(totals[0].total_expenses).toFixed(2)}`);
}

importAll().catch(console.error);
