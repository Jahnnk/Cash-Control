/** Fonavi 30-set-2026: «DEVOLUCIÓN A CLIENTE (JOSUE MANTILLA)» S/31.20 fue por un reclamo (Jahnn, 16-oct) → DEVOLUCIONES A CLIENTES. Uso: [--apply] */
import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)![1].trim());
(async () => {
  const f = (await sql`SELECT * FROM expenses WHERE business_id=2 AND archived=false AND amount=31.2 AND concept ILIKE '%JOSUE MANTILLA%' AND date='2026-09-30' AND category='DEVOLUCIONES'`) as any[];
  if (f.length !== 1) throw new Error(`Se esperaba 1 fila y hay ${f.length}.`);
  writeFileSync("scripts/audit/respaldos/fonavi-josue-reclamo_2026-10-16.json", JSON.stringify(f, null, 2));
  if (!process.argv.includes("--apply")) return console.log("(simulación) respaldo guardado");
  console.log(JSON.stringify(await sql`UPDATE expenses SET category='DEVOLUCIONES A CLIENTES' WHERE id=${f[0].id}::uuid RETURNING category`));
})();
