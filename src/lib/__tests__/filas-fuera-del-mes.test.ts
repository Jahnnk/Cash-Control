/**
 * Tests de la revisión de fechas contra el mes de la pestaña.
 *
 * El caso base es el real: la hoja "Ing&Gtos AGO26" de Atelier con tres
 * filas del 12 de julio adentro. Esas filas hacían dos daños — el total
 * del mes en el Excel y, peor, una copia nueva en la base cada vez que
 * se re-importaba el archivo.
 */
import { describe, it, expect } from "vitest";
import {
  revisarFechasDelMes, mensajeFechasFueraDelMes, nombreMes,
} from "../filas-fuera-del-mes";

const mov = (
  excelRow: number, date: string, type: "income" | "expense",
  amount: number, category = "INSUMOS", note = "",
) => ({ excelRow, date, type, category, amount, note });

describe("el caso real de Atelier (agosto 2026)", () => {
  const filasReales = [
    mov(76, "2026-07-12", "income", 55, "Ventas", "APOLONIA – 1143-1169"),
    mov(77, "2026-07-12", "expense", 1537.8, "INSUMOS", "12 SACOS DE HARINA PASTELERA"),
    mov(78, "2026-07-12", "expense", 0.05, "SS BANCARIOS", "ITF"),
    mov(80, "2026-08-04", "income", 1227.54, "Ventas", "FACTURAS DEL 03-04 AGOSTO"),
  ];

  it("encuentra las tres filas de julio y deja pasar las de agosto", () => {
    const r = revisarFechasDelMes(filasReales, "2026-08")!;
    expect(r.filas).toHaveLength(3);
    expect(r.filas.map((f) => f.excelRow)).toEqual([76, 77, 78]);
  });

  it("suma por separado lo que está mal ubicado, para saber cuánta plata es", () => {
    const r = revisarFechasDelMes(filasReales, "2026-08")!;
    expect(r.totalIngresos).toBe(55);
    expect(r.totalEgresos).toBe(1537.85);
  });

  it("el mensaje dice el mes, la plata y qué hacer", () => {
    const m = mensajeFechasFueraDelMes(revisarFechasDelMes(filasReales, "2026-08")!);
    expect(m).toContain("agosto 2026");
    expect(m).toContain("julio 2026");
    expect(m).toContain("S/55.00");
    expect(m).toContain("S/1537.85");
    expect(m).toContain("se duplican");
    expect(m).toContain("Corrige las fechas en el Excel");
  });
});

describe("cuándo NO hay que alarmar", () => {
  it("un mes limpio no devuelve nada", () => {
    expect(revisarFechasDelMes([mov(5, "2026-08-04", "income", 100)], "2026-08")).toBeNull();
  });

  it("sin poder deducir el mes de la pestaña, no se valida nada", () => {
    // Sin mes de referencia no hay con qué comparar: inventar uno sería
    // bloquear importaciones buenas.
    expect(revisarFechasDelMes([mov(5, "2026-07-12", "income", 100)], null)).toBeNull();
    expect(revisarFechasDelMes([mov(5, "2026-07-12", "income", 100)], "Hoja1")).toBeNull();
  });

  it("una fila sin fecha no cuenta como fuera de mes", () => {
    expect(revisarFechasDelMes([mov(5, "", "income", 100)], "2026-08")).toBeNull();
  });
});

describe("varios meses mezclados", () => {
  it("los nombra todos, ordenados", () => {
    const r = revisarFechasDelMes([
      mov(9, "2026-09-02", "expense", 20),
      mov(7, "2026-06-30", "expense", 10),
    ], "2026-08")!;
    const m = mensajeFechasFueraDelMes(r);
    expect(m).toContain("junio 2026 y setiembre 2026");
    expect(r.filas.map((f) => f.fecha)).toEqual(["2026-06-30", "2026-09-02"]);
  });
});

describe("nombreMes", () => {
  it("traduce el mes a como se dice en Perú", () => {
    expect(nombreMes("2026-09")).toBe("setiembre 2026");
    expect(nombreMes("2026-01")).toBe("enero 2026");
  });
});
