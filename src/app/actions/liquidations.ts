"use server";

/**
 * Liquidación mensual de incentivos — SOLO sesión completa (dirección).
 * Congela el resultado del mes en incentive_liquidations: es el acta
 * del programa. Los candados (mes terminado, observaciones resueltas)
 * viven en el motor puro; aquí solo se recolecta y se congela.
 */

import { neon } from "@neondatabase/serverless";
import { getEntradaCandadoVentas } from "./breakeven";
import { getEntradaSupervision } from "./supervisiones";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { requireFullSession } from "@/lib/session-access";
import { refrescarRosterSiHaceFalta, sincronizarHorasDelMes, horasCopiadasDelMes } from "./roster-sync";
import {
  computeLiquidation,
  BONO_POR_HORA_DESDE,
  type IncentiveConfigT,
  type LiquidationResult,
} from "@/lib/incentives/engine";
import { resolverHorasDelMes, avisoHorasIncompletas } from "@/lib/incentives/horas-trabajadas";
import { evaluarCandadoVentas } from "@/lib/incentives/candado-ventas";
import { leerHorasPlanilla } from "@/lib/incentives/planilla-db";
import { emparejarVendedor } from "@/lib/incentives/emparejar-vendedor";
import { leerExcepciones } from "@/lib/incentives/bono-excepciones-db";
import { equipoDelBono } from "@/lib/incentives/equipo-del-bono";
import type { HorasDelMes } from "@/lib/incentives/horas-planilla";
import { armarPagoSede } from "@/lib/incentives/pago-sede";
import type { PagoSede, PagosDelMes } from "@/lib/incentives/reporte-bonos-tipos";

const sql = neon(process.env.DATABASE_URL!);

type LevelRow = { nombre: string; delta: number; bono_tc: number; bono_mt: number; bono_admin: number; premio_mv: number };

async function collectForLiquidation(bId: number, month: string, mejorVendedor: string | null): Promise<LiquidationResult> {
  // Antes de calcular un pago, el roster tiene que ser el real. Si la
  // copia de Planilla está vieja se refresca sola; si Planilla no
  // responde, se sigue con lo que hay (nunca rompe la liquidación).
  await refrescarRosterSiHaceFalta(bId);

  const cfgRows = (await sql`
    SELECT ticket_base::float AS base, margin_pct::float AS margin, traffic_floor, pool_pct::float AS pool, levels,
           requiere_equilibrio, requiere_supervision
    FROM incentive_config WHERE business_id = ${bId} AND effective_month <= ${month}
    ORDER BY effective_month DESC LIMIT 1
  `) as { base: number; margin: number; traffic_floor: number | null; pool: number; levels: LevelRow[]; requiere_equilibrio: boolean; requiere_supervision: boolean }[];
  if (cfgRows.length === 0) throw new Error("Sin configuración del programa para esta sede.");
  const config: IncentiveConfigT = {
    ticketBase: cfgRows[0].base,
    marginPct: cfgRows[0].margin,
    trafficFloor: cfgRows[0].traffic_floor,
    poolPct: cfgRows[0].pool,
    levels: cfgRows[0].levels,
    requiereEquilibrio: cfgRows[0].requiere_equilibrio === true,
    requiereSupervision: cfgRows[0].requiere_supervision === true,
  };

  // Las horas TRABAJADAS del mes se refrescan desde Planilla antes de
  // calcular: es el dato que decide el monto de cada quien.
  await sincronizarHorasDelMes(bId, month);

  // Quién entra al bono ESTE mes (la misma definición que usa el panel de cada sede):
  // cesado que hizo el mes completo sí cobra; en prueba o excluido por la dirección no.
  const equipo = await equipoDelBono(sql as never, bId, month);
  const staff = equipo.staff;
  const avisosEquipo = equipo.avisos;
  const excluidos = equipo.excluidos;
  const incluidosPorExcepcion = equipo.incluidosPorExcepcion;

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

  // Todo-o-nada: si a alguien del equipo le faltan horas en Planilla,
  // TODOS se calculan con las de contrato. Ver horas-trabajadas.ts.
  const resuelto = resolverHorasDelMes(
    staff.map((s) => ({ ...s, active: true })),
    await horasCopiadasDelMes(bId, month),
  );

  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  // Candado de ventas (desde octubre 2026): la meta congelada del mes y
  // lo vendido. Sin meta, el motor bloquea el cierre: nunca paga a ciegas.
  const candadoVentas = config.requiereEquilibrio ? await getEntradaCandadoVentas(bId, month) : null;
  // Supervisiones de Juani (desde octubre 2026): sin poder leerlas, el
  // motor bloquea el cierre.
  const supervision = config.requiereSupervision ? await getEntradaSupervision(bId, month) : null;
  const r = computeLiquidation({
    month, todayISO, config, candadoVentas, supervision,
    staff: resuelto.staff,
    dailies, unverifiedDays, observedDays, mejorVendedor,
  });
  // El aviso solo tiene sentido si de verdad se pagaron bonos y si al
  // mes le toca la regla por horas; en un mes de tabla fija las horas
  // no cambian nada y el aviso sería ruido.
  if (r.nivel && !resuelto.usaTrabajadas && resuelto.faltantes.length > 0 && month >= BONO_POR_HORA_DESDE) {
    r.warnings.push(avisoHorasIncompletas(resuelto.faltantes));
  }
  r.warnings.push(...avisosEquipo);
  r.excluidos = excluidos;
  r.incluidosPorExcepcion = incluidosPorExcepcion;
  return r;
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


/**
 * El pago del mes de las dos cafeterías, listo para el reporte de Kelly:
 * cuánto se reparte por sede y cuánto le toca a cada persona, con las horas
 * que Planilla tiene de cada una.
 *
 * Es el MISMO cálculo de la liquidación (`collectForLiquidation`): lo que
 * Kelly transfiere y lo que dice el acta no pueden diferir. Si el mes ya se
 * cerró se usa el acta congelada; si no, es una vista previa con lo de hoy.
 *
 * Las cifras salen SIN premio al mejor vendedor (salvo que el mes esté
 * cerrado y el acta ya lo traiga): a quién premiar lo elige la pantalla y lo
 * suma al instante con `conPremio`, sin volver a consultar Planilla.
 * `sugeridos` es el ganador de Byte por sede (nombre completo); aquí se
 * empareja con el equipo solo si es claro.
 *
 * Antes de calcular se comprueba el equipo y las horas contra Planilla
 * (`collectForLiquidation` lo hace): la sincronización es la base.
 */
export async function getPagosDelMes(
  month: string,
  sugeridos: Record<number, string | null> = {},
): Promise<{ ok: true; data: PagosDelMes } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "El reporte de pagos es solo para la dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  const [y, m] = month.split("-").map(Number);
  const diasDelMes = new Date(y, m, 0).getDate();

  const sedes: PagoSede[] = [];
  const errores: string[] = [];
  try {
    for (const [bId, nombreSede] of [[2, "Fonavi"], [3, "Centro"]] as [number, string][]) {
      // Una sede que falla (ej. un mes sin configuración del programa) no tumba a la otra.
      try {
        // ¿El mes ya está cerrado? Entonces manda el acta.
        let cerrada: { closedAt: string; result: LiquidationResult; mejorVendedor: string | null } | null = null;
        try {
          const rows = (await sql`
            SELECT closed_at::text AS closed_at, detalle, mejor_vendedor
            FROM incentive_liquidations WHERE business_id = ${bId} AND month = ${month}
          `) as { closed_at: string; detalle: LiquidationResult; mejor_vendedor: string | null }[];
          if (rows.length > 0) cerrada = { closedAt: rows[0].closed_at, result: rows[0].detalle, mejorVendedor: rows[0].mejor_vendedor };
        } catch { /* tabla pendiente: solo vista previa */ }

        // El ganador de Byte, emparejado con el equipo.
        const equipoRows = (await sql`
          SELECT name, dni, active FROM staff WHERE business_id = ${bId} ORDER BY active DESC, name
        `) as { name: string; dni: string | null; active: boolean }[];
        const equipoActivo = equipoRows.filter((s) => s.active).map((s) => s.name);
        const pedido = sugeridos[bId] ?? null;
        let sugeridoEquipo: string | null = null;
        const avisosPremio: string[] = [];
        if (pedido) {
          sugeridoEquipo = equipoActivo.find((n) => n.trim().toUpperCase() === pedido.trim().toUpperCase())
            ?? emparejarVendedor(pedido, equipoActivo);
          if (!sugeridoEquipo) {
            avisosPremio.push(`No se pudo emparejar al mejor vendedor «${pedido}» con una persona del equipo: elige a quién se le paga el premio.`);
          }
        }

        const result = cerrada ? cerrada.result : await collectForLiquidation(bId, month, null);

        // El desglose de horas de Planilla (solo lectura). Si no responde, se
        // muestran las horas sin desglose: el pago no depende de esto.
        const desglose = new Map<string, HorasDelMes>();
        if (!cerrada) {
          try {
            for (const h of (await leerHorasPlanilla(bId, month)) ?? []) desglose.set(h.dni, h);
          } catch (err) {
            console.error(`[getPagosDelMes] sede ${bId}: no pude leer el desglose de horas —`, err);
          }
        }
        const sync = (await sql`
          SELECT MAX(sincronizado_en)::text AS ultima FROM staff WHERE business_id = ${bId} AND active = true
        `) as { ultima: string | null }[];

        const entradaVentas = await getEntradaCandadoVentas(bId, month);
        const { disponible: excepcionesDisponibles } = await leerExcepciones(sql as never, bId);
        const pol = (await sql`
          SELECT requiere_equilibrio, requiere_supervision, traffic_floor
          FROM incentive_config WHERE business_id = ${bId} AND effective_month <= ${month}
          ORDER BY effective_month DESC LIMIT 1
        `) as { requiere_equilibrio: boolean; requiere_supervision: boolean; traffic_floor: number | null }[];

        sedes.push(armarPagoSede({
          businessId: bId,
          sede: nombreSede,
          month,
          cerrada: cerrada ? { closedAt: cerrada.closedAt, mejorVendedor: cerrada.mejorVendedor } : null,
          result,
          equipo: equipoRows,
          desglose,
          sugeridoByte: pedido,
          sugeridoEquipo,
          avisosPremio,
          sincronizadoEn: sync[0]?.ultima ?? null,
          excepcionesDisponibles,
          ventas: entradaVentas ? evaluarCandadoVentas(entradaVentas, diasDelMes) : null,
          politica: {
            requiereEquilibrio: pol[0]?.requiere_equilibrio === true,
            requiereSupervision: pol[0]?.requiere_supervision === true,
            trafficFloor: pol[0]?.traffic_floor ?? null,
          },
        }));
      } catch (err) {
        console.error(`[getPagosDelMes] sede ${bId} falló:`, err);
        errores.push(`${nombreSede}: ${err instanceof Error ? err.message : "no se pudo calcular el pago"}`);
      }
    }
    return { ok: true, data: { month, generadoEn: new Date().toISOString(), sedes, errores } };
  } catch (err) {
    console.error("[getPagosDelMes] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al preparar los pagos del mes" };
  }
}
