/**
 * Migración Ola 4 — DROP TABLE sales, collections
 *
 * Tablas legacy importadas inicialmente desde data histórica. La UI
 * nueva NUNCA las escribe. Solo las leía /clientes/[id] (también
 * eliminado en esta misma ola). Ambas tablas tienen 9 registros
 * (mismo lote de import del 10-abr-2026), todos asignados a un
 * cliente desactivado 'Ventas Byte (General)'.
 *
 * Backup completo pre-cambio en backups/backup-antes-ola-4-*.sql
 * incluye todos los registros.
 *
 * Nota: collections tiene FK a sales (sale_id), por eso primero
 * dropeamos collections, luego sales.
 *
 * Uso: npx tsx scripts/migrations/drop-sales-collections.ts
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL no está definida");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function dropTable(name: string) {
  const exists = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${name}
  `;
  if (exists.length === 0) {
    console.log(`Tabla ${name} ya no existe.`);
    return;
  }
  const count = await sql.query(`SELECT COUNT(*) as n FROM "${name}"`);
  console.log(`Tabla ${name}: ${(count[0] as { n: string }).n} registros antes del DROP.`);
  await sql.query(`DROP TABLE "${name}" CASCADE`);

  const after = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${name}
  `;
  if (after.length === 0) {
    console.log(`✅ ${name} eliminada.`);
  } else {
    console.error(`❌ ${name} sigue existiendo.`);
    process.exit(1);
  }
}

async function main() {
  console.log("Backup pre-cambio: backups/backup-antes-ola-4-*.sql\n");
  await dropTable("collections"); // FK a sales → primero
  await dropTable("sales");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
