"use server";

/**
 * Comparativo de ventas de UNA sede para su dashboard (pedido de Jahnn,
 * 28-jul-2026: "que este dato se vea claramente en un apartado aparte,
 * y mostrado también con gráficas").
 *
 * Reglas de la casa:
 *  - MISMO cargador de ventas diarias que el deck, el Grupo y la alerta
 *    (loadVentaRowsBlended) y MISMO motor de comparación mensual
 *    (compareMonths): esta sección jamás puede contradecir al resto.
 *  - "Mismos días" es literal: se emparejan día con día y solo cuentan
 *    los que tienen dato en AMBOS meses.
 */

import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole } from "@/lib/session-access";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";
import { compareMonths, type MonthComparison, type DayRow } from "@/lib/kpis/month-compare";

const sql = neon(process.env.DATABASE_URL!);

const DOW_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export type SalesComparison = {
  /** Último día con datos (YYYY-MM-DD). */
  hasta: string;
  fuente: "byte" | "registro" | "mixta";
  /** Semana: los 7 días que terminan en `hasta`, vs los 7 previos. */
  semana: { actual: number; previa: number; pct: number | null; diasActual: number; diasPrevia: number; desde: string };
  /** Mes actual vs el pasado, emparejado día con día. */
  mes: MonthComparison & { etiquetaMes: string; etiquetaMesPrev: string; totalMes: number };
  /** Serie diaria emparejada para el gráfico (día del mes 1..31). */
  serie: { dia: number; actual: number | null; anterior: number | null }[];
  /** Resumen por día de semana (lunes con lunes) para el segundo gráfico. */
  porDiaSemana: { dia: string; actual: number; anterior: number; pct: number | null }[];
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function shiftDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function getSalesComparison(): Promise<
  { ok: true; data: SalesComparison } | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  const role = await getSessionRole();
  const allowed = role?.kind === "full" || (role?.kind === "admin" && role.sede === bId);
  if (!allowed) return { ok: false, error: "Sin acceso." };

  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const { rows, fuente } = await loadVentaRowsBlended(sql, bId, shiftDays(today, -100), today);
    const conDatos = rows.filter((r) => r.total > 0);
    if (conDatos.length === 0 || fuente === null) {
      return { ok: false, error: "Aún no hay ventas registradas para comparar." };
    }

    const hasta = conDatos[conDatos.length - 1].date;
    const mesActualPrefix = hasta.slice(0, 7);
    const [my, mm] = mesActualPrefix.split("-").map(Number);
    const py = mm === 1 ? my - 1 : my;
    const pm = mm === 1 ? 12 : mm - 1;
    const mesPrevPrefix = `${py}-${String(pm).padStart(2, "0")}`;

    const cur: DayRow[] = conDatos.filter((r) => r.date.slice(0, 7) === mesActualPrefix);
    const prev: DayRow[] = conDatos.filter((r) => r.date.slice(0, 7) === mesPrevPrefix);
    const mes = compareMonths(cur, prev);

    // ── Semana: los 7 días que terminan en `hasta` vs los 7 previos ──
    const wStart = shiftDays(hasta, -6);
    const pStart = shiftDays(hasta, -13);
    const pEnd = shiftDays(hasta, -7);
    const inRange = (a: string, b: string) => conDatos.filter((r) => r.date >= a && r.date <= b);
    const wCur = inRange(wStart, hasta);
    const wPrev = inRange(pStart, pEnd);
    const sum = (a: DayRow[]) => r2(a.reduce((s, r) => s + r.total, 0));
    // Promedio POR DÍA con datos (una semana a medio cargar no infla).
    const avgCur = wCur.length > 0 ? sum(wCur) / wCur.length : 0;
    const avgPrev = wPrev.length > 0 ? sum(wPrev) / wPrev.length : 0;

    // ── Serie diaria emparejada por número de día ──
    const curByDay = new Map(cur.map((r) => [Number(r.date.slice(8)), r.total]));
    const prevByDay = new Map(prev.map((r) => [Number(r.date.slice(8)), r.total]));
    const maxDia = Math.max(...[...curByDay.keys(), ...prevByDay.keys()], 0);
    const serie = Array.from({ length: maxDia }, (_, i) => {
      const dia = i + 1;
      return { dia, actual: curByDay.get(dia) ?? null, anterior: prevByDay.get(dia) ?? null };
    });

    // ── Por día de semana: n-ésimo lunes con n-ésimo lunes ──
    const bucket = (arr: DayRow[]) => {
      const m = new Map<number, number[]>();
      for (const r of arr) {
        const k = new Date(r.date + "T12:00:00Z").getUTCDay();
        m.set(k, [...(m.get(k) ?? []), r.total]);
      }
      return m;
    };
    const bc = bucket(cur), bp = bucket(prev);
    const porDiaSemana = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
      const cs = bc.get(dow) ?? [], ps = bp.get(dow) ?? [];
      const n = Math.min(cs.length, ps.length);
      const a = r2(cs.slice(0, n).reduce((s, x) => s + x, 0));
      const b = r2(ps.slice(0, n).reduce((s, x) => s + x, 0));
      return { dia: DOW_LABELS[dow], actual: a, anterior: b, pct: b > 0 ? r2(((a - b) / b) * 100) : null };
    }).filter((d) => d.actual > 0 || d.anterior > 0);

    return {
      ok: true,
      data: {
        hasta,
        fuente,
        semana: {
          actual: sum(wCur),
          previa: sum(wPrev),
          pct: avgPrev > 0 ? r2(((avgCur - avgPrev) / avgPrev) * 100) : null,
          diasActual: wCur.length,
          diasPrevia: wPrev.length,
          desde: wStart,
        },
        mes: {
          ...mes,
          etiquetaMes: `${MESES[mm - 1]}`,
          etiquetaMesPrev: `${MESES[pm - 1]}`,
          totalMes: sum(cur),
        },
        serie,
        porDiaSemana,
      },
    };
  } catch (err) {
    console.error("[getSalesComparison] failed:", err);
    return { ok: false, error: "No pude armar el comparativo de ventas." };
  }
}
