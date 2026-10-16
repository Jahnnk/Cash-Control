/** Smoke read-only: la explicación de bonos con datos REALES de octubre. Uso: npx tsx scripts/_smoke-explicacion-bono.ts [YYYY-MM] */
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { equipoDelBono } from "../src/lib/incentives/equipo-del-bono";
import { resolverHorasDelMes } from "../src/lib/incentives/horas-trabajadas";
import { computeProgress } from "../src/lib/incentives/engine";
import { explicarBono } from "../src/lib/incentives/explicacion-bono";

const env = readFileSync(".env.local", "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.*)$/m)![1].trim());
const month = process.argv[2] ?? "2026-10";

(async () => {
  for (const [bId, nombre] of [[2, "Fonavi"], [3, "Centro"]] as [number, string][]) {
    const cfg = (await sql`SELECT ticket_base::float AS base, margin_pct::float AS margin, traffic_floor, pool_pct::float AS pool, levels, requiere_equilibrio FROM incentive_config WHERE business_id = ${bId} AND effective_month <= ${month} ORDER BY effective_month DESC LIMIT 1`) as any[];
    const config = { ticketBase: cfg[0].base, marginPct: cfg[0].margin, trafficFloor: cfg[0].traffic_floor, poolPct: cfg[0].pool, levels: cfg[0].levels, requiereEquilibrio: false };
    const equipo = await equipoDelBono(sql as never, bId, month);
    const horas = new Map((equipo.deLaPlanilla ?? []).map((p) => [p.dni, p.horas]));
    const r = resolverHorasDelMes(equipo.staff.map((x) => ({ ...x, active: true })), horas);
    const staff = r.staff.map((x) => ({ name: x.name, jornada: x.jornada, area: x.area, horasSemanales: x.horasSemanales, horasMesTrabajadas: x.horasMesTrabajadas, horasMes: x.horasMesTrabajadas, active: true }));
    const dailies = (await sql`SELECT date::text, personas, revenue::float AS revenue, items FROM upselling_daily WHERE business_id = ${bId} AND date BETWEEN ${month + "-01"} AND ${month + "-31"} ORDER BY date`) as any[];
    const p = computeProgress(config as never, staff as never, dailies, 31, null);
    const x = explicarBono({ staff: staff as never, levels: config.levels, porNivel: p.porNivel, excluidos: equipo.excluidos.map((e) => ({ nombre: e.name, motivo: e.motivo })), usaTrabajadas: r.usaTrabajadas });
    console.log(`\n=== ${nombre} ${month} · horas ${x.horasDe} ===`);
    x.niveles.forEach((n, k) => {
      const suma = x.personas.reduce((t, q) => t + q.montos[k], 0) + n.premioMv;
      const motor = p.porNivel.find((o) => o.level.nombre === n.nombre)!.sumaBonos;
      console.log(`${n.nombre}: total ${n.total} (motor ${motor}, suma de filas ${suma.toFixed(2)}) · personas ${n.sumaPersonas} + premio ${n.premioMv} · hora S/${n.tarifaHora} · pozo ${n.pozo} colchón ${n.colchon}`);
    });
    console.log(x.personas.map((q) => `${q.nombre} ${q.esAdmin ? "fijo" : q.horas + "h"} → ${q.montos.join("/")}`).join("\n"));
    console.log("Excluidos:", x.excluidos.map((e) => `${e.nombre} (${e.motivo})`).join("; ") || "ninguno");
  }
})();
