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

import { applyPartnerFilter, type PartnerReportData } from "./partner-report";

const BASE: PartnerReportData = {
  monthLabel: "Junio 2026",
  generatedAt: "10/06/2026",
  debtorName: "Fonavi",
  sharedExpenses: [
    { date: "2026-06-06", category: "Local", concept: "Alquiler junio", amountTotal: 2700, atelierPart: 1800.09, fonaviPart: 899.91, receivableStatus: "collected", collected: 899.91, attachments: [{ filename: "pago.jpg", contentType: "image/jpeg", signedUrl: "https://x/1" }] },
    { date: "2026-06-08", category: "Servicios", concept: "Gas", amountTotal: 644.2, atelierPart: 450.94, fonaviPart: 193.26, receivableStatus: "pending", collected: 0, attachments: [] },
    { date: "2026-06-09", category: "Servicios", concept: "Luz", amountTotal: 300, atelierPart: 200, fonaviPart: 100, receivableStatus: "partial", collected: 40, attachments: [] },
  ],
  reimbursements: [
    { date: "2026-06-07", amount: 899.91, method: "efectivo", note: "Alquiler", attachments: [] },
  ],
  totals: { fonaviPartMonth: 1193.17, reimbursedMonth: 899.91, pendingNow: 253.26 },
};

describe("applyPartnerFilter", () => {
  it("'todos' devuelve el reporte intacto (comportamiento actual sin cambios)", () => {
    expect(applyPartnerFilter(BASE, "todos")).toEqual(BASE);
  });

  it("'pendientes' deja solo los por cobrar no saldados (incluye parciales) y quita reembolsos", () => {
    const r = applyPartnerFilter(BASE, "pendientes");
    expect(r.sharedExpenses.map((e) => e.concept)).toEqual(["Gas", "Luz"]);
    expect(r.reimbursements).toEqual([]);
    expect(r.totals.fonaviPartMonth).toBeCloseTo(293.26, 2); // 193.26 + 100
    expect(r.totals.reimbursedMonth).toBe(0);
    expect(r.totals.pendingNow).toBeCloseTo(253.26, 2); // el saldo global no cambia
  });

  it("'pagados' deja solo los cobrados (con constancias) y mantiene los reembolsos del mes", () => {
    const r = applyPartnerFilter(BASE, "pagados");
    expect(r.sharedExpenses.map((e) => e.concept)).toEqual(["Alquiler junio"]);
    expect(r.sharedExpenses[0].attachments).toHaveLength(1); // constancia incluida
    expect(r.reimbursements).toHaveLength(1);
    expect(r.totals.fonaviPartMonth).toBeCloseTo(899.91, 2);
    expect(r.totals.reimbursedMonth).toBeCloseTo(899.91, 2);
  });

  it("filtro vacío detectable: 'pendientes' sobre un mes todo cobrado queda sin filas", () => {
    const allCollected = { ...BASE, sharedExpenses: BASE.sharedExpenses.map((e) => ({ ...e, receivableStatus: "collected" })) };
    const r = applyPartnerFilter(allCollected, "pendientes");
    expect(r.sharedExpenses).toHaveLength(0);
    expect(r.reimbursements).toHaveLength(0);
  });
});
