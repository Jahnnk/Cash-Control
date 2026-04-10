import * as XLSX from "xlsx";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

const EXCEL_PATH =
  "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/Análisis Financiero/1. Atelier/Finanzas_Atelier_2026.xlsx";

function excelDateToISO(serial: number): string {
  const d = new Date((serial - 25569) * 86400000);
  return d.toISOString().split("T")[0];
}

function num(val: unknown): number {
  if (val === undefined || val === null || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

async function importAll() {
  const wb = XLSX.readFile(EXCEL_PATH);

  // ===== 1. Get client IDs =====
  const clients = await sql`SELECT id, name FROM clients`;
  const clientMap = new Map<string, string>();
  for (const c of clients) {
    clientMap.set((c.name as string).toLowerCase(), c.id as string);
  }

  // We'll use a generic client for Byte sales since the Excel doesn't have per-client sales
  // The CONCILIACIÓN sheet has aggregate daily data, not per-client
  // We'll create a "Ventas Byte (General)" client for aggregate sales
  let byteClientId = clientMap.get("ventas byte (general)");
  if (!byteClientId) {
    const result = await sql`
      INSERT INTO clients (name, type, payment_pattern)
      VALUES ('Ventas Byte (General)', 'b2b', 'variable')
      RETURNING id
    `;
    byteClientId = result[0].id as string;
    console.log("Created 'Ventas Byte (General)' client");
  }

  // ===== 2. Import CONCILIACIÓN (Sales, Collections, Bank Balance) =====
  console.log("\n📊 Importing CONCILIACIÓN...");
  const conc = XLSX.utils.sheet_to_json(wb.Sheets["💳 CONCILIACIÓN"], {
    header: 1,
  }) as unknown[][];

  let salesCount = 0;
  let collectionsCount = 0;
  let bankCount = 0;

  for (let i = 4; i < conc.length; i++) {
    const row = conc[i];
    if (!row || !row[0] || typeof row[0] !== "number") continue;

    const date = excelDateToISO(row[0] as number);
    const totalByte = num(row[10]); // TOTAL BYTE (ventas del día en Byte)
    const descuentos = num(row[9]); // Descuentos
    const ingresoBCP = num(row[11]); // Ingreso BCP (cobros reales)
    const egresoBCP = num(row[12]); // Egreso BCP
    const saldoBCPReal = num(row[20]); // Saldo BCP Real

    // Skip rows with no data at all
    if (totalByte === 0 && ingresoBCP === 0 && egresoBCP === 0 && !row[20])
      continue;

    // Insert sale (daily aggregate from Byte)
    if (totalByte > 0) {
      await sql`
        INSERT INTO sales (client_id, date, amount, discount, net_amount, notes, is_collected)
        VALUES (${byteClientId}, ${date}, ${totalByte + descuentos}, ${descuentos}, ${totalByte}, ${"Venta Byte del día"}, false)
      `;
      salesCount++;
    }

    // Insert collection (real bank income)
    if (ingresoBCP > 0) {
      await sql`
        INSERT INTO collections (client_id, date, amount, notes)
        VALUES (${byteClientId}, ${date}, ${ingresoBCP}, ${"Ingreso BCP del día"})
      `;
      collectionsCount++;
    }

    // Insert bank balance (only if we have a real balance)
    if (row[20] !== undefined && row[20] !== null && row[20] !== "") {
      await sql`
        INSERT INTO bank_balance (date, closing_balance, notes)
        VALUES (${date}, ${saldoBCPReal}, ${"Saldo BCP Real"})
        ON CONFLICT (date) DO UPDATE SET closing_balance = ${saldoBCPReal}
      `;
      bankCount++;
    }
  }

  console.log(
    `  ✅ ${salesCount} ventas, ${collectionsCount} cobros, ${bankCount} saldos de banco`
  );

  // ===== 3. Import ING&GTOS (Expenses) =====
  console.log("\n📈 Importing ING&GTOS (gastos)...");
  const ig = XLSX.utils.sheet_to_json(wb.Sheets["📈 ING&GTOS"], {
    header: 1,
  }) as unknown[][];

  let expensesCount = 0;

  for (let i = 4; i < ig.length; i++) {
    const row = ig[i];
    if (!row || !row[0] || typeof row[0] !== "number") continue;

    const date = excelDateToISO(row[0] as number);
    const category = (row[1] as string) || "Otros";
    const concept = (row[2] as string) || "Sin descripción";
    const method = (row[4] as string) || "transferencia";
    const amount = num(row[5]);
    const note = (row[6] as string) || null;

    if (amount <= 0) continue;

    // Map payment method
    let paymentMethod = "transferencia";
    const m = method.toLowerCase();
    if (m.includes("efect")) paymentMethod = "efectivo";
    else if (m.includes("yape")) paymentMethod = "yape";
    else if (m.includes("transfer")) paymentMethod = "transferencia";

    await sql`
      INSERT INTO expenses (date, category, concept, amount, payment_method, notes)
      VALUES (${date}, ${category}, ${concept}, ${amount}, ${paymentMethod}, ${note})
    `;
    expensesCount++;
  }

  console.log(`  ✅ ${expensesCount} gastos importados`);

  // ===== 4. Apply FIFO - mark sales as collected based on collections =====
  console.log("\n🔄 Aplicando FIFO para marcar ventas cobradas...");

  // Get total collections per client
  const totalCollected = await sql`
    SELECT COALESCE(SUM(amount), 0) as total FROM collections
  `;
  const totalSales = await sql`
    SELECT COALESCE(SUM(net_amount), 0) as total FROM sales
  `;

  console.log(
    `  Total cobrado: S/${num(totalCollected[0].total)}`
  );
  console.log(`  Total vendido: S/${num(totalSales[0].total)}`);

  // Mark sales as collected FIFO up to the amount collected
  const uncollected = await sql`
    SELECT id, net_amount FROM sales
    WHERE is_collected = false
    ORDER BY date ASC
  `;

  let remaining = num(totalCollected[0].total);
  let markedCount = 0;

  for (const sale of uncollected) {
    if (remaining <= 0) break;
    const saleAmount = num(sale.net_amount);
    if (remaining >= saleAmount) {
      await sql`UPDATE sales SET is_collected = true WHERE id = ${sale.id}`;
      remaining -= saleAmount;
      markedCount++;
    }
  }

  console.log(`  ✅ ${markedCount} ventas marcadas como cobradas (FIFO)`);

  // ===== Summary =====
  console.log("\n🎉 Importación completa!");
  console.log(`  Ventas: ${salesCount}`);
  console.log(`  Cobros: ${collectionsCount}`);
  console.log(`  Gastos: ${expensesCount}`);
  console.log(`  Saldos banco: ${bankCount}`);
}

importAll().catch(console.error);
