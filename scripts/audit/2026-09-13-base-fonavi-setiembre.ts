/**
 * Base del ticket de Fonavi desde setiembre 2026: S/24.70 → S/22.11.
 *
 * Decisión de Jahnn (13-sep-2026), tras la auditoría pedida por Chari:
 * Fonavi nunca llegó a su base en julio, agosto ni setiembre. La base se
 * fijó en junio con datos que incluían delivery; con las reglas vigentes
 * (sin delivery ni consumo del personal) su ticket real de julio fue
 * S/22.11. Misma exigencia que Centro (+S/1.50 para Nivel 1), desde su
 * punto de partida real.
 *
 * Rige para setiembre completo (la base es por mes, no por día): con la
 * base anterior los días restantes exigían S/27.83 por cliente (logrado
 * en 4% de los días); con la nueva, S/23.94 (40%).
 *
 * Mismo mecanismo que el botón "Base" del Panel de Sede
 * (`saveIncentiveBase`): hereda niveles, margen, piso y pozo de la config
 * vigente y solo cambia la base. Julio y agosto no se tocan.
 *
 *   npx tsx scripts/audit/2026-09-13-base-fonavi-setiembre.ts           (simulación)
 *   npx tsx scripts/audit/2026-09-13-base-fonavi-setiembre.ts --apply
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const url = process.env.DATABASE_URL ?? fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?([^"'\n]+)/m)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const FONAVI = 2;
const MES = "2026-09";
const BASE_NUEVA = 22.11;
const APPLY = process.argv.includes("--apply");

async function main() {
  const antes = await sql`SELECT * FROM incentive_config WHERE business_id = ${FONAVI} ORDER BY effective_month`;
  console.log("═══ CONFIG DE FONAVI ANTES ═══");
  for (const r of antes as any[]) console.log(`  desde ${r.effective_month}  base S/${Number(r.ticket_base).toFixed(2)}  piso ${r.traffic_floor}  margen ${r.margin_pct}`);

  const vigente = (await sql`
    SELECT ticket_base::float AS b FROM incentive_config
    WHERE business_id = ${FONAVI} AND effective_month <= ${MES} ORDER BY effective_month DESC LIMIT 1`) as { b: number }[];
  console.log(`\n  Base que hoy rige setiembre: S/${vigente[0].b.toFixed(2)}  →  nueva: S/${BASE_NUEVA.toFixed(2)}`);

  const liq = await sql`SELECT 1 FROM incentive_liquidations WHERE business_id = ${FONAVI} AND month = ${MES} LIMIT 1`;
  if ((liq as unknown[]).length > 0) {
    console.error("\n✗ Setiembre ya está liquidado en Fonavi. No se toca nada.");
    process.exit(1);
  }
  console.log("  ✓ Setiembre no está liquidado");

  if (!APPLY) { console.log("\nSimulación. No se cambió nada."); return; }

  fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
  const ruta = `scripts/audit/respaldos/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-base-fonavi-setiembre.json`;
  fs.writeFileSync(ruta, JSON.stringify({
    motivo: "Base de Fonavi setiembre 2026 S/24.70 → S/22.11. Aprobado por Jahnn el 13-sep-2026. Estado ANTES.",
    generado: new Date().toISOString(),
    incentive_config: antes,
  }, null, 2));
  console.log(`\n  Respaldo: ${ruta}`);

  const done = (await sql`
    INSERT INTO incentive_config
      (business_id, effective_month, ticket_base, margin_pct, traffic_floor, pool_pct, levels, min_clients_best_seller)
    SELECT ${FONAVI}, ${MES}, ${BASE_NUEVA},
           margin_pct, traffic_floor, pool_pct, levels, min_clients_best_seller
    FROM incentive_config
    WHERE business_id = ${FONAVI} AND effective_month <= ${MES}
    ORDER BY effective_month DESC LIMIT 1
    ON CONFLICT (business_id, effective_month)
    DO UPDATE SET ticket_base = EXCLUDED.ticket_base
    RETURNING id`) as { id: string }[];
  if (done.length === 0) { console.error("✗ No se pudo heredar la config."); process.exit(1); }

  console.log("\n═══ DESPUÉS ═══");
  for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
    const r = (await sql`
      SELECT effective_month, ticket_base::float AS b, levels FROM incentive_config
      WHERE business_id = ${FONAVI} AND effective_month <= ${m} ORDER BY effective_month DESC LIMIT 1`) as any[];
    const niveles = r[0].levels.map((l: any) => `${l.nombre} S/${(r[0].b + l.delta).toFixed(2)}`).join(" · ");
    console.log(`  ${m}: base S/${r[0].b.toFixed(2)} (fila ${r[0].effective_month}) → ${niveles}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
