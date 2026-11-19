/**
 * La carta en Excel desde el sistema (fase 3, 18-nov-2026).
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { estadoEnCarta, renderCartaXlsx } from "./carta-xlsx";
import type { ProductoCarta } from "@/app/actions/carta";

const producto = (p: Partial<ProductoCarta>): ProductoCarta => ({
  ref: "CF-011", nombre: "Latte", seccion: "Café Caliente", origen: "Cafetería", enCarta: true, precio: 12, costo: 3, costoInsumos: 3,
  excel: null, marca: { precio: false, costo: false, seccion: false, nuevo: false }, actualizadoEl: null, receta: null, byte: [], ...p,
});

describe("Excel de la carta", () => {
  it("el estado en la carta en palabras", () => {
    expect(estadoEnCarta(producto({}))).toBe("En carta");
    expect(estadoEnCarta(producto({ seccion: null }))).toBe("Exhibidor / fuera de carta");
    expect(estadoEnCarta(producto({ byte: [{ nombre: "LATTE", clave: "latte", archivado: true }] }))).toBe("Retirado");
  });

  it("arma las hojas con la carta, los insumos y las recetas nuevas", async () => {
    const nuevo = producto({ ref: "CF-S001", nombre: "Sánguche de lomo", marca: { precio: false, costo: false, seccion: false, nuevo: true },
      receta: { tipo: "tienda", porciones: 1, merma: 0, lineas: [{ tipo: "insumo", ref: "CA001", nombre: "Lomo", cantidad: 100, unidad: "g" }] } });
    const { blob, filename } = await renderCartaXlsx({
      carta: [producto({}), nuevo],
      insumos: [{ origen: "Cafetería", sku: "CA001", nombre: "Lomo", unidad: "kg", precio: 40, base: 38, fechaBase: "2026-11-07", fecha: "2026-11-18", delSistema: true, cambioPct: 5.3 }],
      atelier: [], generado: "2026-11-18",
    });
    expect(filename).toBe("Carta-y-costos-Yayis-2026-11-18.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Para empezar", "PRICING", "CAF · Insumos", "ATE · Insumos", "Recetas nuevas", "ATE · Costos"]);
    expect(wb.getWorksheet("PRICING")!.getRow(3).getCell(11).value).toBe("producto nuevo");
    // 100 g de lomo a S/ 40 el kg = S/ 4.
    expect(wb.getWorksheet("Recetas nuevas")!.getRow(2).getCell(8).value).toBe(4);
    expect(wb.getWorksheet("CAF · Insumos")!.getRow(2).getCell(6).value).toBe("Sistema");
  });
});
