import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("\n=== TABLAS LEGACY: sales / collections ===");

  const sales = await sql`SELECT MIN(date) as oldest, MAX(date) as newest, COUNT(*) as total FROM sales`;
  const cols = await sql`SELECT MIN(date) as oldest, MAX(date) as newest, COUNT(*) as total FROM collections`;
  console.log("sales:", sales[0]);
  console.log("collections:", cols[0]);

  console.log("\n=== FUENTE DE VERDAD ACTUAL: bank_income_items con client_id ===");
  const bii = await sql`
    SELECT MIN(date) as oldest, MAX(date) as newest, COUNT(*) as total
    FROM bank_income_items WHERE client_id IS NOT NULL
  `;
  console.log("bank_income_items con client_id:", bii[0]);

  console.log("\n=== POR CLIENTE: cobros legacy vs cobros vivos ===");
  const perClient = await sql`
    SELECT
      c.id,
      c.name,
      c.is_active,
      (SELECT COUNT(*) FROM sales s WHERE s.client_id = c.id) as sales_legacy,
      (SELECT COALESCE(SUM(s.net_amount), 0) FROM sales s WHERE s.client_id = c.id AND s.is_collected = false) as pending_legacy,
      (SELECT COUNT(*) FROM collections col WHERE col.client_id = c.id) as collections_legacy,
      (SELECT COUNT(*) FROM bank_income_items bi WHERE bi.client_id = c.id) as income_items_vivos,
      (SELECT COALESCE(SUM(bi.amount), 0) FROM bank_income_items bi WHERE bi.client_id = c.id) as cobrado_vivo
    FROM clients c
    ORDER BY c.name
  `;
  console.log(perClient);

  console.log("\n=== ÚLTIMAS 5 ESCRITURAS A sales / collections (timestamp) ===");
  const lastSales = await sql`
    SELECT date, amount, created_at FROM sales ORDER BY created_at DESC LIMIT 5
  `;
  const lastColl = await sql`
    SELECT date, amount, created_at FROM collections ORDER BY created_at DESC LIMIT 5
  `;
  console.log("Últimas sales:", lastSales);
  console.log("Últimas collections:", lastColl);
}

main().catch((e) => { console.error(e); process.exit(1); });
