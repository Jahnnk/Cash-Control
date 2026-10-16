/**
 * Atelier 30-sep-2026: «ALQUILER OCTUBRE 2026 (EXPERIENCIAS GASTRONOMICAS YAYIS SRL)» S/1,000 es la parte
 * de Fonavi del alquiler de octubre, pagada por adelantado: devolución entre sedes, no ingreso de Atelier.
 * Kelly la puso en «OTROS» y el concepto no dice «reembolso», así que el importador la contó como ingreso.
 * Conciliación de septiembre con Jahnn (16-oct-2026), con su OK. Respaldo antes de tocar.
 * Uso: npx tsx scripts/audit/2026-10-16-alquiler-octubre-fonavi-reembolso.ts [--apply]
 */
import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)![1].trim());
const ID = "998f34e1-859c-4272-8621-0557a4af3b7a";
(async () => {
  const filas = await sql`SELECT * FROM bank_income_items WHERE id = ${ID}::uuid`;
  if (filas.length !== 1 || Number((filas[0] as any).amount) !== 1000 || (filas[0] as any).business_id !== 1) throw new Error("La fila no es la esperada.");
  writeFileSync("scripts/audit/respaldos/alquiler_octubre_fonavi_2026-10-16.json", JSON.stringify(filas, null, 2));
  console.log("Respaldo guardado:", JSON.stringify(filas[0]).slice(0, 200));
  if (!process.argv.includes("--apply")) return console.log("(simulación: agrega --apply)");
  const r = await sql`UPDATE bank_income_items SET is_fonavi_reimbursement = true WHERE id = ${ID}::uuid AND is_fonavi_reimbursement = false RETURNING id, is_fonavi_reimbursement`;
  console.log("Actualizado:", JSON.stringify(r));
})();
