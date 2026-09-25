/**
 * Reclasifica como ingreso NO operativo los préstamos de agosto-2026 que se
 * cargaron como venta (aprobado por Jahnn el 25-sep-2026). Usa la misma
 * regla que el importador desde el PR #145 (categoriaPrestamoIngreso).
 * Siguen contando en el saldo del banco. Guarda respaldo antes de tocar.
 *
 * Uso: npx tsx scripts/audit/prestamos-agosto-2026-09-25.ts [--apply]
 */
import { writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { categoriaPrestamoIngreso } from "../../src/lib/prestamo-ingreso";

const sql = neon(process.env.DATABASE_URL!);
const aplicar = process.argv.includes("--apply");

async function main() {
  const filas = (await sql`
    SELECT * FROM bank_income_items
    WHERE archived = false AND date BETWEEN '2026-08-01' AND '2026-08-31'
      AND non_operative_category IS NULL AND is_special_loan = false AND is_fonavi_reimbursement = false
      AND note ILIKE '%PR_STAMO%'
    ORDER BY date`) as Record<string, unknown>[];
  const cambios = filas.map((f) => ({ f, cat: categoriaPrestamoIngreso(String(f.note)) })).filter((x) => x.cat);
  for (const { f, cat } of cambios) console.log(`sede ${f.business_id} · ${String(f.date).slice(0, 10)} · S/${f.amount} · ${String(f.note).slice(0, 70)} → ${cat}`);
  if (!aplicar) { console.log(`(simulación: ${cambios.length} filas; agrega --apply)`); return; }
  writeFileSync("scripts/audit/respaldos/prestamos_agosto_2026-09-25.json", JSON.stringify(cambios.map((x) => x.f), null, 1));
  await sql.transaction(cambios.map(({ f, cat }) => sql`UPDATE bank_income_items SET non_operative_category = ${cat} WHERE id = ${f.id as string} AND non_operative_category IS NULL`));
  console.log(`listo: ${cambios.length} filas`);
}
void main();
