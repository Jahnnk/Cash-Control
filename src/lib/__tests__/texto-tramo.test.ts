import { describe, expect, it } from "vitest";
import { textoTramo } from "../productos/texto-tramo";

describe("de qué meses son la venta y las unidades del producto", () => {
  it("dice el mes o el tramo, con el año una sola vez si no cambia", () => {
    expect(textoTramo(["2026-10"])).toBe("total de octubre 2026");
    expect(textoTramo(["2026-08", "2026-09", "2026-10"])).toBe("total de agosto a octubre 2026 (3 meses)");
    expect(textoTramo(["2025-12", "2026-01"])).toBe("total de diciembre 2025 a enero 2026 (2 meses)");
    expect(textoTramo([])).toBe("sin meses con datos");
  });
});
