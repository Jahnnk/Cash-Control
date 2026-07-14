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

const sql = neon(process.env.DATABASE_URL!);

const SEDE_NAMES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

/** Metas por defecto (deck jun-2026 + política de tiempos: mostrador <6
 * min, mesa <15 min) si la tabla aún no existe. */
const DEFAULT_TARGETS: Record<number, KpiTargets> = {
  2: { ventaDiaria: 1322, ticketRef: 27.8, npsMin: 9, mermasMaxPct: 0.04, tiempoMaxMin: 6, tiempoMesaMaxMin: 15 },
  3: { ventaDiaria: 1266, ticketRef: 24.25, npsMin: 9, mermasMaxPct: 0.04, tiempoMaxMin: 6, tiempoMesaMaxMin: 15 },
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
             mermas_max_pct::float AS mp, tiempo_max_min::float AS tm, tiempo_mesa_max_min::float AS tmm
      FROM kpi_targets
      WHERE business_id = ${bId} AND effective_month <= ${month}
      ORDER BY effective_month DESC LIMIT 1
    `) as { vd: number; tr: number; nm: number; mp: number; tm: number | null; tmm: number | null }[];
    if (rows.length > 0) {
      return { ventaDiaria: rows[0].vd, ticketRef: rows[0].tr, npsMin: rows[0].nm, mermasMaxPct: rows[0].mp, tiempoMaxMin: rows[0].tm, tiempoMesaMaxMin: rows[0].tmm };
    }
  } catch {
    // Columna tiempo_mesa_max_min pendiente de migración → re-lee sin ella.
    try {
      const rows = (await sql`
        SELECT venta_diaria::float AS vd, ticket_ref::float AS tr, nps_min::float AS nm,
               mermas_max_pct::float AS mp, tiempo_max_min::float AS tm
        FROM kpi_targets
        WHERE business_id = ${bId} AND effective_month <= ${month}
        ORDER BY effective_month DESC LIMIT 1
      `) as { vd: number; tr: number; nm: number; mp: number; tm: number | null }[];
      if (rows.length > 0) {
        return { ventaDiaria: rows[0].vd, ticketRef: rows[0].tr, npsMin: rows[0].nm, mermasMaxPct: rows[0].mp, tiempoMaxMin: rows[0].tm, tiempoMesaMaxMin: null };
      }
    } catch {
      // tabla kpi_targets pendiente de migración → defaults
    }
  }
  return DEFAULT_TARGETS[bId] ?? { ventaDiaria: 1, ticketRef: 1, npsMin: 9, mermasMaxPct: 0.04, tiempoMaxMin: null, tiempoMesaMaxMin: null };
}

async function loadDailies(bId: number, from: string, to: string): Promise<{ dailies: KpiDaily[]; kpiColumns: boolean }> {
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
      })),
    };
  } catch {
    // Columna tiempo_mesa_min pendiente de migración → sin ella.
    try {
      const rows = (await sql`
        SELECT date::text, revenue::float AS ventas, personas,
               nps::float AS nps, mermas_soles::float AS mermas, tiempo_atencion_min::float AS tiempo
        FROM upselling_daily
        WHERE business_id = ${bId} AND date BETWEEN ${from} AND ${to}
        ORDER BY date
      `) as { date: string; ventas: number | null; personas: number | null; nps: number | null; mermas: number | null; tiempo: number | null }[];
      return {
        kpiColumns: true,
        dailies: rows.map((r) => ({
          date: r.date, ventas: r.ventas, personas: r.personas,
          nps: r.nps, mermasSoles: r.mermas, tiempoMin: r.tiempo, tiempoMesaMin: null,
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
        dailies: rows.map((r) => ({ date: r.date, ventas: r.ventas, personas: r.personas, nps: null, mermasSoles: null, tiempoMin: null, tiempoMesaMin: null })),
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
  } | null;
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
    const dailies = (await sql`
      SELECT date::text, personas, revenue::float AS revenue, items
      FROM upselling_daily
      WHERE business_id = ${bId} AND date BETWEEN ${month + "-01"} AND ${`${month}-${String(daysInMonth).padStart(2, "0")}`}
      ORDER BY date
    `) as { date: string; personas: number | null; revenue: number | null; items: number | null }[];
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

    // Atelier: ventas diarias reales desde daily_records (B2B — sin
    // NPS/mermas del programa; con detalle diario para su slide).
    let atelier: BoardDeckData["atelier"] = null;
    const at = (await sql`
      SELECT date::text, byte_total::float AS v FROM daily_records
      WHERE business_id = 1 AND date BETWEEN ${ws} AND ${we} AND archived = false AND COALESCE(byte_total, 0) > 0
      ORDER BY date
    `) as { date: string; v: number }[];
    if (at.length > 0) {
      const total = Math.round(at.reduce((s, r) => s + r.v, 0) * 100) / 100;
      const sorted = [...at].sort((a, b) => a.v - b.v);
      atelier = {
        ventasProm: Math.round((total / at.length) * 100) / 100,
        ventasTotal: total,
        daysWithData: at.length,
        best: { date: sorted[sorted.length - 1].date, value: sorted[sorted.length - 1].v },
        worst: { date: sorted[0].date, value: sorted[0].v },
        days: at.map((r) => ({ date: r.date, value: r.v })),
      };
    }

    return {
      ok: true,
      data: {
        weekStart: ws,
        weekEnd: we,
        isCustomRange,
        cafeterias,
        atelier,
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
  tiempoMaxMin: number | null;      // mostrador
  tiempoMesaMaxMin: number | null;  // mesa
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
  try {
    await sql`
      INSERT INTO kpi_targets (business_id, effective_month, venta_diaria, ticket_ref, nps_min, mermas_max_pct, tiempo_max_min, tiempo_mesa_max_min)
      VALUES (${bId}, ${input.effectiveMonth}, ${input.ventaDiaria}, ${input.ticketRef}, ${input.npsMin}, ${input.mermasMaxPct / 100}, ${input.tiempoMaxMin}, ${input.tiempoMesaMaxMin})
      ON CONFLICT (business_id, effective_month) DO UPDATE
        SET venta_diaria = EXCLUDED.venta_diaria, ticket_ref = EXCLUDED.ticket_ref,
            nps_min = EXCLUDED.nps_min, mermas_max_pct = EXCLUDED.mermas_max_pct,
            tiempo_max_min = EXCLUDED.tiempo_max_min, tiempo_mesa_max_min = EXCLUDED.tiempo_mesa_max_min
    `;
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/tiempo_mesa_max_min/.test(msg)) {
      return { ok: false, error: "Falta la migración de tiempos en la base de datos (columna tiempo_mesa_max_min) — avísale a Jahnn." };
    }
    console.error("[saveKpiTargets] failed:", err);
    return { ok: false, error: msg || "Error al guardar metas" };
  }
}

/** Guarda los KPIs del día (extiende el registro diario de Incentivos). */
export async function saveDailyKpis(input: {
  date: string;
  nps: number | null;
  mermasSoles: number | null;
  tiempoMin: number | null;       // mostrador
  tiempoMesaMin: number | null;   // mesa
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const kind = await sessionKind(bId);
  if (!kind) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Fecha inválida." };
  if (input.nps !== null && (input.nps < 0 || input.nps > 10)) return { ok: false, error: "NPS debe estar entre 0 y 10." };
  if (input.mermasSoles !== null && input.mermasSoles < 0) return { ok: false, error: "Mermas inválidas." };
  if (input.tiempoMin !== null && input.tiempoMin < 0) return { ok: false, error: "Tiempo inválido." };
  if (input.tiempoMesaMin !== null && input.tiempoMesaMin < 0) return { ok: false, error: "Tiempo de mesa inválido." };
  try {
    await sql`
      INSERT INTO upselling_daily (business_id, date, nps, mermas_soles, tiempo_atencion_min, tiempo_mesa_min, source, updated_at)
      VALUES (${bId}, ${input.date}, ${input.nps}, ${input.mermasSoles}, ${input.tiempoMin}, ${input.tiempoMesaMin}, 'manual', NOW())
      ON CONFLICT (business_id, date) DO UPDATE
        SET nps = EXCLUDED.nps, mermas_soles = EXCLUDED.mermas_soles,
            tiempo_atencion_min = EXCLUDED.tiempo_atencion_min,
            tiempo_mesa_min = EXCLUDED.tiempo_mesa_min, updated_at = NOW()
    `;
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/tiempo_mesa_min/.test(msg)) {
      // Migración de tiempo de mesa pendiente → guarda el resto sin perder el día.
      try {
        await sql`
          INSERT INTO upselling_daily (business_id, date, nps, mermas_soles, tiempo_atencion_min, source, updated_at)
          VALUES (${bId}, ${input.date}, ${input.nps}, ${input.mermasSoles}, ${input.tiempoMin}, 'manual', NOW())
          ON CONFLICT (business_id, date) DO UPDATE
            SET nps = EXCLUDED.nps, mermas_soles = EXCLUDED.mermas_soles,
                tiempo_atencion_min = EXCLUDED.tiempo_atencion_min, updated_at = NOW()
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
