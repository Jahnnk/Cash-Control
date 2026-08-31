/**
 * Crea y ajusta las reglas de reparto que faltaban para que el Excel de
 * Kelly se reparta solo entre Atelier y Fonavi.
 *
 * Decidido por Jahnn el 30-ago-2026, sobre los servicios que llegaron en
 * el Excel de agosto y que ninguna regla existente sabía resolver:
 *
 *   · "LUZ 1ER PISO"  → es el monofásico de siempre.   67/33
 *   · "AGUA 2DO PISO" → consumo solo de Atelier.       100/0
 *   · "TRUFASICO"     → el trifásico.                   70/30  ← CAMBIA
 *
 * El trifásico estaba guardado al 100% Atelier. Jahnn lo corrigió a
 * 70/30, así que la regla existente se ACTUALIZA, no se duplica: dos
 * reglas para el mismo concepto harían que el emparejador vea un empate
 * y deje de repartir solo.
 *
 * "Agua 2do piso" al 100% Atelier se crea igual, aunque no reparta nada.
 * Una regla explícita dice "esto ya está decidido" y evita que el import
 * lo pregunte todos los meses.
 *
 *   npx tsx scripts/audit/2026-08-30-reglas-reparto-nuevas.ts
 *   npx tsx scripts/audit/2026-08-30-reglas-reparto-nuevas.ts --apply
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const APPLY = process.argv.includes("--apply");
const ATELIER = 1;

/** concepto → [% Atelier, % Fonavi] */
const NUEVAS: { categoria: string; concepto: string; at: number; fo: number }[] = [
  { categoria: "SERVICIOS", concepto: "Luz 1er piso", at: 67, fo: 33 },
  { categoria: "SERVICIOS", concepto: "Agua 2do piso", at: 100, fo: 0 },
];

const AJUSTES: { concepto: string; at: number; fo: number }[] = [
  { concepto: "Luz Trifásico", at: 70, fo: 30 },
];

async function main() {
  const cats = (await sql`
    SELECT id::text, name FROM expense_categories WHERE business_id = ${ATELIER}
  `) as { id: string; name: string }[];

  console.log("═══ REGLAS A CREAR ═══\n");
  for (const n of NUEVAS) {
    const cat = cats.find((c) => c.name.toUpperCase() === n.categoria.toUpperCase());
    if (!cat) {
      console.error(`  ✗ No existe la categoría ${n.categoria} en Atelier.`);
      process.exit(1);
    }
    const ya = (await sql`
      SELECT id::text FROM shared_expense_rules
      WHERE category_id = ${cat.id} AND lower(concept) = lower(${n.concepto})
    `) as { id: string }[];
    console.log(
      `  ${n.concepto.padEnd(18)} ${n.categoria.padEnd(12)} ${n.at}/${n.fo}` +
        (ya.length ? "   (ya existe — no se duplica)" : ""),
    );
    if (APPLY && ya.length === 0) {
      await sql`
        INSERT INTO shared_expense_rules
          (category_id, concept, split_mode, atelier_percentage, fonavi_percentage, centro_percentage, active)
        VALUES (${cat.id}, ${n.concepto}, 'percentage', ${n.at}, ${n.fo}, 0, true)
      `;
    }
  }

  console.log("\n═══ REGLAS A CAMBIAR ═══\n");
  for (const a of AJUSTES) {
    const actual = (await sql`
      SELECT s.id::text, s.atelier_percentage::float AS at, s.fonavi_percentage::float AS fo
      FROM shared_expense_rules s
      JOIN expense_categories c ON c.id = s.category_id
      WHERE c.business_id = ${ATELIER} AND lower(s.concept) = lower(${a.concepto})
    `) as { id: string; at: number; fo: number }[];
    if (actual.length !== 1) {
      console.error(`  ✗ Se esperaba 1 regla "${a.concepto}" y hay ${actual.length}. No se toca.`);
      process.exit(1);
    }
    console.log(`  ${a.concepto.padEnd(18)} ${actual[0].at}/${actual[0].fo} → ${a.at}/${a.fo}`);
    if (APPLY) {
      await sql`
        UPDATE shared_expense_rules
        SET atelier_percentage = ${a.at}, fonavi_percentage = ${a.fo}, updated_at = now()
        WHERE id = ${actual[0].id}
      `;
    }
  }

  if (!APPLY) {
    console.log("\nSimulación. No se cambió nada.");
    return;
  }

  const total = (await sql`
    SELECT count(*)::int AS n FROM shared_expense_rules s
    JOIN expense_categories c ON c.id = s.category_id
    WHERE c.business_id = ${ATELIER} AND s.active = true
  `) as { n: number }[];
  console.log(`\n✓ Aplicado. Reglas activas de Atelier: ${total[0].n}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
