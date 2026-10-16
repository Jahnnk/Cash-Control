/** Centro set-2026: la devolución por Indecopi (S/120, hoy en OTROS) pasa a la categoría nueva DEVOLUCIONES A CLIENTES.
 * Respaldo previo: respaldos/centro-indecopi-y-papel_2026-10-16.json. OK de Jahnn (16-oct). Uso: [--apply] */
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)![1].trim());
(async () => {
  const f = await sql`SELECT id, category FROM expenses WHERE business_id=3 AND archived=false AND amount=120 AND concept ILIKE '%INDECOPI%' AND date BETWEEN '2026-09-01' AND '2026-09-30'`;
  if (f.length !== 1) throw new Error(`Se esperaba 1 fila y hay ${f.length}.`);
  if (!process.argv.includes("--apply")) return console.log("(simulación)", JSON.stringify(f));
  console.log(JSON.stringify(await sql`UPDATE expenses SET category='DEVOLUCIONES A CLIENTES' WHERE id=${(f[0] as any).id}::uuid RETURNING category`));
})();
