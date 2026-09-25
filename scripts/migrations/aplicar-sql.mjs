// Aplica un .sql de scripts/migrations sentencia por sentencia, guardando
// antes un respaldo JSON de la tabla indicada. Uso:
//   node scripts/migrations/aplicar-sql.mjs <archivo.sql> <tabla-a-respaldar>
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync } from "node:fs";
const [archivo, tabla] = process.argv.slice(2);
const sql = neon(process.env.DATABASE_URL);
if (tabla) {
  const filas = await sql.query(`SELECT * FROM ${tabla}`);
  const destino = `scripts/audit/respaldos/${tabla}_${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(destino, JSON.stringify(filas, null, 1));
  console.log(`respaldo: ${destino} (${filas.length} filas)`);
}
const sentencias = readFileSync(archivo, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);
for (const s of sentencias) { await sql.query(s); console.log("OK:", s.slice(0, 90)); }
