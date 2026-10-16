/** Atelier 26-jul-2026: «Devolución parcial - Caja chica Luis» S/1,329.12 es devolución de préstamo del socio
 * (is_special_loan) pero estaba en INSUMOS y contaba como costo. Pasa a DEVOLUCIONES, como las demás devoluciones
 * al socio. Auditoría «una sola fuente», OK de Jahnn (16-oct). Respaldo local. Uso: [--apply] */
import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)![1].trim());
(async () => {
  const f = (await sql`SELECT * FROM expenses WHERE business_id=1 AND archived=false AND date='2026-07-26' AND amount=1329.12 AND is_special_loan=true AND category='INSUMOS'`) as any[];
  if (f.length !== 1) throw new Error(`Se esperaba 1 fila y hay ${f.length}.`);
  writeFileSync("scripts/audit/respaldos/devolucion-socio-julio_2026-10-16.json", JSON.stringify(f, null, 2));
  if (!process.argv.includes("--apply")) return console.log("(simulación) respaldo guardado");
  console.log(JSON.stringify(await sql`UPDATE expenses SET category='DEVOLUCIONES', tipo_pe='Excluido' WHERE id=${f[0].id}::uuid RETURNING category`));
})();
