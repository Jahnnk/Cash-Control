"use server";

/**
 * Ventas por sede para el Dashboard de Grupo (pedido de Jahnn, jul-2026):
 * "en la vista consolidada de cada sede quiero ver el comparativo de
 * ingresos vs la semana pasada y vs el mes pasado, al último reporte".
 *
 * Reglas de la casa:
 *  - MISMO cerebro que la lámina de ventas del deck (compareVentasSede):
 *    el dashboard jamás puede contradecir la reunión de los viernes.
 *  - MISMO cargador de venta diaria que el deck (loadVentaRowsBlended):
 *    fuentes combinadas POR DÍA, el reporte oficial manda.
 *  - Sede EXPLÍCITA en todas las consultas (lección /grupo: la cookie
 *    aquí dice "grupo" — nada de activeBusinessId()).
 *  - "Al último reporte": la semana comparada es la ÚLTIMA con datos,
 *    no la semana calendario — si Kelly sube los viernes, entre semana
 *    se compara hasta donde hay datos y se dice hasta cuándo.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { compareVentasSede, type VentasSedeComparison } from "@/lib/kpis/ventas-deck";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";
import { compareMonths, type MonthComparison } from "@/lib/kpis/month-compare";

const sql = neon(process.env.DATABASE_URL!);

export type GroupVentasSede = VentasSedeComparison & {
  businessId: number;
  /** Comparativo del MES emparejado por día (única base honesta del
   * "vs mes pasado, mismos días"). Ver nota en getGroupVentasComparison. */
  mesCmp: MonthComparison | null;
};

const SEDES: [number, string][] = [
  [1, "Atelier"],
  [2, "Fonavi"],
  [3, "Centro"],
];

function shiftDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getGroupVentasComparison(): Promise<
  | { ok: true; sedes: GroupVentasSede[] }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "Solo para la dirección." };
  }
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    // 100 días cubren el mes anterior COMPLETO (para el emparejamiento
    // día a día) más la semana previa a la última semana con datos.
    const from = shiftDays(today, -100);

    const sedes: GroupVentasSede[] = [];
    for (const [bId, nombre] of SEDES) {
      const { rows, fuente } = await loadVentaRowsBlended(sql, bId, from, today);
      if (rows.length === 0 || fuente === null) {
        sedes.push({
          businessId: bId,
          sede: nombre,
          rango: 0, rangoPrev: null, deltaRangoPct: null,
          mes: 0, mesPrev: null, deltaMesPct: null,
          rangoDias: 0, rangoPrevDias: 0, mesDias: 0, mesPrevDias: 0,
          hasta: null, fuente: null, mesCmp: null,
        });
        continue;
      }
      // "Al último reporte": la semana es los 7 días que TERMINAN en la
      // última fecha con datos (no la semana calendario a medias).
      const hasta = rows[rows.length - 1].date;
      const ws = shiftDays(hasta, -6);
      // El "vs mes pasado, MISMOS DÍAS" se calcula emparejando día con
      // día (compareMonths), no con promedios diarios: en Centro, 26
      // días de julio contra los 7 de junio cargados daban "+0.7%"
      // cuando los mismos 7 días dan -12.8% (auditoría 28-jul-2026).
      // Mismo motor que la alerta del dashboard de sede: una verdad.
      const mesActual = rows.filter((r) => r.date.slice(0, 7) === hasta.slice(0, 7));
      const [my, mm] = hasta.slice(0, 7).split("-").map(Number);
      const py = mm === 1 ? my - 1 : my;
      const pm = mm === 1 ? 12 : mm - 1;
      const prevPrefix = `${py}-${String(pm).padStart(2, "0")}`;
      const mesPrevio = rows.filter((r) => r.date.slice(0, 7) === prevPrefix);
      const mesCmp = compareMonths(mesActual, mesPrevio);
      sedes.push({ businessId: bId, ...compareVentasSede(nombre, rows, ws, hasta, fuente), mesCmp });
    }
    return { ok: true, sedes };
  } catch (err) {
    console.error("[getGroupVentasComparison] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar ventas por sede" };
  }
}
