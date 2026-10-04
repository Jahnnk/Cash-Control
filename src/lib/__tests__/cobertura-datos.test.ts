import { describe, it, expect } from "vitest";
import { coberturaDeRangos, textoHueco, fechaCorta, diasHasta } from "../productos/cobertura-datos";

describe("cobertura de los reportes de productos", () => {
  it("une los reportes (aunque se pisen) y da el primer y último día", () => {
    const c = coberturaDeRangos([
      { desde: "2026-04-01", hasta: "2026-04-30" }, { desde: "2026-05-01", hasta: "2026-05-31" },
      { desde: "2026-09-01", hasta: "2026-09-26" }, { desde: "2026-09-01", hasta: "2026-09-30" },
    ]);
    expect(c).toMatchObject({ desde: "2026-04-01", hasta: "2026-09-30" });
  });

  it("encuentra los huecos del medio: junio a agosto sin datos, y 30–31 de agosto", () => {
    const c = coberturaDeRangos([
      { desde: "2026-04-01", hasta: "2026-05-31" },
      { desde: "2026-07-01", hasta: "2026-07-31" },
      { desde: "2026-08-01", hasta: "2026-08-29" },
      { desde: "2026-09-01", hasta: "2026-09-30" },
    ]);
    expect(c.huecos).toEqual([{ desde: "2026-06-01", hasta: "2026-06-30" }, { desde: "2026-08-30", hasta: "2026-08-31" }]);
    expect(c.huecos.map(textoHueco)).toEqual(["junio", "30–31 ago"]);
  });

  it("períodos pegados no dejan hueco", () => {
    expect(coberturaDeRangos([{ desde: "2026-09-01", hasta: "2026-09-15" }, { desde: "2026-09-16", hasta: "2026-09-30" }]).huecos).toEqual([]);
  });

  it("sin reportes no inventa nada", () => {
    expect(coberturaDeRangos([])).toEqual({ desde: null, hasta: null, huecos: [] });
  });

  it("textos cortos", () => {
    expect(fechaCorta("2026-04-01")).toBe("1 abr");
    expect(textoHueco({ desde: "2026-08-28", hasta: "2026-09-03" })).toBe("28 ago – 3 set");
    expect(textoHueco({ desde: "2026-08-30", hasta: "2026-08-30" })).toBe("30 ago");
    expect(diasHasta("2026-09-30", "2026-10-04")).toBe(4);
  });
});
