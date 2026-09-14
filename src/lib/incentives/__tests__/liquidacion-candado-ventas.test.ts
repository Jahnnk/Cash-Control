/**
 * La liquidación con las reglas desde octubre 2026:
 *   · sin piso de tráfico,
 *   · candado de ventas todo o nada contra el punto de equilibrio.
 *
 * Y la garantía para los meses anteriores: sin `requiereEquilibrio`, la
 * liquidación se comporta exactamente como antes.
 */
import { describe, it, expect } from "vitest";
import { computeLiquidation, computeProgress, type IncentiveConfigT, type DailyEntry, type StaffMember } from "../engine";
import type { EntradaCandadoVentas } from "../candado-ventas";

const NIVELES = [
  { nombre: "Nivel 1", delta: 1.5, bono_mt: 24, bono_tc: 48, bono_admin: 89, premio_mv: 68 },
  { nombre: "Nivel 2", delta: 3, bono_mt: 48, bono_tc: 97, bono_admin: 179, premio_mv: 134 },
];
const OCTUBRE: IncentiveConfigT = { ticketBase: 22.11, marginPct: 0.533, trafficFloor: null, poolPct: 0.4, levels: NIVELES, requiereEquilibrio: true };
const AGOSTO: IncentiveConfigT = { ticketBase: 24.7, marginPct: 0.533, trafficFloor: 49, poolPct: 0.4, levels: NIVELES };

const STAFF: StaffMember[] = [{ name: "Ana", jornada: "medio_turno", area: "salon", active: true, horasSemanales: 23.5 }];

/** 31 días de 40 personas (menos que el piso viejo de 49) con ticket S/24. */
const dias = (mes: string): DailyEntry[] =>
  Array.from({ length: 31 }, (_, i) => ({ date: `${mes}-${String(i + 1).padStart(2, "0")}`, personas: 40, revenue: 960, items: 100 }) as DailyEntry);

const candado = (o: Partial<EntradaCandadoVentas>): EntradaCandadoVentas => ({
  meta: 29000, provisional: false, mesesReferencia: ["2026-07", "2026-08", "2026-09"], ventas: 29760, diasConVenta: 31, ...o,
});

const liquidar = (config: IncentiveConfigT, mes: string, cv: EntradaCandadoVentas | null) =>
  computeLiquidation({
    month: mes, todayISO: "2026-12-01", config, staff: STAFF, dailies: dias(mes),
    unverifiedDays: 0, observedDays: [], mejorVendedor: null, candadoVentas: cv,
  });

describe("octubre en adelante: sin piso de tráfico", () => {
  it("40 personas/día ya no bloquean (antes el piso era 49)", () => {
    const r = liquidar(OCTUBRE, "2026-10", candado({}));
    expect(r.trafficOk).toBe(true);
    expect(r.trafficFloor).toBeNull();
    expect(r.nivel?.nombre).toBe("Nivel 1");
    expect(r.warnings.some((w) => w.includes("Piso de tráfico"))).toBe(false);
  });
});

describe("candado de ventas: todo o nada", () => {
  it("ventas cubren el punto de equilibrio → se paga el nivel del ticket", () => {
    const r = liquidar(OCTUBRE, "2026-10", candado({ ventas: 29760 }));
    expect(r.candadoVentas?.cumple).toBe(true);
    expect(r.nivel?.nombre).toBe("Nivel 1");
    expect(r.totalBonos).toBeGreaterThan(0);
  });

  it("ticket en Nivel 1 pero ventas debajo del punto de equilibrio → sin bono", () => {
    const r = liquidar(OCTUBRE, "2026-10", candado({ ventas: 28999 }));
    expect(r.candadoVentas?.cumple).toBe(false);
    expect(r.nivel).toBeNull();
    expect(r.totalBonos).toBe(0);
    expect(r.warnings.some((w) => w.includes("no cubren el punto de equilibrio"))).toBe(true);
    expect(r.blockers).toEqual([]); // se puede cerrar: el mes simplemente no paga
  });

  it("sin meta calculable no se paga a ciegas: el cierre queda bloqueado", () => {
    const r = liquidar(OCTUBRE, "2026-10", candado({ meta: null }));
    expect(r.blockers.some((b) => b.includes("No se pudo calcular la meta de ventas"))).toBe(true);
    expect(r.nivel).toBeNull();
  });

  it("sin entrada del candado (p. ej. sin permiso) también bloquea", () => {
    const r = liquidar(OCTUBRE, "2026-10", null);
    expect(r.blockers.length).toBeGreaterThan(0);
    expect(r.totalBonos).toBe(0);
  });
});

describe("los meses anteriores no cambian", () => {
  it("agosto: con piso 49 y 40 personas/día, sin nivel como siempre; sin candado", () => {
    const r = liquidar(AGOSTO, "2026-08", null);
    expect(r.trafficOk).toBe(false);
    expect(r.nivel).toBeNull();
    expect(r.candadoVentas).toBeNull();
    expect(r.blockers).toEqual([]);
  });
});

describe("el panel muestra el candado solo cuando la política lo pide", () => {
  it("octubre: candado presente con proyección", () => {
    const p = computeProgress(OCTUBRE, STAFF, dias("2026-10").slice(0, 12), 31, candado({ ventas: 11520, diasConVenta: 12 }));
    expect(p.candadoVentas).not.toBeNull();
    expect(p.candadoVentas?.proyeccion).toBeCloseTo(29760, 0);
    expect(p.candadoVentas?.enCamino).toBe(true);
    expect(p.traffic.cumple).toBe(true);
  });

  it("agosto: sin candado aunque se lo pasen", () => {
    const p = computeProgress(AGOSTO, STAFF, dias("2026-08"), 31, candado({}));
    expect(p.candadoVentas).toBeNull();
  });
});
