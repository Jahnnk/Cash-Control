/**
 * Corrección puntual aprobada por Jahnn (25-sep-2026):
 *   1. "SALDO ALQUILER SEP26" (S/300, Atelier): el fijo de S/1,800 se había
 *      aplicado a este segundo pago → Atelier 1,800 y Fonavi −1,500. Correcto:
 *      Atelier 0 y Fonavi 300 (los S/1,800 ya salieron del pago de S/2,400).
 *   2. "PRÉSTAMO PARA 50% ARREGLO ABATIDOR (JUAN TERRONES)" (S/1,500): se marca
 *      como ingreso no operativo "Préstamos / financiamiento recibido".
 * Desde este mismo día el importador hace las dos cosas solo; esto corrige lo
 * que ya estaba cargado. Guarda respaldo antes de tocar.
 *
 * Uso: node scripts/audit/fix-alquiler-prestamo-2026-09-25.mjs [--apply]
 */
import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";

const sql = neon(process.env.DATABASE_URL);
const GASTO = "4a9b8a7b-8a2b-4536-972d-b7b2022b6e9a";
const aplicar = process.argv.includes("--apply");

const gasto = await sql`SELECT * FROM expenses WHERE id = ${GASTO}`;
const ingreso = await sql`SELECT * FROM bank_income_items WHERE business_id = 1 AND date = '2026-09-16' AND amount = 1500
  AND note ILIKE 'PRÉSTAMO PARA 50% ARREGLO ABATIDOR%' AND archived = false`;
if (gasto.length !== 1 || ingreso.length !== 1) throw new Error(`Esperaba 1 y 1 filas, hay ${gasto.length} y ${ingreso.length}`);
console.log("ANTES gasto:", gasto[0].concept, gasto[0].amount, "atelier", gasto[0].atelier_amount, "fonavi", gasto[0].fonavi_amount);
console.log("ANTES ingreso:", ingreso[0].note, ingreso[0].amount, "no operativo:", ingreso[0].non_operative_category);
if (!aplicar) { console.log("(simulación: agrega --apply para corregir)"); process.exit(0); }

writeFileSync("scripts/audit/respaldos/fix_alquiler_prestamo_2026-09-25.json", JSON.stringify({ gasto: gasto[0], ingreso: ingreso[0] }, null, 2));
await sql.transaction([
  sql`UPDATE expenses SET atelier_amount = 0, fonavi_amount = 300 WHERE id = ${GASTO} AND amount = 300`,
  sql`UPDATE bank_income_items SET non_operative_category = 'Préstamos / financiamiento recibido' WHERE id = ${ingreso[0].id}`,
]);
const g2 = await sql`SELECT atelier_amount, fonavi_amount FROM expenses WHERE id = ${GASTO}`;
const i2 = await sql`SELECT non_operative_category FROM bank_income_items WHERE id = ${ingreso[0].id}`;
console.log("DESPUÉS gasto:", g2[0], "ingreso:", i2[0]);
