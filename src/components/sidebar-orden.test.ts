/** El menú de Grupo: Productos justo debajo de Sistema de Dirección (5-oct-2026); las sedes no cambian. */
import { describe, it, expect, vi } from "vitest";
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/grupo/dashboard" }));
vi.mock("@/app/actions/role", () => ({ clearRole: vi.fn() }));
import { navPara } from "./sidebar";

const segmentos = (s: Parameters<typeof navPara>[0]) => navPara(s).map((i) => i.segment);

describe("menú lateral", () => {
  it("Grupo: Productos va justo debajo de Sistema de Dirección", () => {
    const g = segmentos("grupo");
    expect(g.indexOf("productos")).toBe(g.indexOf("direccion") + 1);
    expect(g.filter((x) => x === "productos")).toHaveLength(1);
  });

  it("Grupo conserva el resto del menú", () => {
    const g = segmentos("grupo");
    for (const s of ["dashboard", "direccion", "highlight", "supervisiones", "por-definir", "presupuesto", "recetas", "reportes", "incentivos", "configuracion"]) expect(g).toContain(s);
  });

  it("las sedes siguen con Productos en su lugar de siempre (después de Propinas), una sola vez", () => {
    for (const sede of ["fonavi", "centro", "atelier"] as const) {
      const m = segmentos(sede);
      expect(m.filter((x) => x === "productos")).toHaveLength(1);
      expect(m.indexOf("productos")).toBeGreaterThan(m.indexOf("propinas"));
      expect(m.indexOf("productos")).toBeLessThan(m.indexOf("panel"));
    }
  });

  it("Grupo: Reportes va justo debajo de Dashboard, una sola vez", () => {
    const g = segmentos("grupo");
    expect(g.slice(0, 4)).toEqual(["dashboard", "reportes", "direccion", "productos"]);
    expect(g.filter((x) => x === "reportes")).toHaveLength(1);
  });

  it("las sedes siguen con Reportes donde estaba (después del Panel)", () => {
    for (const sede of ["fonavi", "centro", "atelier"] as const) {
      const m = segmentos(sede);
      expect(m.filter((x) => x === "reportes")).toHaveLength(1);
      expect(m.indexOf("reportes")).toBeGreaterThan(m.indexOf("panel"));
    }
  });
});
