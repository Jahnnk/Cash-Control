/**
 * Tests del motor de KPIs — calibrados contra el cuadro REAL de Notion
 * (Centro, semana 21-27 jun 2026) y el deck de la reunión: los semáforos
 * y promedios deben reproducir lo que Jahnn ya ve.
 */
import { describe, it, expect } from "vitest";
import {
  computeWeekSummary,
  computeDayView,
  compareWeeks,
  pickPriorityRed,
  weekStartOf,
  weekEndOf,
  type KpiTargets,
  type KpiDaily,
} from "../engine";

const CENTRO: KpiTargets = { ventaDiaria: 1266, ticketRef: 24.25, npsMin: 9, mermasMaxPct: 0.04, tiempoMaxMin: 6, tiempoMesaMaxMin: 15 };

/** La semana real del cuadro de Notion (Centro, 21-27 jun). Personas
 *  derivadas de ticket = ventas/personas del cuadro. */
const WEEK: KpiDaily[] = [
  { date: "2026-06-21", ventas: 1798.2, personas: 69, nps: 9.8, mermasSoles: 35, tiempoMin: null, tiempoMesaMin: null },   // ticket 26.06
  { date: "2026-06-22", ventas: 1261.5, personas: 51, nps: 9.6, mermasSoles: 0, tiempoMin: null, tiempoMesaMin: null },    // 24.74
  { date: "2026-06-23", ventas: 1084.9, personas: 56, nps: 9.2, mermasSoles: 27, tiempoMin: null, tiempoMesaMin: null },   // 19.37
  { date: "2026-06-24", ventas: 939.0, personas: 37, nps: 9.78, mermasSoles: 0, tiempoMin: null, tiempoMesaMin: null },    // 25.38
  { date: "2026-06-25", ventas: 1188.6, personas: 53, nps: 9.8, mermasSoles: 20, tiempoMin: null, tiempoMesaMin: null },   // 22.43
  { date: "2026-06-26", ventas: 800.7, personas: 44, nps: 9.0, mermasSoles: 0, tiempoMin: null, tiempoMesaMin: null },     // 18.20
  { date: "2026-06-27", ventas: 1275.7, personas: 53, nps: 9.3, mermasSoles: 0, tiempoMin: null, tiempoMesaMin: null },    // 24.07
];

describe("semáforos diarios — reproducen el cuadro de Notion", () => {
  it("ventas: 1798 verde · 1261.50 ámbar (99.6%) · 1084.90 rojo (85.7%)", () => {
    expect(computeDayView(WEEK[0], CENTRO).traffic.ventas).toBe("verde");
    expect(computeDayView(WEEK[1], CENTRO).traffic.ventas).toBe("ambar");
    expect(computeDayView(WEEK[2], CENTRO).traffic.ventas).toBe("rojo");
  });

  it("ticket: 26.06 verde · 24.07 ámbar (99.3%) · 22.43 rojo (92.5%)", () => {
    expect(computeDayView(WEEK[0], CENTRO).traffic.ticket).toBe("verde");
    expect(computeDayView(WEEK[6], CENTRO).traffic.ticket).toBe("ambar");
    expect(computeDayView(WEEK[4], CENTRO).traffic.ticket).toBe("rojo");
  });

  it("NPS ≥9 = promotores verde; mermas S/35 sobre S/1,798 = 1.9% verde; sin tiempo = gris (no rojo inventado)", () => {
    const d = computeDayView(WEEK[0], CENTRO);
    expect(d.traffic.nps).toBe("verde");
    expect(d.traffic.mermas).toBe("verde");
    expect(d.traffic.tiempo).toBe("gris");
    expect(d.traffic.tiempoMesa).toBe("gris");
  });

  it("tiempos partidos: mostrador (<6) y mesa (<15) semaforizan por separado", () => {
    // Mostrador 5 min = verde; mesa 19 min (>15×1.2=18) = rojo — un mismo día.
    const d = computeDayView({ ...WEEK[0], tiempoMin: 5, tiempoMesaMin: 19 }, CENTRO);
    expect(d.traffic.tiempo).toBe("verde");
    expect(d.traffic.tiempoMesa).toBe("rojo");
    // Ámbar: hasta 1.2× la meta (mostrador 7 ≤ 7.2; mesa 17 ≤ 18).
    const a = computeDayView({ ...WEEK[0], tiempoMin: 7, tiempoMesaMin: 17 }, CENTRO);
    expect(a.traffic.tiempo).toBe("ambar");
    expect(a.traffic.tiempoMesa).toBe("ambar");
  });

  it("promedios semanales de los dos tiempos, cada uno con su semáforo", () => {
    const week = WEEK.map((d, i) => ({ ...d, tiempoMin: 5 + (i % 2), tiempoMesaMin: 12 }));
    const s = computeWeekSummary("2026-06-21", week, CENTRO);
    expect(s.tiempoProm).toBeCloseTo(5.43, 1);   // ≤6 verde
    expect(s.tiempoMesaProm).toBe(12);           // ≤15 verde
    expect(s.traffic.tiempo).toBe("verde");
    expect(s.traffic.tiempoMesa).toBe("verde");
  });
});

describe("resumen semanal — reproduce el deck de la reunión (Centro 21-27 jun)", () => {
  const s = computeWeekSummary("2026-06-21", WEEK, CENTRO);

  it("semana dom→sáb: 21 jun (domingo) → 27 jun (sábado)", () => {
    expect(weekStartOf("2026-06-25")).toBe("2026-06-21");
    expect(weekEndOf("2026-06-21")).toBe("2026-06-27");
  });

  it("ventas prom S/1,192.66 (94% de la meta) — igual que el deck", () => {
    expect(s.ventasProm).toBeCloseTo(1192.66, 1);
    expect(s.ventasPct).toBeCloseTo(94.2, 0);
    expect(s.traffic.ventas).toBe("rojo"); // 94% < 95%
  });

  it("mermas S/82 (≈1% de ventas, ≤4% ✓ verde) y NPS ~9.5 verde", () => {
    expect(s.mermasTotal).toBe(82);
    expect(s.mermasPct).toBeCloseTo(0.98, 1);
    expect(s.traffic.mermas).toBe("verde");
    expect(s.npsProm).toBeCloseTo(9.5, 1);
    expect(s.traffic.nps).toBe("verde");
  });

  it("mejor/peor día: alto Dom 21 S/1,798 · bajo Vie 26 S/801 — igual que el deck", () => {
    expect(s.best.ventas?.date).toBe("2026-06-21");
    expect(s.worst.ventas?.date).toBe("2026-06-26");
    expect(s.worst.ticket?.value).toBeCloseTo(18.2, 1);
  });
});

describe("WoW y KPI rojo priorizado — la mecánica de la reunión", () => {
  const current = computeWeekSummary("2026-06-21", WEEK, CENTRO);
  const prevWeek: KpiDaily[] = WEEK.map((d, i) => ({
    ...d,
    date: `2026-06-${String(14 + i).padStart(2, "0")}`,
    ventas: (d.ventas ?? 0) * 0.84, // semana anterior más floja
  }));
  const previous = computeWeekSummary("2026-06-14", prevWeek, CENTRO);

  it("detecta mejoras semana contra semana con el formato del deck", () => {
    const wow = compareWeeks(current, previous);
    const ventas = wow.find((w) => w.kpi === "Ventas")!;
    expect(ventas.direction).toBe("mejoro");
    expect(ventas.text).toMatch(/pts WoW/);
  });

  it("prioriza UN KPI rojo entre sedes (ventas primero, peor cumplimiento gana)", () => {
    const fonaviWeak = computeWeekSummary(
      "2026-06-21",
      WEEK.map((d) => ({ ...d, ventas: (d.ventas ?? 0) * 0.89 })), // ~84%
      { ...CENTRO, ventaDiaria: 1322, ticketRef: 27.8 },
    );
    const red = pickPriorityRed([
      { sede: "Fonavi", summary: fonaviWeak },
      { sede: "Centro", summary: current },
    ]);
    expect(red?.sede).toBe("Fonavi");
    expect(red?.kpi).toBe("Ventas diarias");
  });

  it("sin rojos → null (no inventa crisis)", () => {
    const good = computeWeekSummary(
      "2026-06-21",
      WEEK.map((d) => ({ ...d, ventas: 1400, personas: 50 })),
      CENTRO,
    );
    expect(pickPriorityRed([{ sede: "Centro", summary: good }])).toBeNull();
  });
});
