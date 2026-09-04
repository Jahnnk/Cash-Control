/**
 * Archiva las filas de SALDO que se colaron como ingreso en Centro.
 *
 * El Excel de Kelly abre cada pestaña con el arrastre del mes anterior
 * (Grupo='SALDO'). El parser solo lo reconocía cuando el concepto decía
 * "Saldo al …"; Kelly escribió "SALDOS DE MESES ANTERIORS" y esa fila
 * entró como VENTA:
 *
 *   Centro  2026-06-30  +S/2,491.87
 *   Centro  2026-07-31  +S/2,491.87
 *
 * S/4,983.74 de ingreso que nunca existió, inflando "Ingresos en
 * cuentas" de junio y julio.
 *
 * El origen ya está tapado (lib/excel-importer.ts descarta cualquier
 * fila con Grupo='SALDO'). Esto limpia lo que entró antes.
 *
 * Se ARCHIVA (archived = true), no se borra: la fila queda en la base
 * para auditoría y el cambio se revierte con un UPDATE si hiciera falta.
 *
 *   npx tsx scripts/audit/2026-09-01-saldos-colados-centro.ts
 *   npx tsx scripts/audit/2026-09-01-saldos-colados-centro.ts --apply
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const APPLY = process.argv.includes("--apply");
const NOMBRE: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };
const soles = (n: number) => `S/${Number(n).toFixed(2)}`;

/**
 * Qué se considera "fila de saldo colada": vino del Excel, la nota trae
 * el marcador de Grupo SALDO que deja el parser, y habla de saldos.
 * Se listan las candidatas y se confirma una por una antes de tocar.
 */
async function candidatas() {
  return (await sql`
    SELECT id::text, business_id, date::text AS fecha, amount::float AS monto,
           COALESCE(note, '') AS nota
    FROM bank_income_items
    WHERE archived = false
      AND imported_from_excel = true
      AND note ILIKE '%(SALDO)%'
      AND (note ILIKE '%SALDO%ANTERIOR%' OR note ~* 'SALDOS?\s*[0-9]{2}/[0-9]{2}/[0-9]{4}')
    ORDER BY business_id, date
  `) as { id: string; business_id: number; fecha: string; monto: number; nota: string }[];
}

async function main() {
  const filas = await candidatas();

  console.log("═══ FILAS DE SALDO QUE ENTRARON COMO INGRESO ═══\n");
  if (filas.length === 0) {
    console.log("  (ninguna — nada que limpiar)");
    return;
  }
  let total = 0;
  for (const f of filas) {
    total += Number(f.monto);
    console.log(`  ${NOMBRE[f.business_id].padEnd(8)} ${f.fecha} +${soles(f.monto).padStart(11)}  ${f.nota.slice(0, 56)}`);
  }
  console.log(`\n  ${filas.length} filas · ${soles(total)} de ingreso que nunca existió`);

  // Efecto en el número que Jahnn le muestra a Kelly.
  console.log("\n═══ 'Ingresos en cuentas' de Centro por mes ═══\n");
  const meses = [...new Set(filas.map((f) => f.fecha.slice(0, 7)))];
  for (const mes of meses) {
    const r = (await sql`
      SELECT COALESCE(SUM(amount), 0)::float AS t FROM bank_income_items
      WHERE business_id = 3 AND archived = false
        AND is_fonavi_reimbursement = false AND is_special_loan = false
        AND is_internal_transfer = false AND non_operative_category IS NULL
        AND to_char(date, 'YYYY-MM') = ${mes}
    `) as { t: number }[];
    const quita = filas
      .filter((f) => f.business_id === 3 && f.fecha.slice(0, 7) === mes)
      .reduce((s, f) => s + Number(f.monto), 0);
    console.log(`  ${mes}   ${soles(r[0].t)}  →  ${soles(r[0].t - quita)}   (−${soles(quita)})`);
  }

  if (!APPLY) {
    console.log("\nSimulación. No se cambió nada.");
    return;
  }

  fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
  const ruta = `scripts/audit/respaldos/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-saldos-colados.json`;
  fs.writeFileSync(ruta, JSON.stringify({
    motivo:
      "Filas de SALDO del Excel que entraron como ingreso. Se archivan (archived=true). " +
      "Para revertir: UPDATE bank_income_items SET archived=false WHERE id IN (…).",
    generado: new Date().toISOString(),
    filas,
  }, null, 2));
  console.log(`\n  Respaldo: ${ruta}`);

  const ids = filas.map((f) => f.id);
  await sql`UPDATE bank_income_items SET archived = true WHERE id = ANY(${ids}::uuid[])`;

  const quedan = await candidatas();
  console.log("\n═══ VERIFICACIÓN ═══\n");
  console.log(`  Filas de saldo activas después: ${quedan.length}`);
  if (quedan.length > 0) {
    console.error("  ✗ Quedaron filas sin archivar.");
    process.exit(1);
  }
  console.log("  ✓ Limpio.");
}

main().catch((e) => { console.error(e); process.exit(1); });
