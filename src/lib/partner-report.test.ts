import { describe, it, expect } from "vitest";
import { computePartnerTotals, monthLabelEs, monthRangeOf } from "./partner-report";

describe("computePartnerTotals", () => {
  it("suma la parte de Fonavi del mes y los reembolsos, y arrastra el pendiente actual", () => {
    const t = computePartnerTotals(
      [{ fonaviPart: 193.26 }, { fonaviPart: 900 }, { fonaviPart: 54.4 }],
      [{ amount: 500 }, { amount: 193.26 }],
      1147.66,
    );
    expect(t.fonaviPartMonth).toBeCloseTo(1147.66, 2);
    expect(t.reimbursedMonth).toBeCloseTo(693.26, 2);
    expect(t.pendingNow).toBeCloseTo(1147.66, 2);
  });

  it("mes vacío → ceros (y el pendiente igual se reporta)", () => {
    const t = computePartnerTotals([], [], 899.91);
    expect(t.fonaviPartMonth).toBe(0);
    expect(t.reimbursedMonth).toBe(0);
    expect(t.pendingNow).toBeCloseTo(899.91, 2);
  });

  it("redondea a 2 decimales (sin residuos float)", () => {
    const t = computePartnerTotals(
      [{ fonaviPart: 0.1 }, { fonaviPart: 0.2 }],
      [],
      0,
    );
    expect(t.fonaviPartMonth).toBe(0.3);
  });
});

describe("monthLabelEs / monthRangeOf", () => {
  it("etiqueta en español", () => {
    expect(monthLabelEs("2026-06")).toBe("Junio 2026");
    expect(monthLabelEs("2026-01")).toBe("Enero 2026");
  });
  it("rango del mes calendario completo (incluye febrero bisiesto)", () => {
    expect(monthRangeOf("2026-06")).toEqual({ start: "2026-06-01", end: "2026-06-30" });
    expect(monthRangeOf("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRangeOf("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(monthRangeOf("2026-12")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });
});
