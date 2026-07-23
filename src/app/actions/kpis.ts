"use server";

/**
 * KPIs diarios de sede · Actions (reemplaza el cuadro de Notion).
 *
 * - El registro diario es EL MISMO de Incentivos (upselling_daily),
 *   extendido con NPS, mermas y tiempo — un solo ritual del admin.
 * - Acceso: sede-scoped como Incentivos; el deck de la reunión (todas
 *   las sedes) es SOLO para sesión completa (Jahnn/Kelly).
 * - Resiliencia pre-migración: si faltan las columnas/tabla nuevas,
 *   se degrada con aviso, nunca rompe el tablero.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import {
  computeWeekSummary,
  computeRangeSummary,
  compareWeeks,
  pickPriorityRed,
  weekStartOf,
  weekEndOf,
  type KpiTargets,
  type KpiDaily,
  type KpiWeekSummary,
  type WowItem,
} from "@/lib/kpis/engine";
import { computeProgress, type IncentiveConfigT, type StaffMember } from "@/lib/incentives/engine";
import { compareVentasSede, type VentasSedeComparison } from "@/lib/kpis/ventas-deck";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";

const sql = neon(process.env.DATABASE_URL!);

const SEDE_NAMES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

/** Metas por defecto (deck jun-2026 + política de tiempos: mostrador <6
 * min, mesa <15 min) si la tabla aún no existe. */
const DEFAULT_TARGETS: Record<number, KpiTargets> = {
  2: { ventaDiaria: 1322, ticketRef: 27.8, npsMin: 9, mermasMaxPct: 0.04, tiempoMaxMin: 6, tiempoMesaMaxMin: 15, tiempoDeliveryMaxMin: 20 },
  3: { ventaDiaria: 1266, ticketRef: 24.25, npsMin: 9, mermasMaxPct: 0.04, tiempoMaxMin: 6, tiempoMesaMaxMin: 15, tiempoDeliveryMaxMin: 20 },
};

async function sessionKind(bId: number): Promise<"full" | "admin" | null> {
  const role = await getSessionRole();
  if (role?.kind === "full") return "full";
  if (role?.kind === "admin" && role.sede === bId) return "admin";
  return null;
}

async function loadTargets(bId: number, month: string): Promise<KpiTargets> {
  try {
    const rows = (await sql`
      SELECT venta_diaria::float AS vd, ticket_ref::float AS tr, nps_min::float AS nm,
             mermas_max_pct::float AS mp, tiempo_max_min::float AS tm, tiempo_mesa_max_min::float AS tmm,
             tiempo_delivery_max_min::float AS td
      FROM kpi_targets
      WHERE business_id = ${bId} AND effective_month <= ${month}
      ORDER BY effective_month DESC LIMIT 1
    `) as { vd: number; tr: number; nm: number; mp: number; tm: number | null; tmm: number | null; td: number | null }[];
    if (rows.length > 0) {
      return { ventaDiaria: rows[0].vd, ticketRef: rows[0].tr, npsMin: rows[0].nm, mermasMaxPct: rows[0].mp, tiempoMaxMin: rows[0].tm, tiempoMesaMaxMin: rows[0].tmm, tiempoDeliveryMaxMin: rows[0].td };
    }
  } catch {
    // Columna tiempo_delivery_max_min pendiente de migración → sin ella.
    try {
      const rows = (await sql`
        SELECT venta_diaria::float AS vd, ticket_ref::float AS tr, nps_min::float AS nm,
               mermas_max_pct::float AS mp, tiempo_max_min::float AS tm, tiempo_mesa_max_min::float AS tmm
        FROM kpi_targets
        WHERE business_id = ${bId} AND effective_month <= ${month}
        ORDER BY effective_month DESC LIMIT 1
      `) as { vd: number; tr: number; nm: number; mp: number; tm: number | null; tmm: number | null }[];
      if (rows.length > 0) {
        return { ventaDiaria: rows[0].vd, ticketRef: rows[0].tr, npsMin: rows[0].nm, mermasMaxPct: rows[0].mp, tiempoMaxMin: rows[0].tm, tiempoMesaMaxMin: rows[0].tmm, tiempoDeliveryMaxMin: null };
      }
    } catch {
      // tabla o columna de mesa pendiente → defaults
    }
  }
  return DEFAULT_TARGETS[bId] ?? { ventaDiaria: 1, ticketRef: 1, npsMin: 9, mermasMaxPct: 0.04, tiempoMaxMin: null, tiempoMesaMaxMin: null, tiempoDeliveryMaxMin: null };
}

async function loadDailies(bId: number, from: string, to: string): Promise<{ dailies: KpiDaily[]; kpiColumns: boolean }> {
  try {
    const rows = (await sql`
      SELECT date::text, revenue::float AS ventas, personas,
             nps::float AS nps, mermas_soles::float AS mermas, tiempo_atencion_min::float AS tiempo,
             tiempo_mesa_min::float AS tiempo_mesa, tiempo_delivery_min::float AS tiempo_delivery
      FROM upselling_daily
      WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to}
      ORDER BY date
    `) as { date: string; ventas: number | null; personas: number | null; nps: number | null; mermas: number | null; tiempo: number | null; tiempo_mesa: number | null; tiempo_delivery: number | null }[];
    return {
      kpiColumns: true,
      dailies: rows.map((r) => ({
        date: r.date, ventas: r.ventas, personas: r.personas,
        nps: r.nps, mermasSoles: r.mermas, tiempoMin: r.tiempo, tiempoMesaMin: r.tiempo_mesa,
        tiempoDeliveryMin: r.tiempo_delivery,
      })),
    };
  } catch {
    // Columna tiempo_delivery_min pendiente de migración → sin ella.
    try {
      const rows = (await sql`
        SELECT date::text, revenue::float AS ventas, personas,
               nps::float AS nps, mermas_soles::float AS mermas, tiempo_atencion_min::float AS tiempo,
               tiempo_mesa_min::float AS tiempo_mesa
        FROM upselling_daily
        WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to}
        ORDER BY date
      `) as { date: string; ventas: number | null; personas: number | null; nps: number | null; mermas: number | null; tiempo: number | null; tiempo_mesa: number | null }[];
      return {
        kpiColumns: true,
        dailies: rows.map((r) => ({
          date: r.date, ventas: r.ventas, personas: r.personas,
          nps: r.nps, mermasSoles: r.mermas, tiempoMin: r.tiempo, tiempoMesaMin: r.tiempo_mesa,
          tiempoDeliveryMin: null,
        })),
      };
    } catch {
      const rows = (await sql`
        SELECT date::text, revenue::float AS ventas, personas
        FROM upselling_daily
        WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to}
        ORDER BY date
      `) as { date: string; ventas: number | null; personas: number | null }[];
      return {
        kpiColumns: false,
        dailies: rows.map((r) => ({ date: r.date, ventas: r.ventas, personas: r.personas, nps: null, mermasSoles: null, tiempoMin: null, tiempoMesaMin: null, tiempoDeliveryMin: null })),
      };
    }
  }
}

export type WeeklyKpisResult =
  | {
      ok: true;
      targets: KpiTargets;
      summary: KpiWeekSummary;
      wow: WowItem[];
      kpiColumnsReady: boolean;
    }
  | { ok: false; error: string };

/** Semana de KPIs de la sede activa (admin o sesión completa). */
export async function getWeeklyKpis(weekStart: string): Promise<WeeklyKpisResult> {
  const bId = await activeBusinessId();
  const kind = await sessionKind(bId);
  if (!kind) return { ok: false, error: "Sin acceso." };
  if (bId !== 2 && bId !== 3) return { ok: false, error: "KPIs diarios aplican a las cafeterías." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return { ok: false, error: "Semana inválida." };
  try {
    const ws = weekStartOf(weekStart);
    const targets = await loadTargets(bId, ws.slice(0, 7));
    const prevStart = new Date(ws + "T12:00:00Z");
    prevStart.setUTCDate(prevStart.getUTCDate() - 7);
    const ps = prevStart.toISOString().slice(0, 10);
    const { dailies, kpiColumns } = await loadDailies(bId, ps, weekEndOf(ws));
    const summary = computeWeekSummary(ws, dailies, targets);
    const previous = computeWeekSummary(ps, dailies, targets);
    return { ok: true, targets, summary, wow: compareWeeks(summary, previous), kpiColumnsReady: kpiColumns };
  } catch (err) {
    console.error("[getWeeklyKpis] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar la semana" };
  }
}

/** Avance del plan de incentivos de una cafetería (para el deck). */
export type DeckIncentives = {
  ticketBase: number;
  ticketActual: number | null;
  deltaActual: number | null;
  nivelAlcanzado: string | null;
  proximoNivel: { nombre: string; faltaSoles: number } | null;
  trafficOk: boolean;
  personasPorDia: number | null;
  trafficFloor: number;
  pozoProyectado: number | null;
  /** Suma de bonos a pagar por nivel (tabla fija del roster activo). */
  niveles: { nombre: string; delta: number; sumaBonos: number }[];
  month: string;
};

export type BoardDeckData = {
  weekStart: string;
  weekEnd: string;
  /** true si el rango NO es la semana dom→sáb estándar. */
  isCustomRange: boolean;
  cafeterias: { sede: string; targets: KpiTargets; summary: KpiWeekSummary; wow: WowItem[]; incentives: DeckIncentives | null }[];
  atelier: {
    ventasProm: number | null;
    ventasTotal: number;
    daysWithData: number;
    best: { date: string; value: number } | null;
    worst: { date: string; value: number } | null;
    days: { date: string; value: number }[];
    /** KPIs del registro de la supervisora (jul-2026); null si aún no registra. */
    ticketProm: number | null;
    mermasTotal: number | null;
    mermasPct: number | null;
  } | null;
  /** Comparativos de ventas Byte por sede; null si la tabla aún no migra. */
  ventas: VentasSedeComparison[] | null;
  priorityRed: { sede: string; kpi: string; detail: string } | null;
};

/** Avance de incentivos del mes que contiene el fin del rango. */
async function loadDeckIncentives(bId: number, month: string): Promise<DeckIncentives | null> {
  try {
    const cfgRows = (await sql`
      SELECT ticket_base::float AS base, margin_pct::float AS margin, traffic_floor, pool_pct::float AS pool, levels
      FROM incentive_config WHERE business_id = ${bId} AND effective_month <= ${month}
      ORDER BY effective_month DESC LIMIT 1
    `) as { base: number; margin: number; traffic_floor: number; pool: number; levels: IncentiveConfigT["levels"] }[];
    if (cfgRows.length === 0) return null;
    const config: IncentiveConfigT = {
      ticketBase: cfgRows[0].base,
      marginPct: cfgRows[0].margin,
      trafficFloor: cfgRows[0].traffic_floor,
      poolPct: cfgRows[0].pool,
      levels: cfgRows[0].levels,
    };
    const staff = (await sql`
      SELECT name, jornada, area FROM staff WHERE business_id = ${bId} AND active = true
    `) as { name: string; jornada: StaffMember["jornada"]; area: string }[];
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    type DeckDaily = { date: string; personas: number | null; revenue: number | null; items: number | null; deliveryPedidos?: number | null; deliveryVenta?: number | null; personalPedidos?: number | null; personalVenta?: number | null };
    let dailies: DeckDaily[];
    try {
      dailies = (await sql`
        SELECT date::text, personas, revenue::float AS revenue, items,
               delivery_pedidos AS "deliveryPedidos", delivery_venta::float AS "deliveryVenta",
               personal_pedidos AS "personalPedidos", personal_venta::float AS "personalVenta"
        FROM upselling_daily
        WHERE business_id = ${bId} AND date BETWEEN ${month + "-01"} AND ${`${month}-${String(daysInMonth).padStart(2, "0")}`}
        ORDER BY date
      `) as DeckDaily[];
    } catch {
      // Columnas delivery pendientes de migración → ticket como siempre.
      dailies = (await sql`
        SELECT date::text, personas, revenue::float AS revenue, items
        FROM upselling_daily
        WHERE business_id = ${bId} AND date BETWEEN ${month + "-01"} AND ${`${month}-${String(daysInMonth).padStart(2, "0")}`}
        ORDER BY date
      `) as DeckDaily[];
    }
    const p = computeProgress(config, staff.map((s) => ({ ...s, active: true })), dailies, daysInMonth);
    return {
      ticketBase: config.ticketBase,
      ticketActual: p.ticketActual,
      deltaActual: p.deltaActual,
      nivelAlcanzado: p.nivelAlcanzado?.nombre ?? null,
      proximoNivel: p.proximoNivel ? { nombre: p.proximoNivel.level.nombre, faltaSoles: p.proximoNivel.faltaSoles } : null,
      trafficOk: p.traffic.cumple,
      personasPorDia: p.traffic.personasPorDia,
      trafficFloor: p.traffic.floor,
      pozoProyectado: p.pozoProyectado,
      niveles: p.porNivel.map((n) => ({ nombre: n.level.nombre, delta: n.level.delta, sumaBonos: n.sumaBonos })),
      month,
    };
  } catch {
    return null; // sin config o migración pendiente — el deck lo omite
  }
}

function shiftDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Datos del deck de la reunión — SOLO sesión completa.
 * Sin `rangeEnd`: la semana dom→sáb que contiene `weekStart` (flujo de los
 * lunes). Con `rangeEnd`: rango personalizado [weekStart, rangeEnd]; la
 * comparación "vs anterior" usa la ventana previa del mismo largo.
 */
export async function getBoardDeckData(weekStart: string, rangeEnd?: string): Promise<
  | { ok: true; data: BoardDeckData }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "El informe de la reunión es solo para la sesión completa." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return { ok: false, error: "Fecha inicial inválida." };
  if (rangeEnd !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(rangeEnd)) return { ok: false, error: "Fecha final inválida." };
  try {
    // Rango efectivo: personalizado o semana dom→sáb.
    let ws: string, we: string, isCustomRange: boolean;
    if (rangeEnd !== undefined) {
      if (rangeEnd < weekStart) return { ok: false, error: "La fecha final no puede ser anterior a la inicial." };
      ws = weekStart;
      we = rangeEnd;
      isCustomRange = !(weekStartOf(ws) === ws && weekEndOf(ws) === we);
    } else {
      ws = weekStartOf(weekStart);
      we = weekEndOf(ws);
      isCustomRange = false;
    }
    // Ventana anterior del mismo largo (para el "vs anterior").
    const rangeDays = Math.round((new Date(we + "T12:00:00Z").getTime() - new Date(ws + "T12:00:00Z").getTime()) / 86400000) + 1;
    const ps = shiftDays(ws, -rangeDays);
    const pe = shiftDays(ws, -1);

    const cafeterias: BoardDeckData["cafeterias"] = [];
    for (const bId of [2, 3]) {
      const targets = await loadTargets(bId, ws.slice(0, 7));
      const { dailies } = await loadDailies(bId, ps, we);
      const summary = computeRangeSummary(ws, we, dailies, targets);
      const previous = computeRangeSummary(ps, pe, dailies, targets);
      const incentives = await loadDeckIncentives(bId, we.slice(0, 7));
      cafeterias.push({ sede: SEDE_NAMES[bId], targets, summary, wow: compareWeeks(summary, previous), incentives });
    }

    // Atelier: ventas diarias del registro de la supervisora / reporte
    // de Byte (fuente fresca, jul-2026); si aún no hay, cae al registro
    // financiero de Kelly (daily_records) para no dejar el slide vacío.
    let atelier: BoardDeckData["atelier"] = null;
    let at: { date: string; v: number }[] = [];
    try {
      at = (await sql`
        SELECT date::text, total::float AS v FROM byte_ventas_daily
        WHERE business_id = 1 AND date BETWEEN ${ws} AND ${we} AND total > 0
        ORDER BY date
      `) as { date: string; v: number }[];
    } catch {
      // tabla byte_ventas_daily pendiente de migración
    }
    if (at.length === 0) {
      at = (await sql`
        SELECT date::text, byte_total::float AS v FROM daily_records
        WHERE business_id = 1 AND date BETWEEN ${ws} AND ${we} AND archived = false AND COALESCE(byte_total, 0) > 0
        ORDER BY date
      `) as { date: string; v: number }[];
    }
    if (at.length > 0) {
      const total = Math.round(at.reduce((s, r) => s + r.v, 0) * 100) / 100;
      const sorted = [...at].sort((a, b) => a.v - b.v);
      // KPIs de la supervisora en el rango: ticket (venta ÷ pedidos) y
      // mermas — los 3 KPIs de Atelier completos en su slide.
      let ticketProm: number | null = null;
      let mermasTotal: number | null = null;
      let mermasPct: number | null = null;
      const kp = (await sql`
        SELECT SUM(revenue)::float AS venta, SUM(personas)::int AS pedidos, SUM(mermas_soles)::float AS mermas
        FROM upselling_daily WHERE business_id = 1 AND date BETWEEN ${ws} AND ${we}
      `) as { venta: number | null; pedidos: number | null; mermas: number | null }[];
      if (kp.length > 0 && (kp[0].pedidos ?? 0) > 0 && (kp[0].venta ?? 0) > 0) {
        ticketProm = Math.round((kp[0].venta! / kp[0].pedidos!) * 100) / 100;
      }
      if (kp.length > 0 && kp[0].mermas !== null) {
        mermasTotal = Math.round(kp[0].mermas * 100) / 100;
        mermasPct = total > 0 ? Math.round((mermasTotal / total) * 10000) / 100 : null;
      }
      atelier = {
        ventasProm: Math.round((total / at.length) * 100) / 100,
        ventasTotal: total,
        daysWithData: at.length,
        best: { date: sorted[sorted.length - 1].date, value: sorted[sorted.length - 1].v },
        worst: { date: sorted[0].date, value: sorted[0].v },
        days: at.map((r) => ({ date: r.date, value: r.v })),
        ticketProm,
        mermasTotal,
        mermasPct,
      };
    }

    // Comparativos de ventas Byte (las 3 sedes): rango vs anterior y mes
    // vs mes pasado a mismos días. Ventana leída: desde el día 1 del mes
    // ANTERIOR a `we` (cubre todos los cortes que compara la lib).
    let ventas: VentasSedeComparison[] | null = null;
    try {
      const readFrom = (() => {
        const [y, m] = we.slice(0, 7).split("-").map(Number);
        return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
      })();
      // La ventana "anterior" de un rango personalizado puede empezar
      // antes que el mes pasado — leer desde lo más temprano de ambos.
      const from = ps < readFrom ? ps : readFrom;
      // Cargador ÚNICO de venta diaria (fuentes combinadas por día, el
      // oficial manda) — el mismo del dashboard de Grupo: dos lectores
      // con cadenas distintas = dos verdades, y ya nos pasó (jul-2026).
      ventas = [];
      for (const bId of [1, 2, 3]) {
        const { rows, fuente } = await loadVentaRowsBlended(sql, bId, from, we);
        ventas.push(compareVentasSede(SEDE_NAMES[bId] ?? `Sede ${bId}`, rows, ws, we, fuente ?? "byte"));
      }
      if (ventas.every((v) => v.hasta === null)) ventas = null; // nadie tiene nada aún
    } catch {
      // tabla byte_ventas_daily pendiente de migración — el deck lo omite
    }

    return {
      ok: true,
      data: {
        weekStart: ws,
        weekEnd: we,
        isCustomRange,
        cafeterias,
        atelier,
        ventas,
        priorityRed: pickPriorityRed(cafeterias.map((cf) => ({ sede: cf.sede, summary: cf.summary }))),
      },
    };
  } catch (err) {
    console.error("[getBoardDeckData] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al armar el informe" };
  }
}

export type KpiTargetsEdit = {
  targets: KpiTargets;
  effectiveMonth: string;
  /** Referencia del sistema: promedios REALES de las últimas 4 semanas
   *  (el consejo con evidencia — la decisión de la meta es del CEO). */
  reference: { ventasProm: number | null; ticketProm: number | null; weeks: number };
};

/** Metas vigentes + referencia real, para la pantalla de configuración (solo sesión completa). */
export async function getKpiTargetsForEdit(): Promise<
  | { ok: true; data: KpiTargetsEdit }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  if (!(await requireFullSession())) {
    return { ok: false, error: "Las metas las ajusta solo la dirección." };
  }
  if (bId !== 2 && bId !== 3) return { ok: false, error: "KPIs aplican a las cafeterías." };
  try {
    const today = new Date().toISOString().slice(0, 10);
    const targets = await loadTargets(bId, today.slice(0, 7));
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 28);
    const { dailies } = await loadDailies(bId, from.toISOString().slice(0, 10), today);
    const withVentas = dailies.filter((d) => (d.ventas ?? 0) > 0);
    const ventasProm = withVentas.length > 0
      ? Math.round((withVentas.reduce((s, d) => s + (d.ventas ?? 0), 0) / withVentas.length) * 100) / 100
      : null;
    const conPersonas = withVentas.filter((d) => (d.personas ?? 0) > 0);
    const personas = conPersonas.reduce((s, d) => s + (d.personas ?? 0), 0);
    const ticketProm = personas > 0
      ? Math.round((conPersonas.reduce((s, d) => s + (d.ventas ?? 0), 0) / personas) * 100) / 100
      : null;
    return {
      ok: true,
      data: {
        targets,
        effectiveMonth: today.slice(0, 7),
        reference: { ventasProm, ticketProm, weeks: 4 },
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar metas" };
  }
}

/** Guarda las metas de la sede (solo sesión completa; vigencia por mes). */
export async function saveKpiTargets(input: {
  effectiveMonth: string;
  ventaDiaria: number;
  ticketRef: number;
  npsMin: number;
  mermasMaxPct: number;    // en % (ej. 4)
  tiempoMaxMin: number | null;          // mostrador
  tiempoMesaMaxMin: number | null;      // mesa
  tiempoDeliveryMaxMin?: number | null; // delivery
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!(await requireFullSession())) {
    return { ok: false, error: "Las metas las ajusta solo la dirección." };
  }
  if (bId !== 2 && bId !== 3) return { ok: false, error: "KPIs aplican a las cafeterías." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.effectiveMonth)) return { ok: false, error: "Mes de vigencia inválido." };
  if (input.ventaDiaria <= 0 || input.ticketRef <= 0) return { ok: false, error: "Metas de venta y ticket deben ser mayores a 0." };
  if (input.npsMin < 0 || input.npsMin > 10) return { ok: false, error: "NPS meta debe estar entre 0 y 10." };
  if (input.mermasMaxPct <= 0 || input.mermasMaxPct > 50) return { ok: false, error: "Mermas máx. debe estar entre 0 y 50%." };
  const tdMax = input.tiempoDeliveryMaxMin ?? null;
  try {
    await sql`
      INSERT INTO kpi_targets (business_id, effective_month, venta_diaria, ticket_ref, nps_min, mermas_max_pct, tiempo_max_min, tiempo_mesa_max_min, tiempo_delivery_max_min)
      VALUES (${bId}, ${input.effectiveMonth}, ${input.ventaDiaria}, ${input.ticketRef}, ${input.npsMin}, ${input.mermasMaxPct / 100}, ${input.tiempoMaxMin}, ${input.tiempoMesaMaxMin}, ${tdMax})
      ON CONFLICT (business_id, effective_month) DO UPDATE
        SET venta_diaria = EXCLUDED.venta_diaria, ticket_ref = EXCLUDED.ticket_ref,
            nps_min = EXCLUDED.nps_min, mermas_max_pct = EXCLUDED.mermas_max_pct,
            tiempo_max_min = EXCLUDED.tiempo_max_min, tiempo_mesa_max_min = EXCLUDED.tiempo_mesa_max_min,
            tiempo_delivery_max_min = EXCLUDED.tiempo_delivery_max_min
    `;
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/tiempo_delivery_max_min/.test(msg)) {
      return { ok: false, error: "Falta la migración de delivery en la base de datos (columna tiempo_delivery_max_min) — avísale a Jahnn." };
    }
    if (/tiempo_mesa_max_min/.test(msg)) {
      return { ok: false, error: "Falta la migración de tiempos en la base de datos (columna tiempo_mesa_max_min) — avísale a Jahnn." };
    }
    console.error("[saveKpiTargets] failed:", err);
    return { ok: false, error: msg || "Error al guardar metas" };
  }
}

/**
 * Promedios MEDIDOS por el cronómetro del encargado para un día.
 * Devuelve null por tipo si no hubo mediciones (o falta la tabla).
 */
async function measuredTimes(bId: number, date: string): Promise<{ mostrador: number | null; mesa: number | null; delivery: number | null }> {
  try {
    const rows = (await sql`
      SELECT kind, AVG(duration_seconds)::float AS avg_s
      FROM service_timings
      WHERE business_id = ${bId} AND date = ${date} AND ended_at IS NOT NULL
      GROUP BY kind
    `) as { kind: "mostrador" | "mesa" | "delivery"; avg_s: number }[];
    const pick = (k: string) => {
      const r = rows.find((x) => x.kind === k);
      return r ? Math.round((r.avg_s / 60) * 10) / 10 : null;
    };
    return { mostrador: pick("mostrador"), mesa: pick("mesa"), delivery: pick("delivery") };
  } catch {
    return { mostrador: null, mesa: null, delivery: null };
  }
}

/**
 * Guarda los KPIs del día (extiende el registro diario de Incentivos).
 *
 * REGLA DE LOS TIEMPOS (bug reportado por el admin, jul-2026): los
 * tiempos tienen DOS fuentes — el cronómetro del encargado y el tecleo
 * del admin. Antes, guardar el día con los campos vacíos escribía NULL
 * encima de las mediciones del encargado (Fonavi 13-jul perdió
 * mostrador 5.5 / mesa 8.5 así). Ahora:
 *   1. Lo MEDIDO manda sobre lo tecleado (es dato real, no estimación).
 *   2. Un campo vacío NUNCA borra un valor existente (COALESCE).
 * Para corregir un tiempo mal medido se descarta la medición en el
 * cronómetro; para uno tecleado, se sobreescribe con el valor correcto.
 */
export async function saveDailyKpis(input: {
  date: string;
  nps: number | null;
  mermasSoles: number | null;
  tiempoMin: number | null;          // mostrador
  tiempoMesaMin: number | null;      // mesa
  tiempoDeliveryMin?: number | null; // delivery (registro → motorizado)
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const kind = await sessionKind(bId);
  if (!kind) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Fecha inválida." };
  if (input.nps !== null && (input.nps < 0 || input.nps > 10)) return { ok: false, error: "NPS debe estar entre 0 y 10." };
  if (input.mermasSoles !== null && input.mermasSoles < 0) return { ok: false, error: "Mermas inválidas." };
  if (input.tiempoMin !== null && input.tiempoMin < 0) return { ok: false, error: "Tiempo inválido." };
  if (input.tiempoMesaMin !== null && input.tiempoMesaMin < 0) return { ok: false, error: "Tiempo de mesa inválido." };
  const tDeliveryIn = input.tiempoDeliveryMin ?? null;
  if (tDeliveryIn !== null && tDeliveryIn < 0) return { ok: false, error: "Tiempo de delivery inválido." };
  try {
    // Lo medido gana; si no hay medición, vale lo que tecleó el admin.
    const measured = await measuredTimes(bId, input.date);
    const tMost = measured.mostrador ?? input.tiempoMin;
    const tMesa = measured.mesa ?? input.tiempoMesaMin;
    const tDeli = measured.delivery ?? tDeliveryIn;
    await sql`
      INSERT INTO upselling_daily (business_id, date, nps, mermas_soles, tiempo_atencion_min, tiempo_mesa_min, tiempo_delivery_min, source, updated_at)
      VALUES (${bId}, ${input.date}, ${input.nps}, ${input.mermasSoles}, ${tMost}, ${tMesa}, ${tDeli}, 'manual', NOW())
      ON CONFLICT (business_id, date) DO UPDATE
        SET nps = EXCLUDED.nps, mermas_soles = EXCLUDED.mermas_soles,
            -- COALESCE: vacío = "no lo toco", nunca "bórralo".
            tiempo_atencion_min = COALESCE(EXCLUDED.tiempo_atencion_min, upselling_daily.tiempo_atencion_min),
            tiempo_mesa_min = COALESCE(EXCLUDED.tiempo_mesa_min, upselling_daily.tiempo_mesa_min),
            tiempo_delivery_min = COALESCE(EXCLUDED.tiempo_delivery_min, upselling_daily.tiempo_delivery_min),
            updated_at = NOW()
    `;
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/tiempo_delivery_min/.test(msg)) {
      try {
        const measured = await measuredTimes(bId, input.date);
        const tMost = measured.mostrador ?? input.tiempoMin;
        const tMesa = measured.mesa ?? input.tiempoMesaMin;
        await sql`
          INSERT INTO upselling_daily (business_id, date, nps, mermas_soles, tiempo_atencion_min, tiempo_mesa_min, source, updated_at)
          VALUES (${bId}, ${input.date}, ${input.nps}, ${input.mermasSoles}, ${tMost}, ${tMesa}, 'manual', NOW())
          ON CONFLICT (business_id, date) DO UPDATE
            SET nps = EXCLUDED.nps, mermas_soles = EXCLUDED.mermas_soles,
                tiempo_atencion_min = COALESCE(EXCLUDED.tiempo_atencion_min, upselling_daily.tiempo_atencion_min),
                tiempo_mesa_min = COALESCE(EXCLUDED.tiempo_mesa_min, upselling_daily.tiempo_mesa_min),
                updated_at = NOW()
        `;
        revalidatePath("/[negocio]/panel", "page");
        if (tDeliveryIn !== null) {
          return { ok: false, error: "Guardé todo menos el tiempo de delivery: falta la migración (columna tiempo_delivery_min) — avísale a Jahnn." };
        }
        return { ok: true };
      } catch {
        /* cae al manejo general */
      }
    }
    if (/tiempo_mesa_min/.test(msg)) {
      // Migración de tiempo de mesa pendiente → guarda el resto sin perder el día.
      try {
        // Misma regla que arriba: vacío nunca borra lo medido.
        await sql`
          INSERT INTO upselling_daily (business_id, date, nps, mermas_soles, tiempo_atencion_min, source, updated_at)
          VALUES (${bId}, ${input.date}, ${input.nps}, ${input.mermasSoles}, ${input.tiempoMin}, 'manual', NOW())
          ON CONFLICT (business_id, date) DO UPDATE
            SET nps = EXCLUDED.nps, mermas_soles = EXCLUDED.mermas_soles,
                tiempo_atencion_min = COALESCE(EXCLUDED.tiempo_atencion_min, upselling_daily.tiempo_atencion_min),
                updated_at = NOW()
        `;
        revalidatePath("/[negocio]/panel", "page");
        if (input.tiempoMesaMin !== null) {
          return { ok: false, error: "Guardé todo menos el tiempo de mesa: falta la migración (columna tiempo_mesa_min) — avísale a Jahnn." };
        }
        return { ok: true };
      } catch {
        /* cae al manejo general */
      }
    }
    if (/nps|mermas_soles|tiempo_atencion/.test(msg)) {
      return { ok: false, error: "Falta la migración de KPIs en la base de datos (columnas nuevas)." };
    }
    console.error("[saveDailyKpis] failed:", err);
    return { ok: false, error: msg || "Error al guardar KPIs" };
  }
}
