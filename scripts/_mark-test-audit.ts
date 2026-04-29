// Marca las 4 entradas de audit_log generadas durante las pruebas con un user_note.
// 100% no destructivo: solo SET user_note WHERE user_note IS NULL.
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const TEST_RECORD_ID = "0eb43ab3-7255-4d71-a1ac-2acbd5ec631c"; // ITF 23-abr
const NOTE = "[prueba de implementación 2026-04-29]";

async function main() {
  // Pre-conteo para sanity check
  const before = (await sql`
    SELECT COUNT(*)::int as n FROM audit_log
    WHERE record_id = ${TEST_RECORD_ID} AND user_note IS NULL
  `) as { n: number }[];
  console.log(`Filas candidatas (record_id ITF + user_note NULL): ${before[0].n}`);

  if (before[0].n === 0) {
    console.log("Nada que marcar.");
    return;
  }

  if (before[0].n > 5) {
    console.error(`ABORT: ${before[0].n} filas es más de lo esperado (máx 5). Revisa antes.`);
    process.exit(1);
  }

  const updated = (await sql`
    UPDATE audit_log
    SET user_note = ${NOTE}
    WHERE record_id = ${TEST_RECORD_ID} AND user_note IS NULL
    RETURNING id, action, user_note, timestamp
  `) as { id: string; action: string; user_note: string; timestamp: string }[];

  console.log(`\n✅ ${updated.length} filas actualizadas:\n`);
  for (const [i, r] of updated.entries()) {
    console.log(`  [${i + 1}] id=${r.id}`);
    console.log(`      action=${r.action}`);
    console.log(`      timestamp=${r.timestamp}`);
    console.log(`      user_note="${r.user_note}"`);
  }

  // Verificación final
  const remaining = (await sql`
    SELECT COUNT(*)::int as n FROM audit_log
    WHERE record_id = ${TEST_RECORD_ID} AND user_note IS NULL
  `) as { n: number }[];
  const total = (await sql`SELECT COUNT(*)::int as n FROM audit_log`) as { n: number }[];
  console.log(`\nFilas restantes sin marcar para este record_id: ${remaining[0].n} (debe ser 0)`);
  console.log(`Total general en audit_log: ${total[0].n}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
