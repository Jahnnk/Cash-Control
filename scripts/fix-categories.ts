import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function fix() {
  // 1. Delete the 1083.10 Desconocido from 13/04 (it's already broken down into individual items)
  const del13 = await sql`
    DELETE FROM expenses WHERE date = '2026-04-13' AND category = 'Desconocido'
    RETURNING id, amount
  `;
  console.log("Deleted Desconocido from 13/04:", del13.map(r => r.amount));

  // Verify: existing items for 13/04 should sum correctly
  const items13 = await sql`SELECT category, concept, amount FROM expenses WHERE date = '2026-04-13' ORDER BY sort_order`;
  console.log("\n13/04 final items:");
  let sum13 = 0;
  items13.forEach(r => { console.log(`  ${r.amount} | ${r.category} | ${r.concept}`); sum13 += Number(r.amount); });
  console.log(`  Total: S/${sum13.toFixed(2)}`);

  // 2. Fix 08/04: all Desconocido entries are "Pago Diners" (Préstamos)
  const fix08 = await sql`
    UPDATE expenses SET category = 'Préstamos', concept = 'Pago préstamo Diners'
    WHERE date = '2026-04-08' AND category = 'Desconocido'
    RETURNING id, amount
  `;
  console.log("\nFixed 08/04 -> Préstamos:");
  fix08.forEach(r => console.log(`  S/${r.amount}`));

  // 3. Show remaining Desconocido items
  const remaining = await sql`
    SELECT date, amount FROM expenses WHERE category = 'Desconocido' ORDER BY date, amount
  `;
  console.log(`\nRemaining Desconocido: ${remaining.length}`);
  remaining.forEach(r => {
    const d = new Date(r.date as string).toISOString().split("T")[0];
    console.log(`  ${d}: S/${Number(r.amount).toFixed(2)}`);
  });
}

fix().catch(console.error);
