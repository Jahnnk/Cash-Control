"use server";

/**
 * Lo que el Resumen de Grupo rediseñado (8-oct-2026) necesita y que no traía antes:
 *   · La meta de ventas del mes de cada sede: la venta esperada del presupuesto APROBADO.
 *   · Si la revisión semanal del lunes está pendiente (Sistema de Dirección → Control mensual).
 *   · Hace cuánto se subió el reporte de cobros de Atelier y cuánto decía por cobrar.
 * Solo lectura, solo dirección. Nunca lanza: el Resumen se arma igual sin estas señales.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { planDe } from "@/lib/presupuesto-datos";
import { semanaEnRevision } from "@/lib/control-mensual";

const sql = neon(process.env.DATABASE_URL!);
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
/** La rutina semanal empezó el lunes 5-oct-2026: antes no hay revisión que pedir. */
const INICIO_RUTINA = "2026-09-28";

export type ResumenExtra = {
  /** Meta de ventas por sede (businessId → S/); null si el mes no tiene presupuesto aprobado. */
  metas: Record<number, number | null>;
  revisionSemanal: { pendiente: boolean; desde: string; hasta: string } | null;
  cobrosAtelier: { diasDesdeCarga: number | null; porCobrar: number } | null;
};

export async function getResumenExtra(mes: string): Promise<ResumenExtra> {
  const vacio: ResumenExtra = { metas: {}, revisionSemanal: null, cobrosAtelier: null };
  if (!(await requireFullSession())) return vacio;
  try {
    const hoy = hoyLima();
    const semana = semanaEnRevision(hoy);
    const [planes, rev, cobros] = await Promise.all([
      Promise.all([1, 2, 3].map(async (id) => [id, await planDe(id, mes)] as const)),
      sql`SELECT 1 FROM revision_semanal WHERE semana = ${semana.desde}`.catch(() => null),
      sql`SELECT max(actualizado_en)::date::text AS ultima,
                 COALESCE(SUM(CASE WHEN estado_cuota = 'PENDIENTE' AND NOT COALESCE(cobrado_manual, false) THEN credito ELSE 0 END), 0)::float AS por_cobrar
          FROM invoice_documents`.catch(() => null) as Promise<{ ultima: string | null; por_cobrar: number }[] | null>,
    ]);
    const metas = Object.fromEntries(planes.map(([id, p]) => [id, p.cab?.aprobadoEl ? p.cab.ventaEsperada : null]));
    const ultima = cobros?.[0]?.ultima ?? null;
    return {
      metas,
      revisionSemanal: rev && semana.desde >= INICIO_RUTINA && mes === hoy.slice(0, 7)
        ? { pendiente: rev.length === 0, ...semana } : null,
      cobrosAtelier: cobros ? {
        diasDesdeCarga: ultima ? Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${ultima}T12:00:00Z`)) / 86_400_000) : null,
        porCobrar: cobros[0]?.por_cobrar ?? 0,
      } : null,
    };
  } catch (e) {
    console.error("[getResumenExtra] failed:", e);
    return vacio;
  }
}
