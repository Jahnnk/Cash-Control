"use server";

/**
 * Lo que el Resumen de Grupo rediseñado (8-oct-2026) necesita y que no traía antes:
 *   · La meta de ventas del mes de cada sede: la venta esperada del presupuesto APROBADO.
 *   · Lo que el sistema comprueba solo: sedes sin Highlight esta semana y presupuesto sin aprobar
 *     (15-oct-2026: reemplazan a la revisión del lunes y al checklist, que uno mismo marcaba).
 *   · Hace cuánto se subió el reporte de cobros de Atelier y cuánto decía por cobrar.
 * Solo lectura, solo dirección. Nunca lanza: el Resumen se arma igual sin estas señales.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { planDe } from "@/lib/presupuesto-datos";
import { lunesDe, sumarDias } from "@/lib/highlight";
import { utilidadPorSeparar } from "@/lib/regla-33";
import { getSeisCifras } from "./seis-cifras";

const sql = neon(process.env.DATABASE_URL!);
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
/** La utilidad se separa del 1 al 7 del mes siguiente (pedido de Jahnn, 15-oct-2026). */
const DIAS_PRIMERA_SEMANA = 7;
const SEDES = [{ id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }, { id: 1, nombre: "Atelier" }];
const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export type ResumenExtra = {
  /** Meta de ventas por sede (businessId → S/); null si el mes no tiene presupuesto aprobado. */
  metas: Record<number, number | null>;
  /** Nombres de las sedes sin Highlight esta semana (solo en el mes en curso). */
  highlightsSinAsignar: string[] | null;
  presupuesto: { mesActualSinAprobar: number; siguienteSinAprobar: number; totalSedes: number; diasRestantes: number; mesSiguiente: string } | null;
  /** Primera semana del mes: lo que toca separar de la venta del mes que cerró (Profit First); null = no aplica. */
  utilidadPorSeparar: { mes: string; pct: number; sedes: { sede: string; monto: number }[] } | null;
  cobrosAtelier: { diasDesdeCarga: number | null; porCobrar: number } | null;
};

export async function getResumenExtra(mes: string): Promise<ResumenExtra> {
  const vacio: ResumenExtra = { metas: {}, highlightsSinAsignar: null, presupuesto: null, utilidadPorSeparar: null, cobrosAtelier: null };
  if (!(await requireFullSession())) return vacio;
  try {
    const hoy = hoyLima();
    const enCurso = mes === hoy.slice(0, 7);
    const lunes = lunesDe(hoy);
    const siguiente = mesMas(mes, 1);
    // Profit First: del 1 al 7 del mes, cuánto toca separar de la venta del mes que cerró (solo lo que el sistema comprueba).
    const primeraSemana = enCurso && Number(hoy.slice(8, 10)) <= DIAS_PRIMERA_SEMANA;
    const [planes, hls, aprobados, cobros, utilidad] = await Promise.all([
      Promise.all([1, 2, 3].map(async (id) => [id, await planDe(id, mes)] as const)),
      (enCurso ? sql`SELECT DISTINCT business_id FROM highlights WHERE fecha >= ${lunes} AND fecha <= ${sumarDias(lunes, 6)}` : Promise.resolve([])).catch(() => null) as Promise<{ business_id: number }[] | null>,
      (enCurso ? sql`SELECT mes, COUNT(*)::int AS n FROM presupuesto_mes WHERE mes IN (${mes}, ${siguiente}) AND aprobado_el IS NOT NULL GROUP BY mes` : Promise.resolve([])).catch(() => null) as Promise<{ mes: string; n: number }[] | null>,
      sql`SELECT max(actualizado_en)::date::text AS ultima,
                 COALESCE(SUM(CASE WHEN estado_cuota = 'PENDIENTE' AND NOT COALESCE(cobrado_manual, false) THEN credito ELSE 0 END), 0)::float AS por_cobrar
          FROM invoice_documents`.catch(() => null) as Promise<{ ultima: string | null; por_cobrar: number }[] | null>,
      primeraSemana
        ? Promise.all([getSeisCifras(mesMas(mes, -1)), getSeisCifras(mes)]).catch(() => null)
        : Promise.resolve(null),
    ]);
    const cerrado = utilidad?.[0];
    const actual = utilidad?.[1];
    const porSeparar = cerrado?.ok && actual?.ok ? utilidadPorSeparar(cerrado.data, actual.data) : [];
    const metas = Object.fromEntries(planes.map(([id, p]) => [id, p.cab?.aprobadoEl ? p.cab.ventaEsperada : null]));
    const ultima = cobros?.[0]?.ultima ?? null;
    return {
      metas,
      highlightsSinAsignar: enCurso && hls ? SEDES.filter((x) => !hls.some((h) => h.business_id === x.id)).map((x) => x.nombre) : null,
      presupuesto: enCurso && aprobados ? {
        mesActualSinAprobar: SEDES.length - (aprobados.find((a) => a.mes === mes)?.n ?? 0),
        siguienteSinAprobar: SEDES.length - (aprobados.find((a) => a.mes === siguiente)?.n ?? 0),
        totalSedes: SEDES.length,
        diasRestantes: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate() - Number(hoy.slice(8, 10)),
        mesSiguiente: siguiente,
      } : null,
      utilidadPorSeparar: cerrado?.ok && porSeparar.length ? { mes: mesMas(mes, -1), pct: cerrado.data.config.utilidadPct, sedes: porSeparar } : null,
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
