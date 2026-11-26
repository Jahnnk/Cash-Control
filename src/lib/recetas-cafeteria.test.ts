/**
 * Recetas de cafetería (26-nov-2026): importar del Excel con las sub-recetas, el pan de Atelier a su precio interno y
 * las preparaciones sin receta a su precio del Excel; y costearlas con la misma lista que todo el sistema.
 */
import { describe, it, expect } from "vitest";
import { catalogoBaseCafeteria, conIdsReales, planImportacion, REF_FIJO, ID_PROVISIONAL } from "./recetas-cafeteria";
import { catalogoEfectivo, type RecetaSistema } from "./recetas";
import type { Bloque } from "./costos-preparaciones-excel";

const linea = (sku: string, nombre: string, unidad: string, q: number, total: number, merma = 0) =>
  ({ sku, nombre, unidad, q, cantidad: q / (1 - merma), total, aporte: total / (1 - merma) });
const bloque = (hoja: string, nombre: string, ings: ReturnType<typeof linea>[], extra: Partial<Bloque> = {}): Bloque =>
  ({ hoja, fila: 1, nombre, archivado: false, kg: null, rendimiento: 1, merma: 0, costoUnidad: null, rindeKg: false, ingredientes: ings, ...extra });

const mayonesa = bloque("CAF · Sub-Recetas", "Mayonesa", [linea("HV001", "Huevo", "g", 100, 1), linea("AC003", "Aceite", "ml", 900, 5.8)], { kg: 6.8 });
const sanguche = bloque("CAF · Sánguches", "Roast Beef", [
  linea("PN003", "Focaccia Clásica Porción sándwich", "und", 1, 1.07, 0.02),
  linea("SR040", "Mayonesa Yayi's", "ml", 20, 0.136, 0.02),
  linea("SR045", "Tártara", "g", 30, 0.18826, 0.02),
  linea("FR019", "Lechuga", "g", 30, 0.257, 0.02),
], { costoUnidad: 1.0 });

const p = planImportacion({
  subrecetas: [mayonesa], productos: [sanguche],
  srNombre: new Map([["SR040", "Mayonesa Yayi's"], ["SR045", "Tártara"]]),
  panes: [{ sku: "PN003", nombre: "Focaccia Clásica Porción sándwich", precio: 1.07 }],
  panAtelier: { PN003: "AT-059" }, atelierInterno: new Map([["AT-059", 4.28]]),
  insumos: new Map([["HV001", { unidad: "kg" as const, precio: 10 }], ["AC003", { unidad: "l" as const, precio: 6.44 }], ["FR019", { unidad: "kg" as const, precio: 8.57 }]]),
  carta: [{ ref: "CF-001", nombre: "Roast Beef", nombreCarta: null }],
});

describe("importar las recetas CAF del Excel", () => {
  it("sub-receta por kg, producto enlazado a la carta y la merma común de las líneas", () => {
    expect(p.recetas).toHaveLength(2);
    const [sub, prod] = p.recetas;
    expect(sub).toMatchObject({ id: ID_PROVISIONAL, tipo: "preparacion", categoria: "Sub-recetas", reemplaza: null });
    expect(prod).toMatchObject({ tipo: "producto", categoria: "Sánguches", reemplaza: "CF-001" });
    expect(prod.detalle.merma).toBeCloseTo(0.02, 4);
    expect(prod.detalle.ingredientes.map((i) => i.cantidad)).toEqual([0.25, 20, 30, 30]);
  });

  it("el pan es ¼ de la focaccia de Atelier; la mayonesa, su sub-receta; la tártara, precio fijo del Excel", () => {
    const refs = p.recetas[1].detalle.ingredientes.map((i) => i.ref);
    expect(refs).toEqual(["AT-059", `REC:${ID_PROVISIONAL}`, REF_FIJO("tartara"), "FR019"]);
    expect(p.fijos).toEqual([{ clave: "tartara", nombre: "Tártara (precio del Excel)", unidad: "kg", precio: 6.2753 }]);
  });

  it("los ids provisionales se cambian por los reales", () => {
    const d = conIdsReales(p.recetas[1].detalle, new Map([[ID_PROVISIONAL, 45]]));
    expect(d.ingredientes[1].ref).toBe("REC:45");
  });
});

describe("costear con la lista de las cafeterías", () => {
  it("insumos de cafetería, pan a precio interno y sub-recetas", () => {
    const base = catalogoBaseCafeteria(
      [{ sku: "HV001", nombre: "Huevo", unidad: "kg", precio: 10 }, { sku: "AC003", nombre: "Aceite", unidad: "l", precio: 6.44 }, { sku: "FR019", nombre: "Lechuga", unidad: "kg", precio: 8.57 }],
      [{ ref: "AT-059", nombre: "Focaccia Clásica 1/4", interno: 4.28 }],
    );
    base.push({ ref: REF_FIJO("tartara"), tipo: "insumo", nombre: "Tártara", categoria: null, unidad: "kg", costo: 6.2753 });
    const recetas: RecetaSistema[] = p.recetas.map((x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, categoria: x.categoria, detalle: x.detalle, reemplaza: x.reemplaza }));
    const ef = catalogoEfectivo(base, recetas);
    const s = ef.find((i) => i.nombre === "Roast Beef")!;
    // (1.07 + 0.02 × 6.8 + 0.030 × 6.2753 + 0.030 × 8.57) ÷ 0.98
    expect(s.costo).toBeCloseTo((1.07 + 0.136 + 0.188259 + 0.2571) / 0.98, 3);
    expect(s.reemplaza).toBe("CF-001");
  });
});
