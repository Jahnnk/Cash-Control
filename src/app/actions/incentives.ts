"use server";

/**
 * Incentivos por Upselling · Actions (política jun-2026).
 *
 * SEGURIDAD: además del bloqueo del middleware, cada action re-verifica
 * la sesión: contraseña completa (Jahnn/Kelly) ve todo; sesión de
 * administrador de sede (token v2) SOLO opera sobre SU sede. Un admin
 * de Fonavi jamás puede leer ni escribir datos de Centro, ni de ninguna
 * otra parte de la app.
 */

import { neon } from "@neondatabase/serverless";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { verifyAuthToken, verifyScopedToken } from "@/lib/auth-token";
import {
  computeProgress,
  computeFlags,
  type IncentiveConfigT,
  type StaffMember,
  type IncentiveProgress,
  type ControlFlag,
  type ControlEvent,
  type WorkerSales,
} from "@/lib/incentives/engine";
import type { ParsedEvent, ParsedWorkerSales } from "@/lib/incentives/byte-control-parsers";

const sql = neon(process.env.DATABASE_URL!);

const SEDE_BY_SCOPE: Record<string, number> = { "admin-fonavi": 2, "admin-centro": 3 };

/** Sesión completa o admin de la sede indicada — si no, error. */
async function requireIncentivesAccess(bId: number): Promise<{ ok: true; isAdmin: boolean } | { ok: false; error: string }> {
  const c = await cookies();
  const token = c.get("yayis_auth")?.value;
  const now = Math.floor(Date.now() / 1000);
  if (await verifyAuthToken(token, process.env.APP_PASSWORD, now)) {
    return { ok: true, isAdmin: false };
  }
  const scope = await verifyScopedToken(
    token,
    (s) => (s === "admin-fonavi" ? process.env.ADMIN_PASSWORD_FONAVI : s === "admin-centro" ? process.env.ADMIN_PASSWORD_CENTRO : undefined),
    now,
  );
  if (scope && SEDE_BY_SCOPE[scope] === bId) return { ok: true, isAdmin: true };
  return { ok: false, error: "Sin acceso a los incentivos de esta sede." };
}

type LevelRow = { nombre: string; delta: number; bono_tc: number; bono_mt: number; bono_admin: number; premio_mv: number };

export type IncentiveDashboard = {
  month: string;
  config: IncentiveConfigT & { levelNames: string[] };
  staff: { name: string; jornada: string; area: string }[];
  dailies: { date: string; personas: number | null; revenue: number | null; items: number | null }[];
  progress: IncentiveProgress;
  flags: ControlFlag[];
  workers: { nombre: string; mesas: number; total: number; ticketMesa: number | null; periodEnd: string | null }[];
  eventCounts: { anulaciones: number; cortesias: number; cambiosPrecio: number };
  isAdminSession: boolean;
};

export async function getIncentiveDashboard(
  month: string,
): Promise<{ ok: true; data: IncentiveDashboard } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const access = await requireIncentivesAccess(bId);
  if (!access.ok) return access;
  if (bId !== 2 && bId !== 3) {
    return { ok: false, error: "El programa de incentivos aplica a las cafeterías (Fonavi y Centro)." };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };

  try {
    const cfgRows = (await sql`
      SELECT ticket_base::float AS base, margin_pct::float AS margin, traffic_floor, pool_pct::float AS pool, levels
      FROM incentive_config
      WHERE business_id = ${bId} AND effective_month <= ${month}
      ORDER BY effective_month DESC LIMIT 1
    `) as { base: number; margin: number; traffic_floor: number; pool: number; levels: LevelRow[] }[];
    if (cfgRows.length === 0) return { ok: false, error: "Sin configuración del programa para esta sede." };
    const cfg = cfgRows[0];
    const config: IncentiveConfigT = {
      ticketBase: cfg.base,
      marginPct: cfg.margin,
      trafficFloor: cfg.traffic_floor,
      poolPct: cfg.pool,
      levels: cfg.levels,
    };

    const staff = (await sql`
      SELECT name, jornada, area FROM staff WHERE business_id = ${bId} AND active = true ORDER BY jornada, name
    `) as { name: string; jornada: StaffMember["jornada"]; area: string }[];

    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;

    const dailies = (await sql`
      SELECT date::text, personas, revenue::float AS revenue, items
      FROM upselling_daily
      WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}
      ORDER BY date
    `) as { date: string; personas: number | null; revenue: number | null; items: number | null }[];

    const events = (await sql`
      SELECT kind, event_at::text AS event_at, usuario, producto, amount::float AS amount, motivo
      FROM upselling_events
      WHERE business_id = ${bId} AND event_at >= ${monthStart} AND event_at < (${monthEnd}::date + 1)::timestamp
      ORDER BY event_at
    `) as { kind: ControlEvent["kind"]; event_at: string; usuario: string | null; producto: string | null; amount: number | null; motivo: string | null }[];

    const workers = (await sql`
      SELECT nombre, mesas, total::float AS total, period_end::text AS period_end
      FROM worker_period_sales
      WHERE business_id = ${bId} AND period_start >= ${monthStart} AND period_start <= ${monthEnd}
        AND imported_at = (SELECT MAX(imported_at) FROM worker_period_sales
                           WHERE business_id = ${bId} AND period_start >= ${monthStart} AND period_start <= ${monthEnd})
      ORDER BY total DESC
    `) as { nombre: string; mesas: number; total: number; period_end: string | null }[];

    const controlEvents: ControlEvent[] = events.map((e) => ({
      kind: e.kind, eventAt: e.event_at, usuario: e.usuario, producto: e.producto, amount: e.amount, motivo: e.motivo,
    }));
    const workerSales: WorkerSales[] = workers.map((w) => ({ nombre: w.nombre, mesas: w.mesas, total: w.total }));

    const progress = computeProgress(
      config,
      staff.map((s) => ({ ...s, active: true })),
      dailies,
      daysInMonth,
    );
    const flags = computeFlags(controlEvents, workerSales);

    return {
      ok: true,
      data: {
        month,
        config: { ...config, levelNames: config.levels.map((l) => l.nombre) },
        staff,
        dailies,
        progress,
        flags,
        workers: workers.map((w) => ({
          nombre: w.nombre,
          mesas: w.mesas,
          total: w.total,
          ticketMesa: w.mesas > 0 ? Math.round((w.total / w.mesas) * 100) / 100 : null,
          periodEnd: w.period_end,
        })),
        eventCounts: {
          anulaciones: events.filter((e) => e.kind === "anulacion").length,
          cortesias: events.filter((e) => e.kind === "cortesia").length,
          cambiosPrecio: events.filter((e) => e.kind === "cambio_precio").length,
        },
        isAdminSession: access.isAdmin,
      },
    };
  } catch (err) {
    console.error("[getIncentiveDashboard] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar el tablero" };
  }
}

export type UpsellCandidate = {
  name: string;
  category: string | null;
  /** Lo que deja cada unidad vendida (S/). */
  unitContribution: number;
  /** Unidades vendidas el último mes cargado (contexto de rotación). */
  unitsLastMonth: number;
  /** true = margen alto con poca rotación: el candidato ideal a empujar. */
  hiddenGem: boolean;
};

/**
 * Foco de upselling sugerido: los productos de ESTA sede que más dejan
 * por unidad (datos del PIC, último mes cargado). Expone SOLO lo que el
 * administrador necesita para dirigir el foco del día (sección 6 de la
 * política: "usando los márgenes del Pricing") — nada más.
 */
export async function getUpsellFocusCandidates(): Promise<
  | { ok: true; month: string; candidates: UpsellCandidate[] }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  const access = await requireIncentivesAccess(bId);
  if (!access.ok) return access;
  try {
    const monthRow = (await sql`
      SELECT MAX(month) AS m FROM product_month_sales WHERE business_id = ${bId} AND source = 'byte'
    `) as { m: string | null }[];
    const month = monthRow[0]?.m;
    if (!month) return { ok: false, error: "Aún no hay ventas por producto cargadas (módulo Productos)." };

    const rows = (await sql`
      SELECT COALESCE(p.name, s.product_name_raw) AS name,
             p.category,
             s.units::float AS units,
             s.revenue::float AS revenue,
             c.unit_cogs::float AS unit_cogs
      FROM product_month_sales s
      LEFT JOIN products p ON p.id = s.product_id
      LEFT JOIN LATERAL (
        SELECT unit_cogs FROM product_cost_snapshots cs
        WHERE cs.product_id = s.product_id ORDER BY cs.month DESC LIMIT 1
      ) c ON true
      WHERE s.business_id = ${bId} AND s.month = ${month} AND s.source = 'byte'
        AND s.units > 0 AND c.unit_cogs IS NOT NULL AND c.unit_cogs > 0
    `) as { name: string; category: string | null; units: number; revenue: number; unit_cogs: number }[];

    const withContribution = rows
      .map((r) => ({
        name: r.name,
        category: r.category,
        unitContribution: Math.round((r.revenue / r.units - r.unit_cogs) * 100) / 100,
        unitsLastMonth: Math.round(r.units),
      }))
      .filter((r) => r.unitContribution > 0)
      .sort((a, b) => b.unitContribution - a.unitContribution);

    const medianUnits =
      withContribution.length > 0
        ? [...withContribution].sort((a, b) => a.unitsLastMonth - b.unitsLastMonth)[Math.floor(withContribution.length / 2)].unitsLastMonth
        : 0;

    return {
      ok: true,
      month,
      candidates: withContribution.slice(0, 10).map((r) => ({
        ...r,
        hiddenGem: r.unitsLastMonth < medianUnits,
      })),
    };
  } catch (err) {
    console.error("[getUpsellFocusCandidates] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar candidatos" };
  }
}

/** Registro diario del administrador (personas, venta e items del día). */
export async function saveDailyEntry(input: {
  date: string;
  personas: number;
  revenue: number;
  items: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const access = await requireIncentivesAccess(bId);
  if (!access.ok) return access;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Fecha inválida." };
  if (!Number.isFinite(input.personas) || input.personas <= 0) return { ok: false, error: "Personas debe ser mayor a 0." };
  if (!Number.isFinite(input.revenue) || input.revenue <= 0) return { ok: false, error: "La venta debe ser mayor a 0." };
  if (input.items !== null && (!Number.isFinite(input.items) || input.items < 0)) return { ok: false, error: "Items inválido." };
  try {
    await sql`
      INSERT INTO upselling_daily (business_id, date, personas, revenue, items, source, updated_at)
      VALUES (${bId}, ${input.date}, ${input.personas}, ${input.revenue}, ${input.items}, 'manual', NOW())
      ON CONFLICT (business_id, date) DO UPDATE
        SET personas = EXCLUDED.personas, revenue = EXCLUDED.revenue,
            items = EXCLUDED.items, source = 'manual', updated_at = NOW()
    `;
    revalidatePath("/[negocio]/incentivos", "page");
    return { ok: true };
  } catch (err) {
    console.error("[saveDailyEntry] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al guardar el día" };
  }
}

/** Import idempotente de un reporte de control de Byte (rango detectado). */
export async function importControlReport(input: {
  kind: "anulaciones" | "cortesias" | "cambios_precio" | "ventas_trabajador";
  fileName: string | null;
  events: ParsedEvent[];
  workers: ParsedWorkerSales[];
  periodStart: string | null;
  periodEnd: string | null;
}): Promise<{ ok: true; imported: number } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const access = await requireIncentivesAccess(bId);
  if (!access.ok) return access;
  try {
    const batchId = crypto.randomUUID();
    if (input.kind === "ventas_trabajador") {
      if (input.workers.length === 0) return { ok: false, error: "Sin trabajadores en el archivo." };
      const ps = input.periodStart ?? new Date().toISOString().slice(0, 8) + "01";
      const pe = input.periodEnd ?? new Date().toISOString().slice(0, 10);
      await sql.transaction([
        sql`INSERT INTO import_batches (id, business_id, file_name, date_range_start, date_range_end, movements_count, status, rollback_available, notes)
            VALUES (${batchId}, ${bId}, ${input.fileName}, ${ps}, ${pe}, ${input.workers.length}, 'completed', false, ${"Incentivos · ventas por trabajador"})`,
        sql`DELETE FROM worker_period_sales WHERE business_id = ${bId} AND period_start = ${ps} AND period_end = ${pe}`,
        ...input.workers.map((w) => sql`
          INSERT INTO worker_period_sales (business_id, period_start, period_end, dni, nombre, mesas, total, import_batch_id)
          VALUES (${bId}, ${ps}, ${pe}, ${w.dni}, ${w.nombre}, ${w.mesas}, ${w.total}, ${batchId})`),
      ]);
      revalidatePath("/[negocio]/incentivos", "page");
      return { ok: true, imported: input.workers.length };
    }

    if (input.events.length === 0) return { ok: false, error: "Sin eventos en el archivo." };
    const kindDb = input.kind === "anulaciones" ? "anulacion" : input.kind === "cortesias" ? "cortesia" : "cambio_precio";
    const ps = input.periodStart!;
    const pe = input.periodEnd!;
    await sql.transaction([
      sql`INSERT INTO import_batches (id, business_id, file_name, date_range_start, date_range_end, movements_count, status, rollback_available, notes)
          VALUES (${batchId}, ${bId}, ${input.fileName}, ${ps}, ${pe}, ${input.events.length}, 'completed', false, ${"Incentivos · " + input.kind})`,
      sql`DELETE FROM upselling_events
          WHERE business_id = ${bId} AND kind = ${kindDb}
            AND event_at >= ${ps} AND event_at < (${pe}::date + 1)::timestamp`,
      ...input.events.map((e) => sql`
        INSERT INTO upselling_events (business_id, kind, event_at, usuario, producto, amount, motivo, source, import_batch_id)
        VALUES (${bId}, ${kindDb}, ${e.eventAt}, ${e.usuario}, ${e.producto}, ${e.amount}, ${e.motivo}, 'byte', ${batchId})`),
    ]);
    revalidatePath("/[negocio]/incentivos", "page");
    return { ok: true, imported: input.events.length };
  } catch (err) {
    console.error("[importControlReport] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al importar" };
  }
}
