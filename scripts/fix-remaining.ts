import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function fix() {
  // Delete all remaining Desconocido entries
  const deleted = await sql`DELETE FROM expenses WHERE category = 'Desconocido' RETURNING date, amount`;
  console.log(`Deleted ${deleted.length} Desconocido entries`);

  // 02/04: S/179.00 = 172 + 7
  const apr02 = [
    { cat: "Insumos", concept: "Compras Onda orgánica", amount: 172 },
    { cat: "Deliverys", concept: "Delivery compras Onda orgánica", amount: 7 },
  ];

  // 03/04: S/55.50 = 16.50 + 39
  const apr03 = [
    { cat: "Oficina", concept: "Micas", amount: 16.50 },
    { cat: "Deliverys", concept: "Deliverys del día", amount: 39 },
  ];

  // 06/04: S/890.40 = 730.40 + 85 + 53 + 22
  const apr06 = [
    { cat: "Insumos", concept: "Insumos caja Luis", amount: 730.40 },
    { cat: "Deliverys", concept: "Deliverys caja Luis", amount: 85 },
    { cat: "Limpieza", concept: "Artículos de limpieza", amount: 53 },
    { cat: "Vueltos y Devoluciones", concept: "Vueltos caja Luis", amount: 22 },
  ];

  // 07/04: S/856.70 = 846.70 + 10
  const apr07 = [
    { cat: "Insumos", concept: "Insumos Onda orgánica", amount: 846.70 },
    { cat: "Deliverys", concept: "Delivery compras Onda orgánica", amount: 10 },
  ];

  // 09/04: S/692.46 from image
  const apr09 = [
    { cat: "Limpieza", concept: "Productos de limpieza", amount: 118.70 },
    { cat: "Deliverys", concept: "Delivery limpieza", amount: 8 },
    { cat: "Insumos", concept: "Leche de vaca", amount: 12.50 },
    { cat: "Deliverys", concept: "Delivery leche", amount: 7 },
    { cat: "Insumos", concept: "Insumos Metro", amount: 476.26 },
    { cat: "Deliverys", concept: "Delivery Metro", amount: 10 },
    { cat: "Insumos", concept: "Crema de leche", amount: 54 },
    { cat: "Deliverys", concept: "Delivery crema de leche", amount: 6 },
  ];

  // 10/04: S/677.60 = 531.80 + 61.80 + 50 + 34
  const apr10 = [
    { cat: "Insumos", concept: "Insumos semanales caja Luis", amount: 531.80 },
    { cat: "Limpieza", concept: "Artículos de limpieza", amount: 61.80 },
    { cat: "Deliverys", concept: "Deliverys caja Luis", amount: 50 },
    { cat: "Otros", concept: "Packaging", amount: 34 },
  ];

  const allFixes = [
    { date: "2026-04-02", items: apr02 },
    { date: "2026-04-03", items: apr03 },
    { date: "2026-04-06", items: apr06 },
    { date: "2026-04-07", items: apr07 },
    { date: "2026-04-09", items: apr09 },
    { date: "2026-04-10", items: apr10 },
  ];

  for (const { date, items } of allFixes) {
    const sum = items.reduce((s, i) => s + i.amount, 0);
    console.log(`\n${date}: ${items.length} items = S/${sum.toFixed(2)}`);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await sql`
        INSERT INTO expenses (date, category, concept, payment_method, amount, sort_order)
        VALUES (${date}, ${item.cat}, ${item.concept}, 'transferencia', ${item.amount}, ${50 + i})
      `;
      console.log(`  ${item.amount} | ${item.cat} | ${item.concept}`);
    }
  }

  // Update bank_expense totals for affected dates
  for (const { date } of allFixes) {
    const total = await sql`SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE date = ${date}`;
    await sql`UPDATE daily_records SET bank_expense = ${total[0].t} WHERE date = ${date}`;
  }

  // Final check: any remaining Desconocido?
  const remaining = await sql`SELECT COUNT(*) as c FROM expenses WHERE category = 'Desconocido'`;
  console.log(`\nDesconocido restantes: ${remaining[0].c}`);
}

fix().catch(console.error);
