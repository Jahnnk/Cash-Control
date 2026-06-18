import { describe, it, expect } from "vitest";
import { reorderColumn } from "./dnd-reorder";

describe("reorderColumn", () => {
  it("reordena dentro de la misma columna (sube un item)", () => {
    expect(reorderColumn(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("reordena dentro de la misma columna (baja un item)", () => {
    expect(reorderColumn(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });

  it("inserta un item que viene de OTRO día en la posición del 'over'", () => {
    // 'x' no estaba en la columna destino (vino de otro día).
    expect(reorderColumn(["a", "b", "c"], "x", "b")).toEqual(["a", "x", "b", "c"]);
  });

  it("soltar en área vacía (overId null) manda al final", () => {
    expect(reorderColumn(["a", "b"], "x", null)).toEqual(["a", "b", "x"]);
  });

  it("columna destino vacía: queda solo el item movido", () => {
    expect(reorderColumn([], "x", null)).toEqual(["x"]);
  });

  it("soltar sobre sí mismo no cambia el orden", () => {
    expect(reorderColumn(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });

  it("el item movido nunca queda duplicado", () => {
    const out = reorderColumn(["a", "b", "c"], "a", "b");
    expect(out.filter((x) => x === "a")).toHaveLength(1);
    expect(out).toEqual(["b", "a", "c"]);
  });

  it("overId inexistente en destino cae al final (no rompe)", () => {
    expect(reorderColumn(["a", "b"], "x", "zzz")).toEqual(["a", "b", "x"]);
  });
});
