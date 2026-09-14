/* eslint-disable @typescript-eslint/no-explicit-any -- script de auditoría de un solo uso */
/**
 * Reglas del bono desde octubre 2026 en Fonavi y Centro.
 *
 * Decisión de los socios (reunión del 13-sep-2026, confirmada por Jahnn
 * el 14-sep): el bono por ticket se paga solo si se cumplen TODOS los
 * requisitos. Esta fila activa los dos primeros:
 *   1. el nivel de ticket (igual que hoy),
 *   2. las ventas del mes cubren el punto de equilibrio de la sede
 *      (`requiere_equilibrio = true`; meta congelada el primer lunes),
 * y retira el piso de tráfico (`traffic_floor = NULL`): la meta de ventas
 * lo reemplaza y medirlo dos veces castigaba a Fonavi por vender a más
 * personas. El tercer requisito (supervisiones de Juani) llega con su
 * propio módulo.
 *
 * Hereda base, niveles, margen y pozo de la config vigente. Setiembre y
 * los meses anteriores no se tocan.
 *
 *   npx tsx scripts/audit/2026-09-14-reglas-bono-octubre.ts           (simulación)
 *   npx tsx scripts/audit/2026-09-14-reglas-bono-octubre.ts --apply
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const url = process.env.DATABASE_URL ?? fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?([^"'\n]+)/m)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const SEDES = [{ id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }];
const MES = "2026-10";
const APPLY = process.argv.includes("--apply");

async function vigente(bId: number, mes: string) {
  const r = (await sql`
    SELECT effective_month, ticket_base::float AS base, traffic_floor, requiere_equilibrio, levels
    FROM incentive_config WHERE business_id = ${bId} AND effective_month <= ${mes}
    ORDER BY effective_month DESC LIMIT 1`) as any[];
  return r[0];
}

async function main() {
  const antes = await sql`SELECT * FROM incentive_config WHERE business_id IN (2, 3) ORDER BY business_id, effective_month`;
  for (const s of SEDES) {
    const v = await vigente(s.id, MES);
    console.log(`${s.nombre}: hoy octubre usaría la fila ${v.effective_month} — base S/${v.base.toFixed(2)}, piso ${v.traffic_floor}, candado ${v.requiere_equilibrio}`);
  }
  if (!APPLY) { console.log("\nSimulación. No se cambió nada."); return; }

  fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
  const ruta = `scripts/audit/respaldos/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-reglas-bono-octubre.json`;
  fs.writeFileSync(ruta, JSON.stringify({
    motivo: "Reglas del bono desde octubre 2026 (candado de ventas + sin piso de tráfico). Aprobado por Jahnn el 14-sep-2026. Estado ANTES.",
    generado: new Date().toISOString(),
    incentive_config: antes,
  }, null, 2));
  console.log(`\nRespaldo: ${ruta}`);

  for (const s of SEDES) {
    const done = (await sql`
      INSERT INTO incentive_config
        (business_id, effective_month, ticket_base, margin_pct, traffic_floor, pool_pct, levels, min_clients_best_seller, requiere_equilibrio)
      SELECT ${s.id}, ${MES}, ticket_base, margin_pct, NULL, pool_pct, levels, min_clients_best_seller, true
      FROM incentive_config
      WHERE business_id = ${s.id} AND effective_month <= ${MES}
      ORDER BY effective_month DESC LIMIT 1
      ON CONFLICT (business_id, effective_month)
      DO UPDATE SET traffic_floor = NULL, requiere_equilibrio = true
      RETURNING id`) as unknown[];
    if (done.length === 0) { console.error(`✗ ${s.nombre}: no se pudo heredar la config.`); process.exit(1); }
  }

  console.log("\n═══ DESPUÉS ═══");
  for (const s of SEDES) for (const m of ["2026-08", "2026-09", "2026-10", "2026-11"]) {
    const v = await vigente(s.id, m);
    console.log(`  ${s.nombre} ${m}: fila ${v.effective_month} · base S/${v.base.toFixed(2)} · piso ${v.traffic_floor ?? "—"} · meta de ventas ${v.requiere_equilibrio ? "sí" : "no"}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
