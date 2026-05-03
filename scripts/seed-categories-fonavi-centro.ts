/**
 * Ola 9 — Seed inicial de categorías de egresos para Fonavi y Centro.
 *
 * Copia las 18 categorías activas de Atelier (business_id=1) hacia
 * Fonavi (business_id=2) y Centro (business_id=3), preservando:
 *   - name
 *   - is_active
 *   - sort_order
 *   - exclude_from_ebitda
 *
 * NO copia presupuestos por categoría — esos los configura Kelly según
 * la realidad de cada cafetería.
 *
 * Decisión de filtrado: NO se filtró ninguna categoría. Las 18 se
 * copian tal cual a ambos negocios. Razón: aunque algunas categorías
 * (ej: "Fletes") son menos típicas en cafeterías que en Atelier, es
 * más seguro copiar todas y que Kelly desactive las que no use desde
 * /[negocio]/configuracion (toggle Activo/Inactivo) — eso es 1 click
 * por categoría no necesaria, vs el riesgo de borrar algo que sí
 * necesite. El sort_order también se preserva, así Fonavi y Centro
 * quedan idénticos a Atelier en orden visual.
 *
 * Idempotente: si una categoría ya existe en el negocio destino
 * (UNIQUE business_id+name), se hace skip e informa.
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const TARGETS = [
  { id: 2, code: "fonavi" },
  { id: 3, code: "centro" },
];

async function main() {
  console.log("→ Leyendo categorías de Atelier (business_id=1)");
  const sourceCategories = (await sql`
    SELECT name, is_active, sort_order, exclude_from_ebitda
    FROM expense_categories
    WHERE business_id = 1
    ORDER BY sort_order, name
  `) as Array<{ name: string; is_active: boolean; sort_order: number; exclude_from_ebitda: boolean }>;

  console.log(`  · ${sourceCategories.length} categorías encontradas en Atelier.`);

  for (const target of TARGETS) {
    console.log(`\n═══ Sembrando en ${target.code} (business_id=${target.id}) ═══`);
    let created = 0;
    let skipped = 0;
    for (const cat of sourceCategories) {
      const existing = (await sql`
        SELECT 1 FROM expense_categories
        WHERE business_id = ${target.id} AND name = ${cat.name}
      `) as unknown[];
      if (existing.length > 0) {
        console.log(`  · ya existe: ${cat.name}  (skip)`);
        skipped++;
        continue;
      }
      await sql`
        INSERT INTO expense_categories
          (business_id, name, is_active, sort_order, exclude_from_ebitda)
        VALUES
          (${target.id}, ${cat.name}, ${cat.is_active}, ${cat.sort_order}, ${cat.exclude_from_ebitda})
      `;
      console.log(`  → creada: ${cat.name}`);
      created++;
    }
    console.log(`  Resumen ${target.code}: ${created} creadas, ${skipped} ya existían.`);
  }

  // Verificación final
  console.log("\n═══ Verificación final ═══");
  for (const target of [{ id: 1, code: "atelier" }, ...TARGETS]) {
    const r = (await sql`
      SELECT COUNT(*)::int AS n FROM expense_categories WHERE business_id = ${target.id}
    `) as Array<{ n: number }>;
    console.log(`  ${target.code.padEnd(8)} (business_id=${target.id}): ${r[0].n} categorías`);
  }

  console.log("\n✅ Seed completado. Atelier intacto.");
}

main().catch((e) => { console.error("\n❌ ERROR:", e.message); process.exit(1); });
