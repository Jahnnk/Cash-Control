/**
 * Auditoría abr–set (16-oct-2026, OK de Jahnn): no son ingreso de la operación de su mes.
 *  - Fonavi 08-jun «SOBRANTES EFECTIVO MAR+ABR+MAY» S/6,339.47: ventas de otros meses depositadas en junio.
 *  - Atelier 10-abr «Saldo inicial caja efectivo - regularización histórica» S/300: saldo de arranque.
 * Respaldo local. Uso: [--apply]
 */
import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)![1].trim());
(async () => {
  const f = (await sql`SELECT * FROM bank_income_items WHERE archived=false AND non_operative_category IS NULL AND (
      (business_id=2 AND date='2026-06-08' AND amount=6339.47 AND note ILIKE '%SOBRANTES EFECTIVO%') OR
      (business_id=1 AND date='2026-04-10' AND amount=300 AND note ILIKE '%Saldo inicial caja%'))`) as any[];
  if (f.length !== 2) throw new Error(`Se esperaban 2 filas y hay ${f.length}.`);
  writeFileSync("scripts/audit/respaldos/sobrantes-y-saldo-inicial_2026-10-16.json", JSON.stringify(f, null, 2));
  if (!process.argv.includes("--apply")) return console.log("(simulación) respaldo guardado:", f.map((x) => `${x.business_id} ${x.amount}`).join(", "));
  console.log(JSON.stringify(await sql`UPDATE bank_income_items SET non_operative_category='Otros no operativos' WHERE id = ANY(${f.map((x) => x.id)}::uuid[]) AND non_operative_category IS NULL RETURNING business_id, amount`));
})();
