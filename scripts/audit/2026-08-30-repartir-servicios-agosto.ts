/**
 * Aplica el reparto entre sedes a los servicios de Atelier de agosto 2026.
 *
 * Hasta julio Jahnn marcaba a mano qué gastos se comparten con Fonavi. En
 * agosto dejó de hacerlo —Kelly ya carga todo por Excel— y el sistema tomó
 * los recibos literales: Atelier absorbió S/1,705.25 de luz, agua y gas
 * cuando en julio le correspondían S/1,102 de S/1,631.
 *
 * El reparto sale de las MISMAS reglas que ya usa el import
 * (lib/reparto-compartido.ts). Solo se tocan las filas que emparejan sin
 * ninguna duda; si alguna quedara dudosa, el script se detiene antes de
 * escribir.
 *
 *   npx tsx scripts/audit/2026-08-30-repartir-servicios-agosto.ts
 *   npx tsx scripts/audit/2026-08-30-repartir-servicios-agosto.ts --apply
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import { evaluarRepartos, type ReglaReparto } from "../../src/lib/reparto-compartido";

const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const APPLY = process.argv.includes("--apply");
const ATELIER = 1;
const DESDE = "2026-08-01";
const HASTA = "2026-08-31";
const soles = (n: number) => `S/${n.toFixed(2)}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const reglasRaw = (await sql`
    SELECT s.id::text, c.name AS categoria, s.concept AS concepto, s.split_mode AS modo,
           s.atelier_percentage::float AS ap, s.fonavi_percentage::float AS fp,
           s.centro_percentage::float AS cp, s.atelier_fixed::float AS af,
           s.fonavi_fixed::float AS ff, s.centro_fixed::float AS cf
    FROM shared_expense_rules s JOIN expense_categories c ON c.id = s.category_id
    WHERE s.active = true AND c.business_id = ${ATELIER}
  `) as Record<string, unknown>[];

  const reglas: ReglaReparto[] = reglasRaw.map((r) => ({
    id: String(r.id), categoria: String(r.categoria), concepto: String(r.concepto),
    modo: String(r.modo), atelierPct: Number(r.ap), fonaviPct: Number(r.fp),
    centroPct: Number(r.cp), atelierFijo: r.af as number | null,
    fonaviFijo: r.ff as number | null, centroFijo: r.cf as number | null,
  }));

  // Solo lo que vino del Excel y todavía NO está repartido.
  const filas = (await sql`
    SELECT id::text, date::text AS fecha, amount::float AS monto,
           category AS categoria, COALESCE(concept, '') AS concepto
    FROM expenses
    WHERE business_id = ${ATELIER} AND archived = false AND imported_from_excel = true
      AND is_shared = false AND date BETWEEN ${DESDE} AND ${HASTA}
  `) as { id: string; fecha: string; monto: number; categoria: string; concepto: string }[];

  const evals = evaluarRepartos(
    filas.map((f, i) => ({
      excelRow: i, fecha: f.fecha, monto: Number(f.monto),
      categoria: f.categoria, concepto: f.concepto,
    })),
    reglas,
  );

  const claras = evals.filter((e) => e.confianza === "clara");
  const dudosas = evals.filter((e) => e.confianza === "dudosa");

  console.log("═══ SE REPARTEN ═══\n");
  let totAt = 0, totFo = 0;
  for (const e of claras) {
    const r = e.regla!;
    const at = r.modo === "fixed" ? (r.atelierFijo ?? e.monto) : r2(e.monto * r.atelierPct / 100);
    const fo = r.modo === "fixed" ? (r.fonaviFijo ?? 0) : r2(e.monto - at);
    totAt += at; totFo += fo;
    console.log(
      `  ${e.fecha} ${soles(e.monto).padStart(11)}  ${e.concepto.slice(0, 30).padEnd(32)}` +
        ` → "${r.concepto}" ${r.atelierPct}/${r.fonaviPct}  ·  At ${soles(at)} / Fo ${soles(fo)}`,
    );
  }
  console.log(`\n  Atelier ${soles(r2(totAt))}  ·  Fonavi ${soles(r2(totFo))}`);

  if (dudosas.length > 0) {
    console.error(`\n✗ Hay ${dudosas.length} fila(s) dudosa(s). No se toca nada — resolver primero:`);
    for (const d of dudosas) console.error(`   ${soles(d.monto)} ${d.concepto} · ${d.motivo}`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nSimulación. No se cambió nada.");
    return;
  }

  fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
  const ids = claras.map((e) => filas[e.excelRow].id);
  const previo = await sql`SELECT * FROM expenses WHERE id = ANY(${ids}::uuid[])`;
  const ruta = `scripts/audit/respaldos/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-reparto-servicios-agosto.json`;
  fs.writeFileSync(ruta, JSON.stringify({
    motivo: "Reparto entre sedes de los servicios de Atelier de agosto 2026. Estado ANTES.",
    generado: new Date().toISOString(), filas: previo,
  }, null, 2));
  console.log(`\n  Respaldo: ${ruta}`);

  const totalAntes = (await sql`
    SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
    WHERE business_id = ${ATELIER} AND archived = false AND date BETWEEN ${DESDE} AND ${HASTA}
  `) as { t: number }[];

  for (const e of claras) {
    const r = e.regla!;
    const at = r.modo === "fixed" ? (r.atelierFijo ?? e.monto) : r2(e.monto * r.atelierPct / 100);
    const fo = r.modo === "fixed" ? (r.fonaviFijo ?? 0) : r2(e.monto - at);
    await sql`
      UPDATE expenses
      SET is_shared = true, atelier_amount = ${at}, fonavi_amount = ${fo}, centro_amount = 0
      WHERE id = ${filas[e.excelRow].id}
    `;
  }

  const totalDespues = (await sql`
    SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
    WHERE business_id = ${ATELIER} AND archived = false AND date BETWEEN ${DESDE} AND ${HASTA}
  `) as { t: number }[];

  console.log("\n═══ VERIFICACIÓN ═══\n");
  console.log(`  Gasto registrado antes:   ${soles(totalAntes[0].t)}`);
  console.log(`  Gasto registrado después: ${soles(totalDespues[0].t)}`);
  if (Math.abs(totalAntes[0].t - totalDespues[0].t) > 0.01) {
    console.error("  ✗ El total cambió. Restaurar desde el respaldo.");
    process.exit(1);
  }
  console.log("  ✓ Idéntico — solo cambió a quién le toca cada parte.");
}

main().catch((e) => { console.error(e); process.exit(1); });
