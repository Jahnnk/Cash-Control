import { describe, it, expect } from "vitest";
import { parseCajaChica, parseAmount } from "./caja-chica-parser";

// Fixture con la MISMA estructura del Excel real de reposición.
const ROWS: string[][] = [
  ["Yayi's", "", "", "", ""],
  ["Gastos Pendientes por Reponer", "", "", "", ""],
  ["Periodo: Junio 2026", "", "", "", ""],
  ["Generado: 2026-07-01", "", "", "", ""],
  ["", "", "", "", ""],
  ["N°", "Descripcion", "Fecha", "Metodo de pago", "Monto"],
  ["Insumos", "", "", "", ""],
  ["1", "Picador de cebolla", "2026-06-24", "Cuentas", "299.00"],
  ["2", "Pago Sra Elena", "2026-06-22", "Cuentas", "155.50"],
  ["", "", "", "Subtotal Insumos", "454.50"],
  ["Deliverys", "", "", "", ""],
  ["1", "Deliverys centro del 21 al 27", "2026-06-22", "Cuentas", "91.00"],
  ["2", "2 delivery de huevos", "2026-06-23", "Cuentas", "14.00"],
  ["", "", "", "Subtotal Deliverys", "105.00"],
  ["Packaging", "", "", "", ""],
  ["1", "Cajas", "2026-06-22", "Cuentas", "7.00"],
  ["", "", "", "Subtotal Packaging", "7.00"],
  ["", "", "", "", ""],
  ["", "", "", "TOTAL GENERAL", "566.50"],
];

describe("parseAmount", () => {
  it("quita comas de miles y parsea", () => {
    expect(parseAmount("1,051.65")).toBe(1051.65);
    expect(parseAmount("299.00")).toBe(299);
    expect(parseAmount("S/ 7.00")).toBe(7);
    expect(Number.isNaN(parseAmount(""))).toBe(true);
  });
});

describe("parseCajaChica", () => {
  it("extrae los gastos con categoría, concepto, fecha y monto exactos", () => {
    const r = parseCajaChica(ROWS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(5);
    expect(r.generado).toBe("2026-07-01");
    expect(r.periodo).toBe("Junio 2026");

    const insumos = r.items.filter((i) => i.category === "Insumos");
    expect(insumos.map((i) => i.concept)).toEqual(["Picador de cebolla", "Pago Sra Elena"]);
    expect(insumos.map((i) => i.amount)).toEqual([299, 155.5]);
    expect(insumos[0].itemDate).toBe("2026-06-24");
    expect(insumos[0].rawMethod).toBe("Cuentas");

    expect(r.items.find((i) => i.category === "Packaging")?.amount).toBe(7);
    expect(r.total).toBe(566.5);
    expect(r.declaredTotal).toBe(566.5);
    expect(r.warnings).toEqual([]);
  });

  it("NO cuenta las filas de Subtotal ni TOTAL GENERAL como gastos", () => {
    const r = parseCajaChica(ROWS);
    if (!r.ok) throw new Error("debía parsear");
    expect(r.items.every((i) => !/subtotal|total/i.test(i.concept))).toBe(true);
  });

  it("avisa (warning) si la suma no cuadra con el TOTAL GENERAL", () => {
    const bad = ROWS.map((row) => [...row]);
    bad[bad.length - 1] = ["", "", "", "TOTAL GENERAL", "999.99"]; // total mentiroso
    const r = parseCajaChica(bad);
    if (!r.ok) throw new Error("debía parsear igual");
    expect(r.warnings.some((w) => /TOTAL GENERAL/.test(w))).toBe(true);
  });

  it("detecta columnas aunque el archivo tenga una columna A vacía (offset distinto)", () => {
    // Simula el caso Centro/Fonavi del proyecto: todo corrido una columna.
    const shifted = ROWS.map((row) => ["", ...row]);
    const r = parseCajaChica(shifted);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items).toHaveLength(5);
  });

  it("falla claro si no es el archivo esperado", () => {
    const r = parseCajaChica([["hola", "mundo"], ["1", "2"]]);
    expect(r.ok).toBe(false);
  });
});
