import { describe, it, expect } from "vitest";
import { tonoDeFecha, fechaDelGrupo, sedesQueArrastran, diasDeRezago, ddmm } from "../frescura-importables";

const HOY = "2026-10-15";

describe("frescura de lo que sube Jahnn", () => {
  it("al día hasta 8 días; atrasado hasta 15; después, muy atrasado", () => {
    expect(tonoDeFecha("2026-10-14", HOY)).toBe("al-dia");
    expect(tonoDeFecha("2026-10-07", HOY)).toBe("al-dia");   // 8 días
    expect(tonoDeFecha("2026-10-06", HOY)).toBe("atrasado"); // 9 días
    expect(tonoDeFecha("2026-09-30", HOY)).toBe("atrasado"); // 15 días: la menor rotación de setiembre
    expect(tonoDeFecha("2026-09-29", HOY)).toBe("muy-atrasado");
    expect(tonoDeFecha(null, HOY)).toBe("sin-datos");
  });

  it("el grupo vale por su peor sede, y sin dato en una sede no hay dato del grupo", () => {
    expect(fechaDelGrupo(["2026-10-13", "2026-10-14", "2026-10-12"])).toBe("2026-10-12");
    expect(fechaDelGrupo(["2026-10-13", null, "2026-10-12"])).toBeNull();
    expect(fechaDelGrupo([])).toBeNull();
  });

  it("dice quién arrastra al grupo", () => {
    expect(sedesQueArrastran([{ nombre: "Fonavi", hasta: "2026-10-13" }, { nombre: "Centro", hasta: "2026-10-14" }, { nombre: "Atelier", hasta: "2026-10-12" }])).toEqual(["Atelier"]);
    expect(sedesQueArrastran([{ nombre: "Fonavi", hasta: "2026-10-13" }, { nombre: "Centro", hasta: null }])).toEqual(["Centro"]);
    expect(sedesQueArrastran([{ nombre: "Fonavi", hasta: "2026-10-12" }, { nombre: "Centro", hasta: "2026-10-12" }])).toEqual(["Fonavi", "Centro"]);
  });

  it("formatea y mide el rezago", () => {
    expect(ddmm("2026-10-05")).toBe("05/10");
    expect(ddmm(null)).toBe("—");
    expect(diasDeRezago("2026-10-10", HOY)).toBe(5);
    expect(diasDeRezago("2026-10-20", HOY)).toBe(0);
  });
});
