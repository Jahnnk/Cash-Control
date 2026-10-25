/**
 * Fonavi 09-set «MNTO REFRIGERADORA» S/100 → MANTENIMIENTO (25-oct-2026, OK de Jahnn).
 *
 * En la auditoría del 16-oct se pasó a DEVOLUCIONES porque Atelier devolvió los S/100 el 30/09 y registró el gasto
 * real. Jahnn (25-oct): fue una REPARACIÓN y el egreso debe verse en su categoría real; la devolución de Atelier
 * resta de MANTENIMIENTO (lib/recuperos-entre-sedes.ts, «gasto mal ejecutado que sí está como gasto»). El costo de
 * Fonavi no cambia (+100 − 100); cambia dónde se ve el egreso.
 *
 * Una sola fila. Respaldo local antes de tocarla. Uso: npx tsx scripts/audit/2026-10-25-fonavi-refrigeradora-mantenimiento.ts [--apply]
 */
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { writeFileSync, mkdirSync } from "fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const filas = (await sql`
    SELECT * FROM expenses
    WHERE archived = false AND business_id = 2 AND date = '2026-09-09' AND amount = 100 AND concept ILIKE 'MNTO REFRIGERADORA%'
  `) as Record<string, unknown>[];
  if (filas.length !== 1) throw new Error(`Se esperaba 1 fila y hay ${filas.length}.`);
  console.log("Fila:", filas.map((f) => `${f.id} · ${f.category} · tipo_pe=${f.tipo_pe} · ${f.concept}`).join("\n"));
  mkdirSync("scripts/audit/respaldos", { recursive: true });
  writeFileSync("scripts/audit/respaldos/fonavi-refrigeradora_2026-10-25.json", JSON.stringify(filas, null, 1));
  if (!process.argv.includes("--apply")) return console.log("(simulación: no se cambió nada)");
  const r = await sql`
    UPDATE expenses SET category = 'MANTENIMIENTO', tipo_pe = 'Fijo'
    WHERE id = ${filas[0].id as string} AND category = 'DEVOLUCIONES'
    RETURNING id, category, tipo_pe
  `;
  console.log("Actualizada:", JSON.stringify(r));
})();
