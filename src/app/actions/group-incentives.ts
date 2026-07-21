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
import {
  MIN_MESAS_MEJOR_VENDEDOR,
  filterWorkersByWindow,
  contarNoElegibles,
} from "@/lib/incentives/best-seller-window";

const sql = neon(process.env.DATABASE_URL!);

// Umbral y ventana ÚNICOS (lib compartida). Antes aquí decía 15 mientras
// el Panel de Sede exigía 60 → el admin veía a Jefferson y la dirección
// a Abigail. Nunca más una constante copiada a mano.
const MIN_MESAS = MIN_MESAS_MEJOR_VENDEDOR;

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
  /** Periodo del reporte de trabajadores usado para el ranking. */
  mvPeriodStart: string | null;
  mvPeriodEnd: string | null;
  /** Último día con registro diario — para saber si el avance está al día. */
  ultimoRegistro: string | null;
  /** El mes ya tiene acta de liquidación (resultado congelado). */
  liquidado: boolean;
  /** Mínimo de mesas para entrar al ranking y cuántos quedaron fuera —
   * visible en pantalla: un excluido invisible genera desconfianza. */
  minMesas: number;
  noElegibles: number;
};

export type GroupIncentives = {
  month: string;
  /** Rango personalizado (ej. la semana piloto del desayuno) — si está,
   * el avance y el mejor vendedor son SOLO de esos días. */
  range: { from: string; to: string } | null;
  sedes: SedeIncentives[];
};

export async function getGroupIncentives(
  month: string,
  range?: { from: string; to: string },
): Promise<
  | { ok: true; data: GroupIncentives }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "El panel central de bonos es solo para la dirección." };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  if (range !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to)) {
      return { ok: false, error: "Rango de fechas inválido." };
    }
    if (range.to < range.from) return { ok: false, error: "La fecha final no puede ser anterior a la inicial." };
  }

  try {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;
    // Con rango: el avance se mide SOLO en esos días (la config sigue
    // siendo la del mes — niveles y base no cambian a mitad de semana).
    const from = range?.from ?? monthStart;
    const to = range?.to ?? monthEnd;
    const daysInWindow = range
      ? Math.round((new Date(to + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86400000) + 1
      : daysInMonth;

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
                   delivery_pedidos AS "deliveryPedidos", delivery_venta::float AS "deliveryVenta",
                   personal_pedidos AS "personalPedidos", personal_venta::float AS "personalVenta"
            FROM upselling_daily
            WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to}
            ORDER BY date
          `) as DailyEntry[];
        } catch {
          dailies = (await sql`
            SELECT date::text, personas, revenue::float AS revenue, items
            FROM upselling_daily
            WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to}
            ORDER BY date
          `) as DailyEntry[];
        }
        progress = computeProgress(config, staff.map((s) => ({ ...s, active: true })), dailies, daysInWindow);
      }

      // Mejor vendedor por turno (mismas consultas que el Panel de Sede).
      let mejorVendedor: MejorVendedorResult | null = null;
      let mvPeriodStart: string | null = null;
      let mvPeriodEnd: string | null = null;
      let noElegibles = 0;
      try {
        // Ventana IDÉNTICA al Panel de Sede en modo mes ("inicia en la
        // ventana"); en modo rango, "contenido" (un acumulado del 1 al 17
        // no representa la semana piloto). Una sola definición: lib.
        const windowMode = range ? "contenido" : "inicia-en-ventana";
        const candidatos = (await sql`
          SELECT nombre, mesas, total::float AS total,
                 period_start::text AS period_start, period_end::text AS period_end
          FROM worker_period_sales
          WHERE business_id = ${bId} AND period_start >= ${from} AND period_start <= ${to}
            AND imported_at = (SELECT MAX(imported_at) FROM worker_period_sales
                               WHERE business_id = ${bId} AND period_start >= ${from} AND period_start <= ${to})
        `) as { nombre: string; mesas: number; total: number; period_start: string | null; period_end: string | null }[];
        const workers = filterWorkersByWindow(candidatos, from, to, windowMode) as typeof candidatos;
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
          noElegibles = contarNoElegibles(workers);
          mvPeriodStart = workers[0]?.period_start ?? null;
          mvPeriodEnd = workers[0]?.period_end ?? null;
        }
      } catch { /* tabla de turnos pendiente — el ranking se omite */ }

      const ult = (await sql`
        SELECT MAX(date)::text AS d FROM upselling_daily
        WHERE business_id = ${bId} AND revenue > 0 AND date BETWEEN ${from} AND ${to}
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
        mvPeriodStart,
        mvPeriodEnd,
        ultimoRegistro: ult[0]?.d ?? null,
        liquidado,
        minMesas: MIN_MESAS,
        noElegibles,
      });
    }

    return { ok: true, data: { month, range: range ?? null, sedes } };
  } catch (err) {
    console.error("[getGroupIncentives] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar el panel de bonos" };
  }
}
