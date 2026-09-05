"use server";

/**
 * Liquidación mensual de incentivos — SOLO sesión completa (dirección).
 * Congela el resultado del mes en incentive_liquidations: es el acta
 * del programa. Los candados (mes terminado, observaciones resueltas)
 * viven en el motor puro; aquí solo se recolecta y se congela.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { requireFullSession } from "@/lib/session-access";
import { refrescarRosterSiHaceFalta } from "./roster-sync";
import {
  computeLiquidation,
  type IncentiveConfigT,
  type StaffMember,
  type LiquidationResult,
} from "@/lib/incentives/engine";

const sql = neon(process.env.DATABASE_URL!);

type LevelRow = { nombre: string; delta: number; bono_tc: number; bono_mt: number; bono_admin: number; premio_mv: number };

async function collectForLiquidation(bId: number, month: string, mejorVendedor: string | null): Promise<LiquidationResult> {
  // Antes de calcular un pago, el roster tiene que ser el real. Si la
  // copia de Planilla está vieja se refresca sola; si Planilla no
  // responde, se sigue con lo que hay (nunca rompe la liquidación).
  await refrescarRosterSiHaceFalta(bId);

  const cfgRows = (await sql`
    SELECT ticket_base::float AS base, margin_pct::float AS margin, traffic_floor, pool_pct::float AS pool, levels
    FROM incentive_config WHERE business_id = ${bId} AND effective_month <= ${month}
    ORDER BY effective_month DESC LIMIT 1
  `) as { base: number; margin: number; traffic_floor: number; pool: number; levels: LevelRow[] }[];
  if (cfgRows.length === 0) throw new Error("Sin configuración del programa para esta sede.");
  const config: IncentiveConfigT = {
    ticketBase: cfgRows[0].base,
    marginPct: cfgRows[0].margin,
    trafficFloor: cfgRows[0].traffic_floor,
    poolPct: cfgRows[0].pool,
    levels: cfgRows[0].levels,
  };

  const staff = (await sql`
    SELECT name, jornada, area, horas_semanales::float AS "horasSemanales"
      FROM staff WHERE business_id = ${bId} AND active = true ORDER BY jornada, name
  `) as { name: string; jornada: StaffMember["jornada"]; area: string; horasSemanales: number | null }[];

  const [y, m] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  // El acta usa el MISMO ticket que el panel: delivery excluido
  // (fallback si las columnas aún no migran).
  type LiqDaily = { date: string; personas: number | null; revenue: number | null; items: number | null; deliveryPedidos?: number | null; deliveryVenta?: number | null; personalPedidos?: number | null; personalVenta?: number | null };
  let dailies: LiqDaily[];
  try {
    dailies = (await sql`
      SELECT date::text, personas, revenue::float AS revenue, items,
             delivery_pedidos AS "deliveryPedidos", delivery_venta::float AS "deliveryVenta",
               personal_pedidos AS "personalPedidos", personal_venta::float AS "personalVenta"
      FROM upselling_daily WHERE business_id = ${bId} AND date BETWEEN ${month + "-01"} AND ${monthEnd}
      ORDER BY date
    `) as LiqDaily[];
  } catch {
    dailies = (await sql`
      SELECT date::text, personas, revenue::float AS revenue, items
      FROM upselling_daily WHERE business_id = ${bId} AND date BETWEEN ${month + "-01"} AND ${monthEnd}
      ORDER BY date
    `) as LiqDaily[];
  }

  let unverifiedDays = 0;
  let observedDays: { date: string; nota: string | null }[] = [];
  try {
    const verifs = (await sql`
      SELECT date::text, status, nota FROM daily_verifications
      WHERE business_id = ${bId} AND date BETWEEN ${month + "-01"} AND ${monthEnd}
    `) as { date: string; status: string; nota: string | null }[];
    const byDate = new Map(verifs.map((v) => [v.date, v]));
    observedDays = verifs.filter((v) => v.status === "observado").map((v) => ({ date: v.date, nota: v.nota }));
    unverifiedDays = dailies.filter((d) => (d.revenue ?? 0) > 0 && !byDate.has(d.date)).length;
  } catch {
    // tabla de verificaciones pendiente: se liquida sin ese candado, avisado
  }

  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  return computeLiquidation({
    month, todayISO, config,
    staff: staff.map((s) => ({ ...s, active: true })),
    dailies, unverifiedDays, observedDays, mejorVendedor,
  });
}

export type StoredLiquidation = {
  month: string;
  closedAt: string;
  result: LiquidationResult;
  mejorVendedor: string | null;
  notas: string | null;
};

/** Vista previa (o la liquidación ya cerrada) del mes. */
export async function getLiquidation(month: string, mejorVendedor: string | null): Promise<
  | { ok: true; closed: StoredLiquidation | null; preview: LiquidationResult | null; salonStaff: string[] }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return { ok: false, error: "La liquidación es solo para la dirección." };
  const bId = await activeBusinessId();
  if (bId !== 2 && bId !== 3) return { ok: false, error: "Aplica a las cafeterías." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    let closed: StoredLiquidation | null = null;
    try {
      const rows = (await sql`
        SELECT month, closed_at::text AS closed_at, detalle, notas, mejor_vendedor
        FROM incentive_liquidations WHERE business_id = ${bId} AND month = ${month}
      `) as { month: string; closed_at: string; detalle: LiquidationResult; notas: string | null; mejor_vendedor: string | null }[];
      if (rows.length > 0) {
        closed = { month, closedAt: rows[0].closed_at, result: rows[0].detalle, mejorVendedor: rows[0].mejor_vendedor, notas: rows[0].notas };
      }
    } catch {
      // tabla pendiente de migración → solo preview
    }
    const salon = (await sql`
      SELECT name FROM staff WHERE business_id = ${bId} AND active = true AND area = 'salon' ORDER BY name
    `) as { name: string }[];
    const preview = closed ? null : await collectForLiquidation(bId, month, mejorVendedor);
    return { ok: true, closed, preview, salonStaff: salon.map((s) => s.name) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al preparar la liquidación" };
  }
}

/** Cierra el mes: congela el acta. Bloqueado si el motor tiene blockers. */
export async function closeLiquidation(input: {
  month: string;
  mejorVendedor: string | null;
  notas: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "La liquidación es solo para la dirección." };
  const bId = await activeBusinessId();
  if (bId !== 2 && bId !== 3) return { ok: false, error: "Aplica a las cafeterías." };
  try {
    const result = await collectForLiquidation(bId, input.month, input.mejorVendedor);
    if (result.blockers.length > 0) {
      return { ok: false, error: "Hay pendientes que resolver antes de cerrar: " + result.blockers[0] };
    }
    await sql`
      INSERT INTO incentive_liquidations (business_id, month, ticket_final, ticket_base, personas, revenue,
        nivel, traffic_ok, pozo, total_bonos, detalle, mejor_vendedor, notas)
      VALUES (${bId}, ${input.month}, ${result.ticketFinal}, ${result.ticketBase}, ${result.personas}, ${result.revenue},
        ${result.nivel?.nombre ?? null}, ${result.trafficOk}, ${result.pozo}, ${result.totalBonos},
        ${JSON.stringify(result)}::jsonb, ${input.mejorVendedor}, ${input.notas?.trim() || null})
    `;
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/incentive_liquidations/.test(msg)) {
      return { ok: false, error: "Falta la migración de liquidaciones (tabla incentive_liquidations)." };
    }
    if (/duplicate|unique/i.test(msg)) return { ok: false, error: "Este mes ya está cerrado. Reábrelo primero si necesitas corregir." };
    console.error("[closeLiquidation] failed:", err);
    return { ok: false, error: msg || "Error al cerrar el mes" };
  }
}

/** Reabre un mes cerrado (corrige y vuelve a cerrar). Solo dirección. */
export async function reopenLiquidation(month: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo la dirección puede reabrir." };
  const bId = await activeBusinessId();
  try {
    await sql`DELETE FROM incentive_liquidations WHERE business_id = ${bId} AND month = ${month}`;
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al reabrir" };
  }
}
