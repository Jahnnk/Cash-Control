"use server";

/**
 * Tiempos de atención medidos · Actions.
 *
 * El encargado de salón (verificador) cronometra cada atención:
 *   - mostrador: comanda → despacho
 *   - mesa:      pedido  → servido
 *   - delivery:  registro del pedido → entrega al motorizado
 *
 * Fiabilidad: el timer se persiste al INICIAR (started_at = now del
 * servidor). El tiempo transcurrido y la duración final se calculan
 * contra el reloj del servidor, no del teléfono — sobrevive recargas
 * y bloqueos de pantalla. Al cerrar cada atención, el promedio del día
 * se escribe automáticamente en upselling_daily (tiempo_atencion_min y
 * tiempo_mesa_min), que es lo que el admin/CEO ven en la tabla semanal:
 * el KPI deja de escribirse a mano y pasa a ser dato medido.
 *
 * Acceso: sesión completa, admin de la sede o verificador de la sede.
 * Resiliente pre-migración: sin la tabla service_timings, avisos claros.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole } from "@/lib/session-access";
import type { ServiceKind, ServiceTiming } from "@/lib/service-timing";

const sql = neon(process.env.DATABASE_URL!);

/** Metas por defecto (min) si kpi_targets aún no las tiene. */
const DEFAULT_META = { mostrador: 6, mesa: 15, delivery: 20 };

function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** true si la sesión puede operar el cronómetro de ESTA sede. */
async function hasAccess(bId: number): Promise<boolean> {
  const role = await getSessionRole();
  if (role?.kind === "full") return true;
  return (role?.kind === "admin" || role?.kind === "verif") && role.sede === bId;
}

type Row = {
  id: string; kind: ServiceKind; label: string;
  started_at: string; ended_at: string | null; duration_seconds: number | null;
};

function toTiming(r: Row): ServiceTiming {
  return {
    id: r.id, kind: r.kind, label: r.label,
    startedAt: r.started_at, endedAt: r.ended_at, durationSeconds: r.duration_seconds,
  };
}

/** Metas de tiempo de la sede (mostrador/mesa/delivery), con fallback. */
async function loadMetas(bId: number, month: string): Promise<{ mostrador: number | null; mesa: number | null; delivery: number | null }> {
  try {
    const rows = (await sql`
      SELECT tiempo_max_min::float AS mostrador, tiempo_mesa_max_min::float AS mesa,
             tiempo_delivery_max_min::float AS delivery
      FROM kpi_targets
      WHERE business_id = ${bId} AND effective_month <= ${month}
      ORDER BY effective_month DESC LIMIT 1
    `) as { mostrador: number | null; mesa: number | null; delivery: number | null }[];
    if (rows.length > 0) {
      return {
        mostrador: rows[0].mostrador ?? DEFAULT_META.mostrador,
        mesa: rows[0].mesa ?? DEFAULT_META.mesa,
        delivery: rows[0].delivery ?? DEFAULT_META.delivery,
      };
    }
  } catch {
    // Columna de delivery pendiente de migración → sin ella.
    try {
      const rows = (await sql`
        SELECT tiempo_max_min::float AS mostrador, tiempo_mesa_max_min::float AS mesa
        FROM kpi_targets
        WHERE business_id = ${bId} AND effective_month <= ${month}
        ORDER BY effective_month DESC LIMIT 1
      `) as { mostrador: number | null; mesa: number | null }[];
      if (rows.length > 0) {
        return {
          mostrador: rows[0].mostrador ?? DEFAULT_META.mostrador,
          mesa: rows[0].mesa ?? DEFAULT_META.mesa,
          delivery: DEFAULT_META.delivery,
        };
      }
    } catch {
      // kpi_targets pendiente de migración → defaults
    }
  }
  return { ...DEFAULT_META };
}

/**
 * Recalcula el promedio medido del día y lo escribe en upselling_daily
 * (una sola fuente de verdad para el KPI). Resiliente si falta la
 * columna de tiempo de mesa (migración PR #70).
 */
async function syncDailyFromMeasurements(bId: number, date: string): Promise<void> {
  const rows = (await sql`
    SELECT kind, AVG(duration_seconds)::float AS avg_s, COUNT(*)::int AS n
    FROM service_timings
    WHERE business_id = ${bId} AND date = ${date} AND ended_at IS NOT NULL
    GROUP BY kind
  `) as { kind: ServiceKind; avg_s: number; n: number }[];
  const most = rows.find((r) => r.kind === "mostrador");
  const mesa = rows.find((r) => r.kind === "mesa");
  const deli = rows.find((r) => r.kind === "delivery");
  const mostMin = most ? Math.round((most.avg_s / 60) * 10) / 10 : null;
  const mesaMin = mesa ? Math.round((mesa.avg_s / 60) * 10) / 10 : null;
  const deliMin = deli ? Math.round((deli.avg_s / 60) * 10) / 10 : null;
  try {
    await sql`
      INSERT INTO upselling_daily (business_id, date, tiempo_atencion_min, tiempo_mesa_min, tiempo_delivery_min, source, updated_at)
      VALUES (${bId}, ${date}, ${mostMin}, ${mesaMin}, ${deliMin}, 'medido', NOW())
      ON CONFLICT (business_id, date) DO UPDATE
        SET tiempo_atencion_min = COALESCE(EXCLUDED.tiempo_atencion_min, upselling_daily.tiempo_atencion_min),
            tiempo_mesa_min = COALESCE(EXCLUDED.tiempo_mesa_min, upselling_daily.tiempo_mesa_min),
            tiempo_delivery_min = COALESCE(EXCLUDED.tiempo_delivery_min, upselling_daily.tiempo_delivery_min),
            updated_at = NOW()
    `;
  } catch {
    // Columna tiempo_delivery_min pendiente → mostrador + mesa.
    try {
      await sql`
        INSERT INTO upselling_daily (business_id, date, tiempo_atencion_min, tiempo_mesa_min, source, updated_at)
        VALUES (${bId}, ${date}, ${mostMin}, ${mesaMin}, 'medido', NOW())
        ON CONFLICT (business_id, date) DO UPDATE
          SET tiempo_atencion_min = COALESCE(EXCLUDED.tiempo_atencion_min, upselling_daily.tiempo_atencion_min),
              tiempo_mesa_min = COALESCE(EXCLUDED.tiempo_mesa_min, upselling_daily.tiempo_mesa_min),
              updated_at = NOW()
      `;
    } catch {
      // Columna tiempo_mesa_min pendiente → escribe solo mostrador.
      await sql`
        INSERT INTO upselling_daily (business_id, date, tiempo_atencion_min, source, updated_at)
        VALUES (${bId}, ${date}, ${mostMin}, 'medido', NOW())
        ON CONFLICT (business_id, date) DO UPDATE
          SET tiempo_atencion_min = COALESCE(EXCLUDED.tiempo_atencion_min, upselling_daily.tiempo_atencion_min),
              updated_at = NOW()
      `;
    }
  }
}

export type TimingView = {
  running: ServiceTiming[];
  completedToday: ServiceTiming[];
  metas: { mostrador: number | null; mesa: number | null; delivery: number | null };
  tableReady: boolean;
};

/** Cronómetros en curso + atenciones completas de hoy + metas. */
export async function getServiceTimings(): Promise<
  | { ok: true; data: TimingView }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  if (!(await hasAccess(bId))) return { ok: false, error: "Sin acceso." };
  const date = todayLima();
  const metas = await loadMetas(bId, date.slice(0, 7));
  try {
    const rows = (await sql`
      SELECT id::text, kind, label, started_at::text AS started_at,
             ended_at::text AS ended_at, duration_seconds
      FROM service_timings
      WHERE business_id = ${bId} AND date = ${date}
      ORDER BY started_at DESC
    `) as Row[];
    return {
      ok: true,
      data: {
        running: rows.filter((r) => r.ended_at === null).map(toTiming),
        completedToday: rows.filter((r) => r.ended_at !== null).map(toTiming),
        metas,
        tableReady: true,
      },
    };
  } catch {
    return { ok: true, data: { running: [], completedToday: [], metas, tableReady: false } };
  }
}

/** Inicia un cronómetro (comanda/pedido tomado). */
export async function startTiming(input: {
  kind: ServiceKind;
  label?: string | null;
}): Promise<{ ok: true; timing: ServiceTiming } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!(await hasAccess(bId))) return { ok: false, error: "Sin acceso." };
  if (input.kind !== "mostrador" && input.kind !== "mesa" && input.kind !== "delivery") return { ok: false, error: "Tipo inválido." };
  const date = todayLima();
  const role = await getSessionRole();
  const by = role?.kind ?? "?";
  try {
    // Etiqueta por defecto: correlativo del tipo en el día (Mostrador #3 / Mesa …).
    let label = (input.label ?? "").trim();
    if (!label) {
      const c = (await sql`
        SELECT COUNT(*)::int AS n FROM service_timings
        WHERE business_id = ${bId} AND date = ${date} AND kind = ${input.kind}
      `) as { n: number }[];
      const n = (c[0]?.n ?? 0) + 1;
      label = input.kind === "mostrador" ? `Mostrador #${n}` : input.kind === "mesa" ? `Mesa ${n}` : `Delivery #${n}`;
    }
    const rows = (await sql`
      INSERT INTO service_timings (business_id, date, kind, label, started_at, created_by)
      VALUES (${bId}, ${date}, ${input.kind}, ${label}, NOW(), ${by})
      RETURNING id::text, kind, label, started_at::text AS started_at,
                ended_at::text AS ended_at, duration_seconds
    `) as Row[];
    revalidatePath("/[negocio]/verificacion", "page");
    return { ok: true, timing: toTiming(rows[0]) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/service_timings/.test(msg)) {
      return { ok: false, error: "Falta la migración del cronómetro (tabla service_timings) — avísale a Jahnn." };
    }
    console.error("[startTiming] failed:", err);
    return { ok: false, error: msg || "Error al iniciar el cronómetro" };
  }
}

/** Cierra un cronómetro (despachado/servido) y actualiza el KPI del día. */
export async function stopTiming(input: {
  id: string;
}): Promise<{ ok: true; timing: ServiceTiming } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!(await hasAccess(bId))) return { ok: false, error: "Sin acceso." };
  try {
    const rows = (await sql`
      UPDATE service_timings
      SET ended_at = NOW(),
          duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - started_at))::int)
      WHERE id = ${input.id}::uuid AND business_id = ${bId} AND ended_at IS NULL
      RETURNING id::text, kind, label, started_at::text AS started_at,
                ended_at::text AS ended_at, duration_seconds, date::text AS date
    `) as (Row & { date: string })[];
    if (rows.length === 0) return { ok: false, error: "Ese cronómetro ya no está en curso." };
    await syncDailyFromMeasurements(bId, rows[0].date);
    revalidatePath("/[negocio]/verificacion", "page");
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true, timing: toTiming(rows[0]) };
  } catch (err) {
    console.error("[stopTiming] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cerrar el cronómetro" };
  }
}

/** Descarta una medición (timer abandonado o error). No cuenta al promedio. */
export async function discardTiming(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!(await hasAccess(bId))) return { ok: false, error: "Sin acceso." };
  try {
    const rows = (await sql`
      DELETE FROM service_timings
      WHERE id = ${input.id}::uuid AND business_id = ${bId}
      RETURNING date::text AS date
    `) as { date: string }[];
    if (rows.length > 0) await syncDailyFromMeasurements(bId, rows[0].date);
    revalidatePath("/[negocio]/verificacion", "page");
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    console.error("[discardTiming] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al descartar" };
  }
}
