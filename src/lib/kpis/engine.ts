/**
 * KPIs diarios de sede · MOTOR (lógica PURA).
 *
 * Reemplaza el cuadro de Notion: 5 KPIs por día (ventas, ticket, NPS,
 * mermas, tiempo de atención) con metas por sede y semáforos, más el
 * resumen semanal (semana DOMINGO→SÁBADO, como la reunión de los lunes)
 * y la comparación contra la semana anterior (WoW).
 *
 * Reglas de semáforo (calibradas con el cuadro real de Notion y el deck
 * de la reunión del 21-27 jun):
 *  - Ventas y Ticket: verde ≥100% de la meta/ref · ámbar ≥95% · rojo <95%
 *  - NPS: verde ≥ meta (promotores) · ámbar ≥7 (pasivos) · rojo <7
 *  - Mermas: % sobre las ventas del día/semana: verde ≤ meta (4%) ·
 *    ámbar ≤ 1.5× meta · rojo mayor
 *  - Tiempo (mostrador <6 min y mesa <15 min, configurables): verde ≤
 *    meta · ámbar ≤ 1.2× meta · rojo mayor
 *  - Sin dato → "gris" (sin registro), nunca rojo inventado.
 */

export type KpiTraffic = "verde" | "ambar" | "rojo" | "gris";

export type KpiTargets = {
  ventaDiaria: number;
  ticketRef: number;
  npsMin: number;        // ej. 9
  mermasMaxPct: number;  // 0-1, ej. 0.04
  /** Meta de tiempo en MOSTRADOR (min) — ej. 6. */
  tiempoMaxMin: number | null;
  /** Meta de tiempo en MESA (min) — ej. 15. */
  tiempoMesaMaxMin: number | null;
};

export type KpiDaily = {
  date: string;
  ventas: number | null;
  personas: number | null;
  nps: number | null;
  mermasSoles: number | null;
  /** Tiempo de atención en MOSTRADOR (min). */
  tiempoMin: number | null;
  /** Tiempo de atención en MESA (min). */
  tiempoMesaMin: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function ratioTraffic(value: number | null, target: number): KpiTraffic {
  if (value === null) return "gris";
  const pct = value / target;
  return pct >= 1 ? "verde" : pct >= 0.95 ? "ambar" : "rojo";
}

export function npsTraffic(nps: number | null, min: number): KpiTraffic {
  if (nps === null) return "gris";
  return nps >= min ? "verde" : nps >= 7 ? "ambar" : "rojo";
}

export function mermasTraffic(mermas: number | null, ventas: number | null, maxPct: number): KpiTraffic {
  if (mermas === null) return "gris";
  if (mermas === 0) return "verde";
  if (!ventas || ventas <= 0) return "gris";
  const pct = mermas / ventas;
  return pct <= maxPct ? "verde" : pct <= maxPct * 1.5 ? "ambar" : "rojo";
}

export function tiempoTraffic(min: number | null, max: number | null): KpiTraffic {
  if (min === null || max === null) return "gris";
  return min <= max ? "verde" : min <= max * 1.2 ? "ambar" : "rojo";
}

export type KpiDayView = KpiDaily & {
  ticket: number | null;
  traffic: { ventas: KpiTraffic; ticket: KpiTraffic; nps: KpiTraffic; mermas: KpiTraffic; tiempo: KpiTraffic; tiempoMesa: KpiTraffic };
};

export type KpiExtreme = { date: string; value: number } | null;

export type KpiWeekSummary = {
  weekStart: string;   // domingo
  weekEnd: string;     // sábado
  daysWithData: number;
  ventasProm: number | null;
  ventasPct: number | null;         // % de la meta
  ventasTotal: number;
  ticketProm: number | null;
  ticketPct: number | null;
  npsProm: number | null;
  mermasTotal: number;
  mermasPct: number | null;         // % sobre ventas de la semana
  tiempoProm: number | null;
  tiempoMesaProm: number | null;
  traffic: { ventas: KpiTraffic; ticket: KpiTraffic; nps: KpiTraffic; mermas: KpiTraffic; tiempo: KpiTraffic; tiempoMesa: KpiTraffic };
  best: { ventas: KpiExtreme; ticket: KpiExtreme; nps: KpiExtreme; mermas: KpiExtreme };
  worst: { ventas: KpiExtreme; ticket: KpiExtreme; nps: KpiExtreme; mermas: KpiExtreme };
  days: KpiDayView[];
};

/** Domingo de la semana que contiene `date` (semana dom→sáb de la reunión). */
export function weekStartOf(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 = domingo
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function weekEndOf(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function computeDayView(d: KpiDaily, t: KpiTargets): KpiDayView {
  const ticket = d.ventas !== null && d.personas ? r2(d.ventas / d.personas) : null;
  return {
    ...d,
    ticket,
    traffic: {
      ventas: ratioTraffic(d.ventas, t.ventaDiaria),
      ticket: ratioTraffic(ticket, t.ticketRef),
      nps: npsTraffic(d.nps, t.npsMin),
      mermas: mermasTraffic(d.mermasSoles, d.ventas, t.mermasMaxPct),
      tiempo: tiempoTraffic(d.tiempoMin, t.tiempoMaxMin),
      tiempoMesa: tiempoTraffic(d.tiempoMesaMin, t.tiempoMesaMaxMin),
    },
  };
}

function extremes(days: KpiDayView[], pick: (d: KpiDayView) => number | null, best: "max" | "min") {
  const withVal = days.filter((d) => pick(d) !== null).map((d) => ({ date: d.date, value: pick(d)! }));
  if (withVal.length === 0) return { best: null, worst: null };
  const sorted = [...withVal].sort((a, b) => a.value - b.value);
  return best === "max"
    ? { best: sorted[sorted.length - 1], worst: sorted[0] }
    : { best: sorted[0], worst: sorted[sorted.length - 1] };
}

/**
 * Resumen de un RANGO arbitrario de fechas (para reportes con rango
 * personalizado). computeWeekSummary es el caso particular dom→sáb.
 * Los campos weekStart/weekEnd del resultado son el inicio/fin del rango.
 */
export function computeRangeSummary(rangeStart: string, rangeEnd: string, dailies: KpiDaily[], t: KpiTargets): KpiWeekSummary {
  const weekStart = rangeStart;
  const weekEnd = rangeEnd;
  const inWeek = dailies
    .filter((d) => d.date >= weekStart && d.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  const days = inWeek.map((d) => computeDayView(d, t));

  const withVentas = days.filter((d) => d.ventas !== null);
  const ventasTotal = r2(withVentas.reduce((s, d) => s + (d.ventas ?? 0), 0));
  const ventasProm = withVentas.length > 0 ? r2(ventasTotal / withVentas.length) : null;
  const withTicket = days.filter((d) => d.ticket !== null);
  const personasTotal = withTicket.reduce((s, d) => s + (d.personas ?? 0), 0);
  const ventasConPersonas = withTicket.reduce((s, d) => s + (d.ventas ?? 0), 0);
  const ticketProm = personasTotal > 0 ? r2(ventasConPersonas / personasTotal) : null;
  const withNps = days.filter((d) => d.nps !== null);
  const npsProm = withNps.length > 0 ? r2(withNps.reduce((s, d) => s + (d.nps ?? 0), 0) / withNps.length) : null;
  const mermasTotal = r2(days.reduce((s, d) => s + (d.mermasSoles ?? 0), 0));
  // % con 2 decimales exactos. OJO: redondear ANTES de dividir producía
  // colas binarias tipo 0.4429999999995% en pantalla (bug visto por Jahnn):
  // Math.round(x*10000)/100 sí da un número que se imprime limpio (0.44).
  const mermasPct = ventasTotal > 0 ? Math.round((mermasTotal / ventasTotal) * 10000) / 100 : null;
  const withTiempo = days.filter((d) => d.tiempoMin !== null);
  const tiempoProm = withTiempo.length > 0 ? r2(withTiempo.reduce((s, d) => s + (d.tiempoMin ?? 0), 0) / withTiempo.length) : null;
  const withTiempoMesa = days.filter((d) => d.tiempoMesaMin !== null);
  const tiempoMesaProm = withTiempoMesa.length > 0 ? r2(withTiempoMesa.reduce((s, d) => s + (d.tiempoMesaMin ?? 0), 0) / withTiempoMesa.length) : null;

  const vx = extremes(days, (d) => d.ventas, "max");
  const tx = extremes(days, (d) => d.ticket, "max");
  const nx = extremes(days, (d) => d.nps, "max");
  const mx = extremes(days, (d) => d.mermasSoles, "min");

  return {
    weekStart,
    weekEnd,
    daysWithData: withVentas.length,
    ventasProm,
    ventasPct: ventasProm !== null ? r1((ventasProm / t.ventaDiaria) * 100) : null,
    ventasTotal,
    ticketProm,
    ticketPct: ticketProm !== null ? r1((ticketProm / t.ticketRef) * 100) : null,
    npsProm,
    mermasTotal,
    mermasPct,
    tiempoProm,
    tiempoMesaProm,
    traffic: {
      ventas: ratioTraffic(ventasProm, t.ventaDiaria),
      ticket: ratioTraffic(ticketProm, t.ticketRef),
      nps: npsTraffic(npsProm, t.npsMin),
      mermas: mermasTraffic(mermasTotal, ventasTotal || null, t.mermasMaxPct),
      tiempo: tiempoTraffic(tiempoProm, t.tiempoMaxMin),
      tiempoMesa: tiempoTraffic(tiempoMesaProm, t.tiempoMesaMaxMin),
    },
    best: { ventas: vx.best, ticket: tx.best, nps: nx.best, mermas: mx.best },
    worst: { ventas: vx.worst, ticket: tx.worst, nps: nx.worst, mermas: mx.worst },
    days,
  };
}

/** Resumen de la semana dom→sáb (caso particular del rango). */
export function computeWeekSummary(weekStart: string, dailies: KpiDaily[], t: KpiTargets): KpiWeekSummary {
  return computeRangeSummary(weekStart, weekEndOf(weekStart), dailies, t);
}

// ─────────────────────────────────────────────────────────────────
// Semana vs semana (el corazón de la reunión de los lunes)
// ─────────────────────────────────────────────────────────────────

export type WowItem = { kpi: string; text: string; direction: "mejoro" | "empeoro" };

export function compareWeeks(current: KpiWeekSummary, previous: KpiWeekSummary | null): WowItem[] {
  if (!previous || previous.daysWithData === 0) return [];
  const items: WowItem[] = [];
  const pt = (a: number | null, b: number | null) => a !== null && b !== null;

  if (pt(current.ventasPct, previous.ventasPct)) {
    const delta = r1(current.ventasPct! - previous.ventasPct!);
    if (Math.abs(delta) >= 3) {
      items.push({
        kpi: "Ventas",
        text: `Ventas: ${previous.ventasPct}% → ${current.ventasPct}% de la meta (${delta > 0 ? "+" : ""}${delta} pts WoW)`,
        direction: delta > 0 ? "mejoro" : "empeoro",
      });
    }
  }
  if (pt(current.ticketPct, previous.ticketPct)) {
    const delta = r1(current.ticketPct! - previous.ticketPct!);
    if (Math.abs(delta) >= 3) {
      items.push({
        kpi: "Ticket",
        text: `Ticket: ${previous.ticketPct}% → ${current.ticketPct}% de la referencia (${delta > 0 ? "+" : ""}${delta} pts WoW)`,
        direction: delta > 0 ? "mejoro" : "empeoro",
      });
    }
  }
  if (pt(current.npsProm, previous.npsProm)) {
    const delta = r2(current.npsProm! - previous.npsProm!);
    if (Math.abs(delta) >= 0.3) {
      items.push({
        kpi: "NPS",
        text: `NPS: ${previous.npsProm} → ${current.npsProm} (${delta > 0 ? "+" : ""}${delta})`,
        direction: delta > 0 ? "mejoro" : "empeoro",
      });
    }
  }
  if (pt(current.mermasPct, previous.mermasPct)) {
    const delta = r2(current.mermasPct! - previous.mermasPct!);
    if (Math.abs(delta) >= 0.5) {
      items.push({
        kpi: "Mermas",
        text: `Mermas: ${previous.mermasPct}% → ${current.mermasPct}% de las ventas`,
        direction: delta < 0 ? "mejoro" : "empeoro",
      });
    }
  }
  return items;
}

/**
 * El KPI en rojo priorizado de la semana ("un solo KPI en rojo · una
 * sola acción · un responsable"). Prioridad: ventas > ticket > mermas >
 * NPS > tiempo, y entre sedes gana el de peor % de cumplimiento.
 */
export function pickPriorityRed(
  sedes: { sede: string; summary: KpiWeekSummary }[],
): { sede: string; kpi: string; detail: string } | null {
  const candidates: { sede: string; kpi: string; severity: number; detail: string }[] = [];
  for (const { sede, summary } of sedes) {
    if (summary.traffic.ventas === "rojo" && summary.ventasPct !== null) {
      candidates.push({ sede, kpi: "Ventas diarias", severity: 100 - summary.ventasPct + 300, detail: `${summary.ventasPct}% de la meta` });
    }
    if (summary.traffic.ticket === "rojo" && summary.ticketPct !== null) {
      candidates.push({ sede, kpi: "Ticket promedio", severity: 100 - summary.ticketPct + 200, detail: `${summary.ticketPct}% de la referencia` });
    }
    if (summary.traffic.mermas === "rojo" && summary.mermasPct !== null) {
      candidates.push({ sede, kpi: "Mermas", severity: summary.mermasPct * 10 + 100, detail: `${summary.mermasPct}% de las ventas` });
    }
    if (summary.traffic.nps === "rojo" && summary.npsProm !== null) {
      candidates.push({ sede, kpi: "NPS", severity: 10 - summary.npsProm + 50, detail: `NPS ${summary.npsProm}` });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.severity - a.severity);
  const top = candidates[0];
  return { sede: top.sede, kpi: top.kpi, detail: top.detail };
}
