/**
 * Conciliación de setiembre con Jahnn (16-oct-2026), con su OK:
 *  A. 5 devoluciones de Centro (SERVICIOS/SERVCIOS GASTRONOMICOS) contadas como ingreso → reembolso entre sedes
 *     (sueldo y AFP de Luana a Fonavi ago–set; aceite y panela a Atelier ago). Total S/765.96.
 *  B. La parte de Fonavi del alquiler del local subió de S/900 a S/1,000 desde octubre: regla ALQUILER
 *     1,800/900 → 1,700/1,000 y el alquiler de Atelier de octubre (2,700) repartido igual.
 * Respaldo local antes de tocar. Uso: npx tsx scripts/audit/2026-10-16-reembolsos-centro-y-alquiler-fonavi.ts [--apply]
 */
import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { esReembolsoEntreSedes } from "../../src/lib/reembolsos-entre-sedes";
const sql = neon(readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)![1].trim());
const REGLA = "1aacf9e6-c481-4811-ae20-e6ea18b494b3";
const ALQUILER_OCT = "15664363-5fe9-4144-8657-7a4a2fcb0402";
(async () => {
  const cand = (await sql`SELECT * FROM bank_income_items WHERE archived=false AND NOT is_fonavi_reimbursement AND NOT is_internal_transfer AND date >= '2026-01-01'`) as any[];
  const reemb = cand.filter((x) => esReembolsoEntreSedes(x.note));
  const total = Math.round(reemb.reduce((t, x) => t + Number(x.amount), 0) * 100) / 100;
  if (reemb.length !== 5 || total !== 765.96) throw new Error(`Se esperaban 5 filas por S/765.96 y hay ${reemb.length} por S/${total}.`);
  const regla = await sql`SELECT * FROM shared_expense_rules WHERE id = ${REGLA}::uuid`;
  const alq = await sql`SELECT * FROM expenses WHERE id = ${ALQUILER_OCT}::uuid`;
  if (Number((alq[0] as any).amount) !== 2700 || Number((alq[0] as any).atelier_amount) !== 1800) throw new Error("El alquiler de octubre no es el esperado.");
  writeFileSync("scripts/audit/respaldos/reembolsos-centro-y-alquiler-fonavi_2026-10-16.json", JSON.stringify({ reembolsos: reemb, regla, alquilerOctubre: alq }, null, 2));
  console.log(`Respaldo: ${reemb.length} reembolsos (S/${total}), regla y alquiler de octubre.`);
  if (!process.argv.includes("--apply")) return console.log("(simulación: agrega --apply)");
  const ids = reemb.map((x) => x.id);
  const a = await sql`UPDATE bank_income_items SET is_fonavi_reimbursement = true WHERE id = ANY(${ids}::uuid[]) AND is_fonavi_reimbursement = false RETURNING id`;
  const b1 = await sql`UPDATE shared_expense_rules SET atelier_fixed = 1700, fonavi_fixed = 1000, atelier_percentage = 62.96, fonavi_percentage = 37.04, updated_at = now() WHERE id = ${REGLA}::uuid RETURNING atelier_fixed, fonavi_fixed, updated_at`;
  const b2 = await sql`UPDATE expenses SET atelier_amount = 1700, fonavi_amount = 1000 WHERE id = ${ALQUILER_OCT}::uuid AND atelier_amount = 1800 RETURNING atelier_amount, fonavi_amount`;
  console.log("A:", a.length, "filas · B regla:", JSON.stringify(b1), "· B alquiler oct:", JSON.stringify(b2));
})();
