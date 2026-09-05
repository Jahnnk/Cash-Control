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
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { refrescarRosterSiHaceFalta } from "./roster-sync";
import { getTodosLosDiasPausados } from "./dias-no-operativos";
import {
  indicePausados, sinDiasPausados, diasOperativosDelMes,
} from "@/lib/incentivos/dias-no-operativos";
import { filasVentasTrabajador, borrarPeriodosQuePisa } from "@/lib/incentivos/ventas-trabajador-sql";
import { ventasPorTrabajador, type FilaPeriodo } from "@/lib/incentivos/ventas-trabajador";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import {
  pickDailyFocus,
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

/** Sesión completa o admin de la sede indicada — si no, error.
 * El verificador NO pasa por aquí: su rol es solo la segunda firma. */
async function requireIncentivesAccess(bId: number): Promise<{ ok: true; isAdmin: boolean } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind === "full") return { ok: true, isAdmin: false };
  if (role?.kind === "admin" && role.sede === bId) return { ok: true, isAdmin: true };
  return { ok: false, error: "Sin acceso a los incentivos de esta sede." };
}

type LevelRow = { nombre: string; delta: number; bono_tc: number; bono_mt: number; bono_admin: number; premio_mv: number };

/** Estado de una bandera atendida (resuelta o descartada con nota). */
export type FlagResolution = {
  status: "resuelta" | "descartada";
  nota: string | null;
  resolvedBy: string;   // 'direccion' | 'admin'
  resolvedAt: string;
};

export type DashboardDaily = {
  date: string;
  personas: number | null;
  revenue: number | null;
  items: number | null;
  nps: number | null;
  mermasSoles: number | null;
  tiempoMin: number | null;
  tiempoMesaMin: number | null;
  tiempoDeliveryMin: number | null;
  /** Delivery del día (dentro de personas/revenue) — se excluye del
   * ticket del programa. null = no registrado. */
  deliveryPedidos: number | null;
  deliveryVenta: number | null;
  /** Consumo del personal del día (20% dscto) — también excluido. */
  personalPedidos: number | null;
  personalVenta: number | null;
};

export type IncentiveDashboard = {
  month: string;
  config: IncentiveConfigT & { levelNames: string[] };
  staff: { name: string; jornada: string; area: string }[];
  dailies: DashboardDaily[];
  /** Segunda firma del conteo por día (verificador de mando medio). */
  verifications: Record<string, { status: "confirmado" | "observado"; nota: string | null }>;
  progress: IncentiveProgress;
  flags: (ControlFlag & { resolution: FlagResolution | null })[];
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

  // El panel muestra el equipo REAL: si la copia del roster de Planilla
  // quedó vieja, se refresca antes de proyectar los bonos. Va después
  // de validar el permiso, nunca antes.
  await refrescarRosterSiHaceFalta(bId);
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
      SELECT name, jornada, area, horas_semanales::float AS "horasSemanales"
        FROM staff WHERE business_id = ${bId} AND active = true ORDER BY jornada, name
    `) as { name: string; jornada: StaffMember["jornada"]; area: string; horasSemanales: number | null }[];

    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth).padStart(2, "0")}`;

    // Incluye los KPIs del día para poder EDITAR cualquier registro
    // precargado (fallbacks si las columnas nuevas aún no migran).
    let dailies: DashboardDaily[];
    try {
      dailies = (await sql`
        SELECT date::text, personas, revenue::float AS revenue, items,
               nps::float AS nps, mermas_soles::float AS "mermasSoles",
               tiempo_atencion_min::float AS "tiempoMin", tiempo_mesa_min::float AS "tiempoMesaMin",
               tiempo_delivery_min::float AS "tiempoDeliveryMin",
               delivery_pedidos AS "deliveryPedidos", delivery_venta::float AS "deliveryVenta",
               personal_pedidos AS "personalPedidos", personal_venta::float AS "personalVenta"
        FROM upselling_daily
        WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}
        ORDER BY date
      `) as DashboardDaily[];
    } catch {
      try {
        const rows = (await sql`
          SELECT date::text, personas, revenue::float AS revenue, items,
                 nps::float AS nps, mermas_soles::float AS "mermasSoles",
                 tiempo_atencion_min::float AS "tiempoMin", tiempo_mesa_min::float AS "tiempoMesaMin",
                 tiempo_delivery_min::float AS "tiempoDeliveryMin",
                 delivery_pedidos AS "deliveryPedidos", delivery_venta::float AS "deliveryVenta"
          FROM upselling_daily
          WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}
          ORDER BY date
        `) as Omit<DashboardDaily, "personalPedidos" | "personalVenta">[];
        dailies = rows.map((r) => ({ ...r, personalPedidos: null, personalVenta: null }));
      } catch {
        const rows = (await sql`
          SELECT date::text, personas, revenue::float AS revenue, items
          FROM upselling_daily
          WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}
          ORDER BY date
        `) as { date: string; personas: number | null; revenue: number | null; items: number | null }[];
        dailies = rows.map((r) => ({
          ...r, nps: null, mermasSoles: null, tiempoMin: null, tiempoMesaMin: null,
          tiempoDeliveryMin: null, deliveryPedidos: null, deliveryVenta: null,
          personalPedidos: null, personalVenta: null,
        }));
      }
    }

    const events = (await sql`
      SELECT kind, event_at::text AS event_at, usuario, producto, amount::float AS amount, motivo
      FROM upselling_events
      WHERE business_id = ${bId} AND event_at >= ${monthStart} AND event_at < (${monthEnd}::date + 1)::timestamp
      ORDER BY event_at
    `) as { kind: ControlEvent["kind"]; event_at: string; usuario: string | null; producto: string | null; amount: number | null; motivo: string | null }[];

    // Solapes resueltos al leer: la tabla puede tener versiones viejas
    // de un mismo rango y aquí solo pesan las vigentes.
    const workers = ventasPorTrabajador(
      (await filasVentasTrabajador(sql, bId, monthStart, monthEnd)) as FilaPeriodo[],
    );

    const controlEvents: ControlEvent[] = events.map((e) => ({
      kind: e.kind, eventAt: e.event_at, usuario: e.usuario, producto: e.producto, amount: e.amount, motivo: e.motivo,
    }));
    const workerSales: WorkerSales[] = workers.map((w) => ({ nombre: w.nombre, mesas: w.mesas, total: w.total }));

    // Días que dirección marcó como NO operativos (corte de luz,
    // feriado, local cerrado). Se sacan ANTES de que el motor calcule:
    // el motor no tiene por qué saber de cortes de luz, recibe los días
    // que cuentan y hace su trabajo (su lógica no se toca).
    //
    // OJO: solo se excluyen del TICKET y del PISO DE TRÁFICO. La venta
    // de un día parcial sigue en ventas, caja y reportes — esa plata
    // entró de verdad (decisión de Jahnn, 22-ago-2026).
    const pausadosMes = await getTodosLosDiasPausados(monthStart);
    const indice = indicePausados(pausadosMes);
    const diasQueCuentan = sinDiasPausados(dailies, indice, bId);
    const diasOperativos = diasOperativosDelMes(daysInMonth, month, pausadosMes, bId);

    const progress = computeProgress(
      config,
      staff.map((s) => ({ ...s, active: true })),
      diasQueCuentan,
      diasOperativos,
    );
    const flags = computeFlags(controlEvents, workerSales);

    // Segunda firma: estado por día + banderas de días observados o sin
    // verificar (resiliente si la migración aún no corre).
    const verifications: IncentiveDashboard["verifications"] = {};
    try {
      const vrows = (await sql`
        SELECT date::text, status, nota FROM daily_verifications
        WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}
      `) as { date: string; status: "confirmado" | "observado"; nota: string | null }[];
      for (const v of vrows) verifications[v.date] = { status: v.status, nota: v.nota };
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
      const observed = vrows.filter((v) => v.status === "observado");
      for (const o of observed) {
        flags.unshift({
          id: `verif-observado-${o.date}`,
          severity: "alta",
          usuario: null,
          title: `Conteo del ${o.date.slice(8)}/${o.date.slice(5, 7)} OBSERVADO por el verificador`,
          detail: o.nota ?? "Sin nota.",
        });
      }
      const unverified = dailies.filter((d) => d.date < today && (d.revenue ?? 0) > 0 && !verifications[d.date]).length;
      if (unverified >= 2) {
        flags.push({
          id: "verif-pendientes",
          severity: "media",
          usuario: null,
          title: `${unverified} día(s) registrados sin la segunda firma del verificador`,
          detail: "El ticket que paga bonos requiere doble firma diaria: registra el administrador, confirma el mando medio.",
        });
      }
    } catch {
      // tabla daily_verifications pendiente de migración
    }

    // Estado de atención de cada bandera (resuelta/descartada con nota).
    let resolutions: Record<string, FlagResolution> = {};
    try {
      const rrows = (await sql`
        SELECT flag_id, status, nota, resolved_by, resolved_at::text AS resolved_at
        FROM control_flag_status
        WHERE business_id = ${bId} AND month = ${month}
      `) as { flag_id: string; status: "resuelta" | "descartada"; nota: string | null; resolved_by: string; resolved_at: string }[];
      resolutions = Object.fromEntries(
        rrows.map((r) => [r.flag_id, { status: r.status, nota: r.nota, resolvedBy: r.resolved_by, resolvedAt: r.resolved_at }]),
      );
    } catch {
      // tabla control_flag_status pendiente de migración
    }

    return {
      ok: true,
      data: {
        month,
        config: { ...config, levelNames: config.levels.map((l) => l.nombre) },
        staff,
        dailies,
        verifications,
        progress,
        flags: flags.map((f) => ({ ...f, resolution: resolutions[f.id] ?? null })),
        workers: workers.map((w) => ({
          nombre: w.nombre,
          mesas: w.mesas,
          total: w.total,
          ticketMesa: w.mesas > 0 ? Math.round((w.total / w.mesas) * 100) / 100 : null,
          periodEnd: w.periodEnd,
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

    // Pozo de hasta 24 buenos candidatos, y cada día se muestran 10
    // DISTINTOS rotando con la fecha (feedback del admin: "siempre son
    // los mismos"). La calidad no baja: todos salen del top del mes.
    const pool = withContribution.slice(0, 24).map((r) => ({
      ...r,
      hiddenGem: r.unitsLastMonth < medianUnits,
    }));
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

    return {
      ok: true,
      month,
      candidates: pickDailyFocus(pool, 10, hoy),
    };
  } catch (err) {
    console.error("[getUpsellFocusCandidates] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar candidatos" };
  }
}

/**
 * Registro diario del administrador (personas, venta e items del día).
 * Re-guardar corrige — cualquier día, cualquier campo. Regla de
 * integridad de la doble firma: si el día YA estaba firmado por el
 * verificador y cambian personas o venta (los números que él firmó),
 * la firma se anula y el verificador debe volver a firmar.
 */
export async function saveDailyEntry(input: {
  date: string;
  personas: number;
  revenue: number;
  items: number | null;
  /** Delivery del día (dentro de personas/revenue). null = sin delivery. */
  deliveryPedidos?: number | null;
  deliveryVenta?: number | null;
  /** Consumo del personal del día (20% dscto). null = sin consumo. */
  personalPedidos?: number | null;
  personalVenta?: number | null;
}): Promise<{ ok: true; firmaAnulada: boolean } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const access = await requireIncentivesAccess(bId);
  if (!access.ok) return access;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Fecha inválida." };
  if (!Number.isFinite(input.personas) || input.personas <= 0) return { ok: false, error: "Personas debe ser mayor a 0." };
  if (!Number.isFinite(input.revenue) || input.revenue <= 0) return { ok: false, error: "La venta debe ser mayor a 0." };
  if (input.items !== null && (!Number.isFinite(input.items) || input.items < 0)) return { ok: false, error: "Items inválido." };
  const dPed = input.deliveryPedidos ?? null;
  const dVen = input.deliveryVenta ?? null;
  if (dPed !== null && (!Number.isInteger(dPed) || dPed < 0)) return { ok: false, error: "Pedidos delivery inválido (entero ≥ 0)." };
  if (dVen !== null && (!Number.isFinite(dVen) || dVen < 0)) return { ok: false, error: "Venta delivery inválida." };
  // El delivery vive DENTRO del total del día: no puede superarlo.
  if (dPed !== null && dPed >= input.personas) return { ok: false, error: "Los pedidos delivery no pueden ser todas las personas del día." };
  if (dVen !== null && dVen > input.revenue) return { ok: false, error: "La venta delivery no puede superar la venta total del día." };
  if ((dPed !== null && dPed > 0) !== (dVen !== null && dVen > 0)) {
    return { ok: false, error: "Registra pedidos Y venta de delivery juntos (o ninguno)." };
  }
  const pPed = input.personalPedidos ?? null;
  const pVen = input.personalVenta ?? null;
  if (pPed !== null && (!Number.isInteger(pPed) || pPed < 0)) return { ok: false, error: "Pedidos del personal inválido (entero ≥ 0)." };
  if (pVen !== null && (!Number.isFinite(pVen) || pVen < 0)) return { ok: false, error: "Venta del personal inválida." };
  if ((pPed !== null && pPed > 0) !== (pVen !== null && pVen > 0)) {
    return { ok: false, error: "Registra pedidos Y venta del personal juntos (o ninguno)." };
  }
  // Delivery + personal viven DENTRO del total del día.
  if ((dPed ?? 0) + (pPed ?? 0) >= input.personas) {
    return { ok: false, error: "Delivery + personal no pueden ser todas las personas del día." };
  }
  if ((dVen ?? 0) + (pVen ?? 0) > input.revenue) {
    return { ok: false, error: "Delivery + personal no pueden superar la venta total del día." };
  }
  try {
    // ¿Cambian los números firmados de un día ya existente?
    const prev = (await sql`
      SELECT personas, revenue::float AS revenue FROM upselling_daily
      WHERE business_id = ${bId} AND date = ${input.date}
    `) as { personas: number | null; revenue: number | null }[];
    const numbersChanged =
      prev.length > 0 &&
      (prev[0].personas !== input.personas ||
        Math.round((prev[0].revenue ?? 0) * 100) !== Math.round(input.revenue * 100));

    await sql`
      INSERT INTO upselling_daily (business_id, date, personas, revenue, items, delivery_pedidos, delivery_venta, personal_pedidos, personal_venta, source, updated_at)
      VALUES (${bId}, ${input.date}, ${input.personas}, ${input.revenue}, ${input.items}, ${dPed}, ${dVen}, ${pPed}, ${pVen}, 'manual', NOW())
      ON CONFLICT (business_id, date) DO UPDATE
        SET personas = EXCLUDED.personas, revenue = EXCLUDED.revenue,
            items = EXCLUDED.items,
            delivery_pedidos = EXCLUDED.delivery_pedidos, delivery_venta = EXCLUDED.delivery_venta,
            personal_pedidos = EXCLUDED.personal_pedidos, personal_venta = EXCLUDED.personal_venta,
            source = 'manual', updated_at = NOW()
    `.then(undefined, async (err: unknown) => {
      // Columnas nuevas pendientes de migración: si el admin NO tecleó
      // esos datos, guarda el resto (nada se pierde); si SÍ los tecleó,
      // avisar es mejor que botar su dato en silencio.
      if (dPed !== null || dVen !== null || pPed !== null || pVen !== null) throw err;
      await sql`
        INSERT INTO upselling_daily (business_id, date, personas, revenue, items, source, updated_at)
        VALUES (${bId}, ${input.date}, ${input.personas}, ${input.revenue}, ${input.items}, 'manual', NOW())
        ON CONFLICT (business_id, date) DO UPDATE
          SET personas = EXCLUDED.personas, revenue = EXCLUDED.revenue,
              items = EXCLUDED.items, source = 'manual', updated_at = NOW()
      `;
    });

    let firmaAnulada = false;
    if (numbersChanged) {
      try {
        const deleted = (await sql`
          DELETE FROM daily_verifications
          WHERE business_id = ${bId} AND date = ${input.date}
          RETURNING date
        `) as { date: string }[];
        firmaAnulada = deleted.length > 0;
      } catch {
        // tabla daily_verifications pendiente de migración — nada que anular
      }
    }

    revalidatePath("/[negocio]/panel", "page");
    revalidatePath("/[negocio]/verificacion", "page");
    return { ok: true, firmaAnulada };
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
        // Fuera los períodos que este archivo PISA (antes solo se borraba
      // el rango IDÉNTICO, y por eso se acumulaban solapes).
      borrarPeriodosQuePisa(sql, bId, ps, pe),
        ...input.workers.map((w) => sql`
          INSERT INTO worker_period_sales (business_id, period_start, period_end, dni, nombre, mesas, total, import_batch_id)
          VALUES (${bId}, ${ps}, ${pe}, ${w.dni}, ${w.nombre}, ${w.mesas}, ${w.total}, ${batchId})`),
      ]);
      revalidatePath("/[negocio]/panel", "page");
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
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true, imported: input.events.length };
  } catch (err) {
    console.error("[importControlReport] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al importar" };
  }
}

// ─────────────────────────────────────────────────────────────────
// Banderas de control · atender (resolver / descartar) y reabrir.
// Queda registrado QUIÉN la atendió (admin o dirección) y con qué
// nota — las banderas de la segunda firma (verif-*) NO pasan por
// aquí: se resuelven re-firmando en la pantalla de Verificación.
// ─────────────────────────────────────────────────────────────────

export async function setFlagStatus(input: {
  month: string;
  flagId: string;
  status: "resuelta" | "descartada";
  nota: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const access = await requireIncentivesAccess(bId);
  if (!access.ok) return access;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) return { ok: false, error: "Mes inválido." };
  if (!input.flagId || input.flagId.startsWith("verif-")) {
    return { ok: false, error: "Las banderas de la segunda firma se resuelven en la pantalla de Verificación." };
  }
  if (input.status === "descartada" && !input.nota?.trim()) {
    return { ok: false, error: "Para descartar una bandera, la nota es obligatoria: ¿por qué no aplica?" };
  }
  try {
    const resolvedBy = access.isAdmin ? "admin" : "direccion";
    await sql`
      INSERT INTO control_flag_status (business_id, month, flag_id, status, nota, resolved_by, resolved_at)
      VALUES (${bId}, ${input.month}, ${input.flagId}, ${input.status}, ${input.nota?.trim() || null}, ${resolvedBy}, NOW())
      ON CONFLICT (business_id, month, flag_id) DO UPDATE
        SET status = EXCLUDED.status, nota = EXCLUDED.nota,
            resolved_by = EXCLUDED.resolved_by, resolved_at = NOW()
    `;
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/control_flag_status/.test(msg)) {
      return { ok: false, error: "Falta la migración de banderas (tabla control_flag_status) — avísale a Jahnn." };
    }
    console.error("[setFlagStatus] failed:", err);
    return { ok: false, error: msg || "Error al atender la bandera" };
  }
}

export async function reopenFlag(input: {
  month: string;
  flagId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const access = await requireIncentivesAccess(bId);
  if (!access.ok) return access;
  try {
    await sql`
      DELETE FROM control_flag_status
      WHERE business_id = ${bId} AND month = ${input.month} AND flag_id = ${input.flagId}
    `;
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    console.error("[reopenFlag] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al reabrir la bandera" };
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Base del programa (ticket base)

   Es el número que manda sobre TODAS las metas: cada nivel se calcula
   como base + delta. Dos candados innegociables:

   1. Solo la dirección. El bono del admin depende de este número —
      bajarlo le facilita cobrar. Nadie mueve su propia valla.
   2. Vigencia por mes. Un mes ya liquidado quedó congelado en su acta;
      cambiarle la base re-escribiría bonos ya pagados.
   ───────────────────────────────────────────────────────────────────── */

export type BaseEditorData = {
  /** Base vigente para el mes consultado. */
  ticketBase: number;
  /** Mes de la config que hoy gobierna (puede ser anterior al consultado). */
  governingMonth: string;
  /** Deltas de los niveles — para previsualizar las metas resultantes. */
  levels: { nombre: string; delta: number }[];
  /** Ticket REAL de meses cerrados: la evidencia para fijar la base. */
  reference: { month: string; ticket: number; dias: number }[];
  /** El mes consultado ya tiene acta de liquidación (base congelada). */
  liquidated: boolean;
};

export async function getBaseEditor(
  month: string,
): Promise<{ ok: true; data: BaseEditorData } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!(await requireFullSession())) {
    return { ok: false, error: "La base del programa la ajusta solo la dirección." };
  }
  if (bId !== 2 && bId !== 3) {
    return { ok: false, error: "El programa de incentivos aplica a las cafeterías (Fonavi y Centro)." };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };

  try {
    const cfg = (await sql`
      SELECT effective_month, ticket_base::float AS base, levels
      FROM incentive_config
      WHERE business_id = ${bId} AND effective_month <= ${month}
      ORDER BY effective_month DESC LIMIT 1
    `) as { effective_month: string; base: number; levels: LevelRow[] }[];
    if (cfg.length === 0) return { ok: false, error: "Sin configuración del programa para esta sede." };

    // Referencia: solo meses CERRADOS. El mes en curso está a medias y
    // arrastraría la base hacia abajo (mismo patrón que el punto de
    // equilibrio y el presupuesto).
    const thisMonth = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
    const ref = (await sql`
      SELECT to_char(date, 'YYYY-MM') AS month,
             SUM(revenue)::float AS revenue, SUM(personas)::int AS personas, COUNT(*)::int AS dias
      FROM upselling_daily
      WHERE business_id = ${bId} AND personas > 0 AND revenue > 0
        AND to_char(date, 'YYYY-MM') < ${thisMonth}
      GROUP BY 1 ORDER BY 1 DESC LIMIT 3
    `) as { month: string; revenue: number; personas: number; dias: number }[];

    const liq = (await sql`
      SELECT 1 FROM incentive_liquidations WHERE business_id = ${bId} AND month = ${month} LIMIT 1
    `) as unknown[];

    return {
      ok: true,
      data: {
        ticketBase: cfg[0].base,
        governingMonth: cfg[0].effective_month,
        levels: (cfg[0].levels ?? []).map((l) => ({ nombre: l.nombre, delta: l.delta })),
        reference: ref.map((r) => ({
          month: r.month,
          ticket: Math.round((r.revenue / r.personas) * 100) / 100,
          dias: r.dias,
        })),
        liquidated: liq.length > 0,
      },
    };
  } catch (e) {
    console.error("[getBaseEditor]", e);
    return { ok: false, error: "No pude leer la base del programa." };
  }
}

export async function saveIncentiveBase(input: {
  effectiveMonth: string;
  ticketBase: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!(await requireFullSession())) {
    return { ok: false, error: "La base del programa la ajusta solo la dirección." };
  }
  if (bId !== 2 && bId !== 3) {
    return { ok: false, error: "El programa de incentivos aplica a las cafeterías (Fonavi y Centro)." };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.effectiveMonth)) return { ok: false, error: "Mes inválido." };
  const base = Number(input.ticketBase);
  if (!Number.isFinite(base) || base <= 0) return { ok: false, error: "La base debe ser un monto mayor a cero." };
  if (base > 200) return { ok: false, error: "Esa base no parece un ticket promedio (máximo S/200)." };

  try {
    const liq = (await sql`
      SELECT 1 FROM incentive_liquidations WHERE business_id = ${bId} AND month = ${input.effectiveMonth} LIMIT 1
    `) as unknown[];
    if (liq.length > 0) {
      return {
        ok: false,
        error: "Ese mes ya está liquidado: su base quedó congelada en el acta. Reabre la liquidación si necesitas cambiarla.",
      };
    }

    // Hereda el resto de la política (niveles, margen, piso, pozo) de la
    // config vigente: un mes nuevo con solo la base quedaría sin niveles.
    const rounded = Math.round(base * 100) / 100;
    const done = (await sql`
      INSERT INTO incentive_config
        (business_id, effective_month, ticket_base, margin_pct, traffic_floor, pool_pct, levels, min_clients_best_seller)
      SELECT ${bId}, ${input.effectiveMonth}, ${rounded},
             margin_pct, traffic_floor, pool_pct, levels, min_clients_best_seller
      FROM incentive_config
      WHERE business_id = ${bId} AND effective_month <= ${input.effectiveMonth}
      ORDER BY effective_month DESC LIMIT 1
      ON CONFLICT (business_id, effective_month)
      DO UPDATE SET ticket_base = EXCLUDED.ticket_base
      RETURNING id
    `) as { id: string }[];
    if (done.length === 0) {
      return { ok: false, error: "Sin configuración previa del programa para esta sede: no puedo heredar los niveles." };
    }
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (e) {
    console.error("[saveIncentiveBase]", e);
    return { ok: false, error: "No pude guardar la base del programa." };
  }
}
