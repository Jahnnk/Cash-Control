/**
 * Conciliación de setiembre con Jahnn (16-oct-2026), con su OK. Centro:
 *  - «DEVOLUCION A CLIENTAS POR INDECOPI» S/120: venta que entró y se devolvió por una queja → OTROS (sí resta).
 *  - «PAPEL PARA IMPRESORA» S/81: insumo de oficina, no equipo → OFICINA Y SISTEMAS.
 * Lo definitivo es que Kelly lo escriba en «Corregir (opcional)» de su Excel (si re-sube setiembre, esto se pisa).
 * Uso: npx tsx scripts/audit/2026-10-16-centro-indecopi-y-papel.ts [--apply]
 */
import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)![1].trim());
(async () => {
  const filas = (await sql`SELECT * FROM expenses WHERE business_id=3 AND archived=false AND date BETWEEN '2026-09-01' AND '2026-09-30'
    AND ((category='DEVOLUCIONES' AND amount=120 AND concept ILIKE '%INDECOPI%') OR (category='EQUIPOS' AND amount=81 AND concept ILIKE '%PAPEL%'))`) as any[];
  if (filas.length !== 2) throw new Error(`Se esperaban 2 filas y hay ${filas.length}.`);
  writeFileSync("scripts/audit/respaldos/centro-indecopi-y-papel_2026-10-16.json", JSON.stringify(filas, null, 2));
  console.log("Respaldo:", filas.map((f) => `${f.category} ${f.amount} ${f.concept}`).join(" · "));
  if (!process.argv.includes("--apply")) return console.log("(simulación: agrega --apply)");
  const a = await sql`UPDATE expenses SET category='OTROS' WHERE id = ${filas.find((f) => f.category === "DEVOLUCIONES").id}::uuid AND category='DEVOLUCIONES' RETURNING category`;
  const b = await sql`UPDATE expenses SET category='OFICINA Y SISTEMAS' WHERE id = ${filas.find((f) => f.category === "EQUIPOS").id}::uuid AND category='EQUIPOS' RETURNING category`;
  console.log("Actualizado:", JSON.stringify([...a, ...b]));
})();
