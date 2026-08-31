/**
 * Marca los ingresos que en realidad son plata que vuelve de otra sede.
 *
 * Atelier paga la luz, el agua, el gas y el alquiler del local que
 * comparte con Fonavi y después le cobra su parte. Cuando esa plata
 * vuelve, entra al banco como cualquier ingreso — pero no es una venta.
 * Sin la marca `is_fonavi_reimbursement`, el reporte "Ingresos en
 * cuentas" de Atelier queda inflado, que es justo el número que Jahnn le
 * muestra a Kelly cada semana.
 *
 * Quién devuelve lo decide la EMPRESA, no el motivo: ver
 * lib/reembolsos-entre-sedes.ts. Las devoluciones de proveedores (Onda,
 * Aromas, Ronald Chilón) NO se tocan — tampoco son ventas, pero son otra
 * cosa y esconderlas bajo una etiqueta que significa "entre sedes" sería
 * mentir sobre lo que son.
 *
 * El origen ya está tapado: el import marca las nuevas al entrar. Esto
 * limpia lo que se acumuló antes.
 *
 *   npx tsx scripts/audit/2026-08-31-marcar-reembolsos-entre-sedes.ts
 *   npx tsx scripts/audit/2026-08-31-marcar-reembolsos-entre-sedes.ts --apply
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import { evaluarReembolso } from "../../src/lib/reembolsos-entre-sedes";

const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const APPLY = process.argv.includes("--apply");
const soles = (n: number) => `S/${n.toFixed(2)}`;
const NOMBRE: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

async function main() {
  const filas = (await sql`
    SELECT id::text, business_id, date::text AS fecha, amount::float AS monto,
           COALESCE(note, '') AS nota, is_fonavi_reimbursement AS marcado
    FROM bank_income_items
    WHERE archived = false AND is_fonavi_reimbursement = false
    ORDER BY business_id, date
  `) as { id: string; business_id: number; fecha: string; monto: number; nota: string; marcado: boolean }[];

  const grupo = filas.map((f) => ({ ...f, ev: evaluarReembolso(f.nota) }))
    .filter((f) => f.ev.origen === "grupo");
  const terceros = filas.map((f) => ({ ...f, ev: evaluarReembolso(f.nota) }))
    .filter((f) => f.ev.origen === "tercero");

  console.log("═══ SE MARCAN — plata que vuelve de otra sede ═══\n");
  let total = 0;
  for (const f of grupo) {
    total += Number(f.monto);
    console.log(
      `  ${NOMBRE[f.business_id].padEnd(8)} ${f.fecha} ${soles(f.monto).padStart(11)}  ${f.nota.slice(0, 56)}`,
    );
  }
  console.log(`\n  ${grupo.length} movimientos · ${soles(total)}`);

  console.log("\n═══ NO SE TOCAN — devoluciones de proveedores ═══\n");
  let totalT = 0;
  for (const f of terceros) {
    totalT += Number(f.monto);
    console.log(`  ${NOMBRE[f.business_id].padEnd(8)} ${f.fecha} ${soles(f.monto).padStart(11)}  ${f.nota.slice(0, 56)}`);
  }
  console.log(`\n  ${terceros.length} movimientos · ${soles(totalT)} — tampoco son ventas, pero son otra cosa.`);

  if (!APPLY) {
    console.log("\nSimulación. No se cambió nada.");
    return;
  }

  fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
  const ruta = `scripts/audit/respaldos/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-reembolsos-entre-sedes.json`;
  fs.writeFileSync(ruta, JSON.stringify({
    motivo: "Ingresos marcados como reembolso entre sedes (no son ventas). Estado ANTES.",
    generado: new Date().toISOString(),
    filas: grupo.map((f) => ({ id: f.id, sede: NOMBRE[f.business_id], fecha: f.fecha, monto: f.monto, nota: f.nota })),
  }, null, 2));
  console.log(`\n  Respaldo: ${ruta}`);

  for (const f of grupo) {
    await sql`UPDATE bank_income_items SET is_fonavi_reimbursement = true WHERE id = ${f.id}`;
  }

  const quedan = (await sql`
    SELECT business_id, COALESCE(SUM(amount), 0)::float AS t
    FROM bank_income_items WHERE archived = false AND is_fonavi_reimbursement = true
    GROUP BY business_id ORDER BY business_id
  `) as { business_id: number; t: number }[];
  console.log("\n═══ VERIFICACIÓN ═══\n");
  for (const q of quedan) {
    console.log(`  ${NOMBRE[q.business_id].padEnd(8)} marcado como reembolso entre sedes: ${soles(q.t)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
