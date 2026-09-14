import { describe, it, expect } from "vitest";
import { ventasInternasDelGrupo } from "../ventas-internas-grupo";

describe("ventasInternasDelGrupo", () => {
  it("mes cerrado: se descuenta lo mismo de ventas y de variables", () => {
    const r = ventasInternasDelGrupo([
      { businessId: 1, meses: ["2026-08"], compraAtelierPorMes: {} },
      { businessId: 2, meses: ["2026-08"], compraAtelierPorMes: { "2026-08": 15367 } },
      { businessId: 3, meses: ["2026-08"], compraAtelierPorMes: { "2026-08": 13726 } },
    ]);
    expect(r).toEqual({ ventas: 29093, variables: 29093 });
  });

  it("sin Atelier en el consolidado no hay nada interno que descontar", () => {
    const r = ventasInternasDelGrupo([
      { businessId: 2, meses: ["2026-08"], compraAtelierPorMes: { "2026-08": 15367 } },
    ]);
    expect(r).toEqual({ ventas: 0, variables: 0 });
  });

  it("referencia: cada lado con sus meses", () => {
    // Atelier aporta abr–ago. Fonavi solo may–ago (abril le faltaban
    // días de venta), pero en abril sí le compró a Atelier y esa venta
    // está dentro de las ventas de Atelier.
    const r = ventasInternasDelGrupo([
      { businessId: 1, meses: ["2026-04", "2026-05"], compraAtelierPorMes: {} },
      { businessId: 2, meses: ["2026-05"], compraAtelierPorMes: { "2026-04": 100, "2026-05": 200 } },
    ]);
    expect(r).toEqual({ ventas: 300, variables: 200 });
  });
});
