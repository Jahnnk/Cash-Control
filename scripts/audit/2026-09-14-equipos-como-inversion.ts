/* eslint-disable @typescript-eslint/no-explicit-any -- script de auditoría de un solo uso */
/**
 * EQUIPOS deja de ser gasto fijo: pasa a inversión (fuera del operativo).
 *
 * Decisión de Jahnn (14-sep-2026). Una congeladora de S/8,000 comprada por
 * Fonavi en junio contaba como costo fijo del mes: inflaba su punto de
 * equilibrio de referencia (S/31,523 → S/39,840) y, con el candado de
 * ventas del bono que rige desde octubre, dejaba sin bono al equipo por
 * una compra de meses atrás. El catálogo (lib/catalogo-categorias.ts) ya
 * dice `fuera`; este script alinea las filas de las tres sedes.
 *
 * No toca montos ni movimientos: solo cost_group y exclude_from_ebitda de
 * la categoría. No hay reglas de reparto que apunten a EQUIPOS.
 *
 *   npx tsx scripts/audit/2026-09-14-equipos-como-inversion.ts           (simulación)
 *   npx tsx scripts/audit/2026-09-14-equipos-como-inversion.ts --apply
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const url = process.env.DATABASE_URL ?? fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?([^"'\n]+)/m)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);
const APPLY = process.argv.includes("--apply");
const NOM: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

async function main() {
  const filas = (await sql`
    SELECT id::text, business_id, name, cost_group, exclude_from_ebitda
    FROM expense_categories WHERE upper(name) = 'EQUIPOS' ORDER BY business_id`) as any[];
  const reglas = (await sql`
    SELECT COUNT(*)::int AS n FROM shared_expense_rules sr
    JOIN expense_categories ec ON ec.id = sr.category_id WHERE upper(ec.name) = 'EQUIPOS'`) as { n: number }[];
  const plata = (await sql`
    SELECT business_id, COUNT(*)::int AS n, COALESCE(SUM(amount),0)::float AS t
    FROM expenses WHERE upper(category) = 'EQUIPOS' AND archived = false GROUP BY 1 ORDER BY 1`) as any[];

  console.log("═══ EQUIPOS ANTES ═══");
  for (const f of filas) {
    const p = plata.find((x) => x.business_id === f.business_id);
    console.log(`  ${NOM[f.business_id].padEnd(8)} grupo=${f.cost_group} fuera_ebitda=${f.exclude_from_ebitda} · ${p?.n ?? 0} movimientos, S/${Math.round(p?.t ?? 0).toLocaleString("es-PE")}`);
  }
  console.log(`  reglas de reparto que apuntan a EQUIPOS: ${reglas[0].n}`);
  if (reglas[0].n > 0) { console.error("✗ Hay reglas de reparto: revisar a mano."); process.exit(1); }

  if (!APPLY) { console.log("\nSimulación. No se cambió nada."); return; }

  fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
  const ruta = `scripts/audit/respaldos/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-equipos-como-inversion.json`;
  fs.writeFileSync(ruta, JSON.stringify({
    motivo: "EQUIPOS de fijo a fuera (inversión). Aprobado por Jahnn el 14-sep-2026. Estado ANTES.",
    generado: new Date().toISOString(), expense_categories: filas,
  }, null, 2));
  console.log(`\n  Respaldo: ${ruta}`);

  await sql`UPDATE expense_categories SET cost_group = NULL, exclude_from_ebitda = true WHERE upper(name) = 'EQUIPOS'`;

  const despues = (await sql`SELECT business_id, cost_group, exclude_from_ebitda FROM expense_categories WHERE upper(name) = 'EQUIPOS' ORDER BY 1`) as any[];
  console.log("\n═══ DESPUÉS ═══");
  for (const f of despues) console.log(`  ${NOM[f.business_id].padEnd(8)} grupo=${f.cost_group} fuera_ebitda=${f.exclude_from_ebitda}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
