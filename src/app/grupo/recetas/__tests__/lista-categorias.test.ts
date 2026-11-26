import { describe, it, expect } from "vitest";
import { etiquetaCategoria } from "../lista-categorias";

describe("nombre de la categoría", () => {
  it("las mayúsculas del Excel se vuelven nombre normal; vacío = sin categoría", () => {
    expect(etiquetaCategoria("PANADERÍA")).toBe("Panadería");
    expect(etiquetaCategoria("Pastelería")).toBe("Pastelería");
    expect(etiquetaCategoria("INSUMOS / SUBRECETAS")).toBe("Insumos / Subrecetas");
    expect(etiquetaCategoria("sub-recetas")).toBe("Sub-recetas");
    expect(etiquetaCategoria(null)).toBe("Sin categoría");
  });
});
