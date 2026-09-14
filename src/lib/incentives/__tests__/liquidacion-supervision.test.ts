/**
 * El tercer requisito del bono (desde octubre 2026): las observaciones
 * CRÍTICAS de las supervisiones de Juani corregidas a tiempo.
 */
import { describe, it, expect } from "vitest";
import { computeLiquidation, computeProgress, type IncentiveConfigT, type DailyEntry, type StaffMember } from "../engine";
import type { EntradaSupervision, Observacion } from "../../supervisiones";

const NIVELES = [{ nombre: "Nivel 1", delta: 1.5, bono_mt: 24, bono_tc: 48, bono_admin: 89, premio_mv: 68 }];
const OCTUBRE: IncentiveConfigT = { ticketBase: 22.11, marginPct: 0.533, trafficFloor: null, poolPct: 0.4, levels: NIVELES, requiereSupervision: true };
const STAFF: StaffMember[] = [{ name: "Ana", jornada: "medio_turno", area: "salon", active: true, horasSemanales: 23.5 }];
const dias: DailyEntry[] = Array.from({ length: 31 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, personas: 40, revenue: 960, items: 100 }) as DailyEntry);

const obs = (o: Partial<Observacion>): Observacion => ({
  id: "o", gravedad: "critica", estado: "confirmada", fechaVisita: "2026-10-06",
  plazoHasta: "2026-10-07T15:00:00.000Z", corregidaEn: "2026-10-07T10:00:00.000Z", vencidaAlgunaVez: false, ...o,
});
const visita = { puntosEvaluados: 10, puntosCumplidos: 9 };
const entrada = (observaciones: Observacion[], visitas = [visita]): EntradaSupervision => ({ visitas, observaciones, ahoraISO: "2026-11-02T12:00:00.000Z" });

const liquidar = (supervision: EntradaSupervision | null, config = OCTUBRE) =>
  computeLiquidation({
    month: "2026-10", todayISO: "2026-11-02", config, staff: STAFF, dailies: dias,
    unverifiedDays: 0, observedDays: [], mejorVendedor: "Ana", supervision,
  });

describe("requisito de supervisiones en la liquidación", () => {
  it("críticas corregidas a tiempo → se paga", () => {
    const r = liquidar(entrada([obs({})]));
    expect(r.supervision?.estado).toBe("al_dia");
    expect(r.nivel?.nombre).toBe("Nivel 1");
    expect(r.blockers).toEqual([]);
  });

  it("una crítica corregida tarde → sin bono, pero se puede cerrar", () => {
    const r = liquidar(entrada([obs({ corregidaEn: "2026-10-07T18:00:00.000Z" })]));
    expect(r.supervision?.estado).toBe("incumplido");
    expect(r.nivel).toBeNull();
    expect(r.totalBonos).toBe(0);
    expect(r.blockers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("no se corrigieron a tiempo"))).toBe(true);
  });

  it("una normal vencida no quita el bono", () => {
    const r = liquidar(entrada([obs({ gravedad: "normal", estado: "abierta", corregidaEn: null })]));
    expect(r.nivel?.nombre).toBe("Nivel 1");
  });

  it("sin visitas en el mes → cumple", () => {
    const r = liquidar(entrada([], []));
    expect(r.supervision?.estado).toBe("sin_visitas");
    expect(r.nivel?.nombre).toBe("Nivel 1");
  });

  it("crítica esperando la confirmación de Juani → bloquea el cierre", () => {
    const r = liquidar(entrada([obs({ estado: "corregida" })]));
    expect(r.blockers.some((b) => b.includes("esperan la confirmación de Juani"))).toBe(true);
  });

  it("sin poder leer las supervisiones → bloquea (nunca paga a ciegas)", () => {
    const r = liquidar(null);
    expect(r.blockers.some((b) => b.includes("No se pudieron leer las supervisiones"))).toBe(true);
    expect(r.totalBonos).toBe(0);
  });

  it("un mes cuya política no pide supervisiones ignora la entrada", () => {
    const r = liquidar(entrada([obs({ corregidaEn: "2026-10-07T18:00:00.000Z" })]), { ...OCTUBRE, requiereSupervision: false });
    expect(r.supervision).toBeNull();
    expect(r.nivel?.nombre).toBe("Nivel 1");
  });

  it("el panel muestra el resumen solo cuando la política lo pide", () => {
    const e = entrada([obs({ estado: "abierta", corregidaEn: null, plazoHasta: "2026-11-03T00:00:00.000Z" })]);
    expect(computeProgress(OCTUBRE, STAFF, dias, 31, null, e).supervision?.estado).toBe("pendiente");
    expect(computeProgress({ ...OCTUBRE, requiereSupervision: false }, STAFF, dias, 31, null, e).supervision).toBeNull();
  });
});
