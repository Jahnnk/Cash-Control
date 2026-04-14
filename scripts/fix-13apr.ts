import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function fix() {
  // The bank transaction of 1083.10 on 13/04 breaks down per the image:
  // La Fábrica: Insumos 111 + Delivery 7 = 118
  // Onda orgánica: Insumos 341.7 + Delivery 12 = 353.7
  // Metro: Insumos 338.4 + Delivery 6 = 344.4
  // Dollar City: Limpieza 44 + Delivery 3.5 = 47.5
  // Akemi: Limpieza 213.5 + Delivery 6 = 219.5
  // TOTAL = 1083.1

  const items = [
    { cat: "Insumos", concept: "La Fábrica manjar blanco", amount: 111, order: 10 },
    { cat: "Deliverys", concept: "Delivery La Fábrica", amount: 7, order: 11 },
    { cat: "Insumos", concept: "Compras Onda orgánica", amount: 341.7, order: 12 },
    { cat: "Deliverys", concept: "Delivery Onda orgánica", amount: 12, order: 13 },
    { cat: "Insumos", concept: "Compras Metro", amount: 338.4, order: 14 },
    { cat: "Deliverys", concept: "Delivery Metro", amount: 6, order: 15 },
    { cat: "Limpieza", concept: "Artículos de limpieza DollarCity", amount: 44, order: 16 },
    { cat: "Deliverys", concept: "Delivery DollarCity", amount: 3.5, order: 17 },
    { cat: "Limpieza", concept: "Packaging semanal Akemi", amount: 213.5, order: 18 },
    { cat: "Deliverys", concept: "Delivery Akemi", amount: 6, order: 19 },
  ];

  for (const item of items) {
    await sql`
      INSERT INTO expenses (date, category, concept, payment_method, amount, sort_order)
      VALUES ('2026-04-13', ${item.cat}, ${item.concept}, 'transferencia', ${item.amount}, ${item.order})
    `;
  }

  console.log("Added 10 categorized items for 13/04 (1083.10 breakdown)");

  // Update bank_expense total for 13/04
  const total = await sql`SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE date = '2026-04-13'`;
  await sql`UPDATE daily_records SET bank_expense = ${total[0].t} WHERE date = '2026-04-13'`;
  console.log("Updated 13/04 bank_expense to:", total[0].t);

  // Verify final 13/04
  const all = await sql`SELECT category, concept, amount FROM expenses WHERE date = '2026-04-13' ORDER BY sort_order`;
  console.log("\n13/04 final items:");
  let sum = 0;
  all.forEach(r => { console.log(`  ${Number(r.amount).toFixed(2)} | ${r.category} | ${r.concept}`); sum += Number(r.amount); });
  console.log(`  Total: S/${sum.toFixed(2)}`);
}

fix().catch(console.error);
