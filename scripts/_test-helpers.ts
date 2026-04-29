// Helpers para verificar estado de BD durante pruebas manuales (lectura solo).
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const cmd = process.argv[2];

  if (cmd === "find-itf") {
    const rows = await sql`
      SELECT id, date, amount, category, concept, payment_method
      FROM expenses
      WHERE concept ILIKE '%ITF%' OR concept ILIKE '%itf%'
      ORDER BY date DESC, amount ASC
      LIMIT 5
    `;
    console.log(JSON.stringify(rows, null, 2));
  } else if (cmd === "expense") {
    const id = process.argv[3];
    const rows = await sql`SELECT * FROM expenses WHERE id = ${id}`;
    console.log(JSON.stringify(rows[0], null, 2));
  } else if (cmd === "daily") {
    const date = process.argv[3];
    const rows = await sql`SELECT date, bank_income, bank_expense, bank_balance_real FROM daily_records WHERE date = ${date}`;
    console.log(JSON.stringify(rows[0], null, 2));
  } else if (cmd === "audit") {
    const id = process.argv[3];
    const rows = await sql`SELECT id, timestamp, action, record_type, before_data, after_data FROM audit_log WHERE record_id = ${id} ORDER BY timestamp DESC LIMIT 5`;
    console.log(JSON.stringify(rows, null, 2));
  } else if (cmd === "audit-count") {
    const rows = await sql`SELECT COUNT(*)::int as n FROM audit_log`;
    console.log("audit_log count:", rows[0].n);
  } else if (cmd === "find-income") {
    const rows = await sql`
      SELECT bi.id, bi.date, bi.amount, bi.note, c.name as client_name
      FROM bank_income_items bi
      LEFT JOIN clients c ON c.id = bi.client_id
      ORDER BY bi.date DESC, bi.amount ASC LIMIT 5
    `;
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log("Comandos: find-itf | expense <id> | daily <date> | audit <id> | audit-count | find-income");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
