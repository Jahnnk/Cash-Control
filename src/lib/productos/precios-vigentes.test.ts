/**
 * Precios de insumos editados en el sistema (fase 1 de «la carta vive en el sistema», 18-nov-2026).
 */
import { describe, it, expect } from "vitest";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";
import { ajustarCatalogo, ajustarDesglose, factoresDe, preciosVigentes, type FotoConArchivo } from "./precios-vigentes";

const foto = (fecha: string, sku: string, precio: number, archivo = "Pricing.xlsx", origen: FotoConArchivo["origen"] = "Atelier"): FotoConArchivo =>
  ({ fecha, origen, sku, nombre: sku, unidad: "kg", precio, archivo });

describe("precio vigente", () => {
  it("el cambio del sistema manda sobre el Excel y se compara con él", () => {
    const [v] = preciosVigentes([foto("2026-11-07", "AC005", 28), foto("2026-11-20", "AC005", 33.6, "Sistema")]);
    expect(v).toMatchObject({ precio: 33.6, base: 28, delSistema: true, cambioPct: 20, fecha: "2026-11-20" });
  });
  it("mismo día que el Excel: manda el sistema", () => {
    const [v] = preciosVigentes([foto("2026-11-07", "AC005", 30, "Sistema"), foto("2026-11-07", "AC005", 28)]);
    expect(v).toMatchObject({ precio: 30, base: 28 });
  });
  it("un Excel nuevo pasa a ser la base: el cambio anterior ya no mueve costos", () => {
    const vs = preciosVigentes([foto("2026-11-07", "AC005", 28), foto("2026-11-20", "AC005", 33.6, "Sistema"), foto("2026-12-05", "AC005", 34)]);
    expect(vs[0]).toMatchObject({ precio: 34, base: 34, delSistema: false, cambioPct: 0 });
    expect(factoresDe(vs).hayCambios).toBe(false);
  });
  it("el factor separa Atelier de las cafeterías y entiende las refs con ·2", () => {
    const f = factoresDe(preciosVigentes([foto("2026-11-07", "OT015", 10), foto("2026-11-20", "OT015", 12, "Sistema")]));
    expect(f.de("Atelier", "OT015·2")).toBeCloseTo(1.2);
    expect(f.de("Cafetería", "OT015")).toBe(1);
    expect(f.de("Atelier", null)).toBe(1);
  });
});

describe("costos con los precios vigentes", () => {
  const f = factoresDe(preciosVigentes([foto("2026-11-07", "AC005", 20), foto("2026-11-20", "AC005", 30, "Sistema")]));

  it("Atelier: el insumo sube y la receta del Excel suma la diferencia", () => {
    const excel: CostoPreparacion[] = [
      { ref: "AC005", tipo: "insumo", nombre: "Mantequilla", categoria: null, unidad: "kg", costo: 20 },
      { ref: "HR009", tipo: "insumo", nombre: "Harina", categoria: null, unidad: "kg", costo: 3 },
      { ref: "SR001", tipo: "preparacion", nombre: "Masa", categoria: null, unidad: "kg", costo: 11.5,
        detalle: { rendimiento: null, merma: 0, ingredientes: [{ ref: "AC005", nombre: "Mantequilla", unidad: "g", cantidad: 500 }, { ref: "HR009", nombre: "Harina", unidad: "g", cantidad: 500 }] } },
      { ref: "AT-001", tipo: "producto", nombre: "Empanada", categoria: null, unidad: "und", costo: 1.3,
        detalle: { rendimiento: 10, merma: 0, ingredientes: [{ ref: "SR001", nombre: "Masa", unidad: "g", cantidad: 1000 }] } },
    ] as CostoPreparacion[];
    const r = ajustarCatalogo(excel, f);
    expect(r.find((i) => i.ref === "AC005")!.costo).toBeCloseTo(30);
    // Masa: 0.5 kg de mantequilla × S/ 10 más = +S/ 5 por kg.
    expect(r.find((i) => i.ref === "SR001")!.costo).toBeCloseTo(16.5);
    // Empanada: 1 kg de masa en 10 unidades = +S/ 0.50 cada una (sobre el costo del Excel, 1.30).
    expect(r.find((i) => i.ref === "AT-001")!.costo).toBeCloseTo(1.8);
  });

  it("carta: el desglose sube por lo que pesa el insumo; sin cambios queda igual", () => {
    const d = [{ sku: "AC005", nombre: "Mantequilla", costo: 1 }, { sku: "HR009", nombre: "Harina", costo: 0.5 }];
    const r = ajustarDesglose(d, "Atelier", f);
    expect(r.delta).toBeCloseTo(0.5);
    expect(r.desglose[0].costo).toBe(1.5);
    expect(ajustarDesglose(d, "Cafetería", f).delta).toBe(0);
    const sin = factoresDe([]);
    expect(ajustarCatalogo([], sin)).toEqual([]);
  });
});
