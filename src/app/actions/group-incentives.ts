"use server";

/**
 * Bonos e Incentivos · vista CENTRAL del programa (Grupo, solo dirección).
 *
 * El pedido de Jahnn (jul-2026): una imagen clara y objetiva del avance
 * para COMPARTIRLA con los administradores y el equipo — "no queremos
 * que piensen que les ocultamos información o que no les queremos pagar".
 * La transparencia es el motor del programa.
 *
 * Reglas de la casa aplicadas:
 *  - MISMO cerebro que el Panel de Sede (computeProgress) y que el mejor
 *    vendedor por turno (computeMejorVendedor): esta pantalla jamás puede
 *    contradecir lo que ve un admin en su panel.
 *  - Sede EXPLÍCITA en todas las consultas (lección /grupo: la cookie de
 *    sede aquí dice "grupo" — nada de activeBusinessId()).
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import {
  computeProgress,
  type IncentiveConfigT,
  type IncentiveProgress,
  type StaffMember,
  type DailyEntry,
} from "@/lib/incentives/engine";
import { computeMejorVendedor, type MejorVendedorResult } from "@/lib/mejor-vendedor";

const sql = neon(process.env.DATABASE_URL!);

const MIN_MESAS = 15; // mismo umbral que el Panel de Sede

type LevelRow = { nombre: string; delta: number; bono_tc: number; bono_mt: number; bono_admin: number; premio_mv: number };
type Turno = "mañana" | "tarde" | "completo";

export type SedeIncentives = {
  businessId: number;
  sede: string;
  /** null = la sede aún no tiene configuración del programa. */
  progress: IncentiveProgress | null;
  ticketBase: number | null;
  /** Mejor vendedor por turno (el del desayuno) — null sin reporte. */
  mejorVendedor: MejorVendedorResult | null;
  /** Fin del periodo del reporte de trabajadores (frescura del ranking). */
  mvPeriodEnd: string | null;
  /** Último día con registro diario — para saber si el avance está al día. */
  ultimoRegistro: string | null;
  /** El mes ya tiene acta de liquidación (resultado congelado). */
  liquidado: boolean;
};

export type GroupIncentives = {
  month: string;
  sedes: SedeIncentives[];
};

export async function getGroupIncentives(month: string): Promise<
  | { ok: true; data: GroupIncentives }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "El panel central de bonos es solo para la dirección." };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };

  try {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;

    const sedes: SedeIncentives[] = [];
    for (const [bId, nombre] of [[2, "Fonavi"], [3, "Centro"]] as [number, string][]) {
      // Config vigente del mes (misma consulta que el Panel de Sede).
      const cfgRows = (await sql`
        SELECT ticket_base::float AS base, margin_pct::float AS margin, traffic_floor, pool_pct::float AS pool, levels
        FROM incentive_config
        WHERE business_id = ${bId} AND effective_month <= ${month}
        ORDER BY effective_month DESC LIMIT 1
      `) as { base: number; margin: number; traffic_floor: number; pool: number; levels: LevelRow[] }[];

      let progress: IncentiveProgress | null = null;
      let ticketBase: number | null = null;
      if (cfgRows.length > 0) {
        const config: IncentiveConfigT = {
          ticketBase: cfgRows[0].base,
          marginPct: cfgRows[0].margin,
          trafficFloor: cfgRows[0].traffic_floor,
          poolPct: cfgRows[0].pool,
          levels: cfgRows[0].levels,
        };
        ticketBase = config.ticketBase;

        const staff = (await sql`
          SELECT name, jornada, area FROM staff WHERE business_id = ${bId} AND active = true
        `) as { name: string; jornada: StaffMember["jornada"]; area: string }[];

        let dailies: DailyEntry[];
        try {
          dailies = (await sql`
            SELECT date::text, personas, revenue::float AS revenue, items,
                   delivery_pedidos AS "deliveryPedidos", delivery_venta::float AS "deliveryVenta"
            FROM upselling_daily
            WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}
            ORDER BY date
          `) as DailyEntry[];
        } catch {
          dailies = (await sql`
            SELECT date::text, personas, revenue::float AS revenue, items
            FROM upselling_daily
            WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}
            ORDER BY date
          `) as DailyEntry[];
        }
        progress = computeProgress(config, staff.map((s) => ({ ...s, active: true })), dailies, daysInMonth);
      }

      // Mejor vendedor por turno (mismas consultas que el Panel de Sede).
      let mejorVendedor: MejorVendedorResult | null = null;
      let mvPeriodEnd: string | null = null;
      try {
        const workers = (await sql`
          SELECT nombre, mesas, total::float AS total, period_end::text AS period_end
          FROM worker_period_sales
          WHERE business_id = ${bId} AND period_start >= ${monthStart} AND period_start <= ${monthEnd}
            AND imported_at = (SELECT MAX(imported_at) FROM worker_period_sales
                               WHERE business_id = ${bId} AND period_start >= ${monthStart} AND period_start <= ${monthEnd})
        `) as { nombre: string; mesas: number; total: number; period_end: string | null }[];
        if (workers.length > 0) {
          const shifts = (await sql`
            SELECT nombre, turno FROM worker_shifts WHERE business_id = ${bId}
          `) as { nombre: string; turno: Turno }[];
          const shiftMap = new Map(shifts.map((s) => [s.nombre.trim().toUpperCase(), s.turno]));
          mejorVendedor = computeMejorVendedor({
            records: workers
              .filter((w) => w.mesas > 0)
              .map((w) => ({
                seller: w.nombre,
                franja: shiftMap.get(w.nombre.trim().toUpperCase()) ?? "completo",
                ticketPersona: w.total / w.mesas,
                clientes: w.mesas,
              })),
            minClientes: MIN_MESAS,
          });
          mvPeriodEnd = workers[0]?.period_end ?? null;
        }
      } catch { /* tabla de turnos pendiente — el ranking se omite */ }

      const ult = (await sql`
        SELECT MAX(date)::text AS d FROM upselling_daily
        WHERE business_id = ${bId} AND revenue > 0 AND date BETWEEN ${monthStart} AND ${monthEnd}
      `) as { d: string | null }[];

      let liquidado = false;
      try {
        const liq = (await sql`
          SELECT 1 FROM incentive_liquidations WHERE business_id = ${bId} AND month = ${month} LIMIT 1
        `) as unknown[];
        liquidado = liq.length > 0;
      } catch { /* tabla pendiente */ }

      sedes.push({
        businessId: bId,
        sede: nombre,
        progress,
        ticketBase,
        mejorVendedor,
        mvPeriodEnd,
        ultimoRegistro: ult[0]?.d ?? null,
        liquidado,
      });
    }

    return { ok: true, data: { month, sedes } };
  } catch (err) {
    console.error("[getGroupIncentives] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar el panel de bonos" };
  }
}
