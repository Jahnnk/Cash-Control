/**
 * Alinea las reglas de reparto con el Excel oficial de Jahnn
 * ("Lista_de_pagos_y_fechas_Yayis_reparto.xlsx", 31-ago-2026).
 *
 * Ese archivo es la fuente de verdad: tiene el número de cuenta de cada
 * servicio, su fecha de vencimiento y el porcentaje acordado. Varias de
 * las reglas que había en el sistema estaban desactualizadas.
 *
 *   Agua primer piso      67/33 → 65/35
 *   Luz primer piso mono  67/33 → 65/35   (dos nombres, un solo medidor)
 *   Gas                   70/30 → se PARTE en dos medidores:
 *                                 "Gas primer piso"  75/25
 *                                 "Gas segundo piso" 100/0
 *   Internet              40/60 → 50/50
 *   Celular Fonavi           —  → 0/100   (nueva)
 *
 * Ya coincidían y no se tocan: alquiler S/1,800/900, trifásico 70/30,
 * luz segundo piso 75/25, agua segundo piso 100/0.
 *
 * OJO con el gas: al renombrar "Gas" a "Gas primer piso", un concepto
 * suelto como "GAS (QUIAVI)" deja de emparejar y el import lo va a
 * preguntar. Es lo correcto: con dos medidores, "gas" a secas ya no
 * dice de cuál se trata.
 *
 *   npx tsx scripts/audit/2026-08-31-alinear-reglas-con-excel-jahnn.ts
 *   npx tsx scripts/audit/2026-08-31-alinear-reglas-con-excel-jahnn.ts --apply
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

/** concepto actual → { nuevoConcepto?, at, fo } */
const AJUSTES: { actual: string; nuevo?: string; at: number; fo: number }[] = [
  { actual: "Agua 1er piso", at: 65, fo: 35 },
  { actual: "Luz 1er piso", at: 65, fo: 35 },
  // Mismo medidor con otro nombre: se deja al mismo porcentaje para que
  // funcione escriba Kelly "luz 1er piso" o "luz monofásico".
  { actual: "Luz Monofásico", at: 65, fo: 35 },
  { actual: "Gas", nuevo: "Gas primer piso", at: 75, fo: 25 },
  { actual: "Internet", at: 50, fo: 50 },
];

const NUEVAS: { concepto: string; at: number; fo: number }[] = [
  { concepto: "Gas segundo piso", at: 100, fo: 0 },
  { concepto: "Celular Fonavi", at: 0, fo: 100 },
];

async function main() {
  const cat = (await sql`
    SELECT id::text FROM expense_categories
    WHERE business_id = ${ATELIER} AND upper(name) = 'SERVICIOS'
  `) as { id: string }[];
  if (cat.length !== 1) {
    console.error("✗ No encontré la categoría SERVICIOS de Atelier.");
    process.exit(1);
  }

  console.log("═══ REGLAS A CORREGIR ═══\n");
  for (const a of AJUSTES) {
    const r = (await sql`
      SELECT s.id::text, s.concept, s.atelier_percentage::float AS at, s.fonavi_percentage::float AS fo
      FROM shared_expense_rules s JOIN expense_categories c ON c.id = s.category_id
      WHERE c.business_id = ${ATELIER} AND lower(s.concept) = lower(${a.actual})
    `) as { id: string; concept: string; at: number; fo: number }[];
    if (r.length !== 1) {
      console.log(`  ⚠ "${a.actual}" — se esperaba 1 regla y hay ${r.length}. Se salta.`);
      continue;
    }
    const cambioNombre = a.nuevo && a.nuevo !== r[0].concept;
    console.log(
      `  ${r[0].concept.padEnd(22)} ${r[0].at}/${r[0].fo} → ${a.at}/${a.fo}` +
        (cambioNombre ? `   y se renombra a "${a.nuevo}"` : ""),
    );
    if (APPLY) {
      await sql`
        UPDATE shared_expense_rules
        SET concept = ${a.nuevo ?? r[0].concept},
            atelier_percentage = ${a.at}, fonavi_percentage = ${a.fo},
            centro_percentage = 0, updated_at = now()
        WHERE id = ${r[0].id}
      `;
    }
  }

  console.log("\n═══ REGLAS A CREAR ═══\n");
  for (const n of NUEVAS) {
    const ya = (await sql`
      SELECT id::text FROM shared_expense_rules
      WHERE category_id = ${cat[0].id} AND lower(concept) = lower(${n.concepto})
    `) as { id: string }[];
    console.log(`  ${n.concepto.padEnd(22)} ${n.at}/${n.fo}${ya.length ? "   (ya existe)" : ""}`);
    if (APPLY && ya.length === 0) {
      await sql`
        INSERT INTO shared_expense_rules
          (category_id, concept, split_mode, atelier_percentage, fonavi_percentage, centro_percentage, active)
        VALUES (${cat[0].id}, ${n.concepto}, 'percentage', ${n.at}, ${n.fo}, 0, true)
      `;
    }
  }

  if (!APPLY) {
    console.log("\nSimulación. No se cambió nada.");
    return;
  }

  const fin = (await sql`
    SELECT s.concept, s.split_mode AS modo, s.atelier_percentage::float AS at,
           s.fonavi_percentage::float AS fo, s.atelier_fixed::float AS af, s.fonavi_fixed::float AS ff
    FROM shared_expense_rules s JOIN expense_categories c ON c.id = s.category_id
    WHERE c.business_id = ${ATELIER} AND s.active = true AND upper(c.name) = 'SERVICIOS'
    ORDER BY s.concept
  `) as Record<string, unknown>[];
  console.log("\n═══ SERVICIOS · COMO QUEDÓ ═══\n");
  for (const r of fin) {
    console.log(`  ${String(r.concept).padEnd(22)} ${r.modo === "fixed" ? `fijo ${r.af}/${r.ff}` : `${r.at}/${r.fo}`}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
