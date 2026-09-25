import { describe, it, expect } from "vitest";
import { elegirVentaDia } from "../venta-del-dia";

describe("la venta de un día con tres fuentes (dos de tres)", () => {
  it("30/08 Fonavi: Byte incompleto, el administrador confirma el Excel", () => {
    expect(elegirVentaDia(102.1, 899.6, 899.6)).toEqual({ total: 899.6, fuente: "excel", motivo: "admin-confirma-excel" });
  });
  it("05/08 Fonavi: el administrador confirma Byte (el Excel está mal)", () => {
    expect(elegirVentaDia(1187.3, 1071.3, 1187.3)).toEqual({ total: 1187.3, fuente: "byte", motivo: "admin-confirma-byte" });
  });
  it("diferencias de centavos o de S/1.60 no cambian nada: manda Byte", () => {
    expect(elegirVentaDia(1036.22, 1037.82, 1037.82)).toEqual({ total: 1036.22, fuente: "byte", motivo: "coinciden" });
  });
  it("sin tercer dato, manda Byte pero queda marcado", () => {
    expect(elegirVentaDia(2919.97, 2316.58, null)).toEqual({ total: 2919.97, fuente: "byte", motivo: "sin-desempate" });
  });
  it("sin reporte de Byte usa el Excel; sin ninguno, al administrador", () => {
    expect(elegirVentaDia(null, 3182.09, null)).toEqual({ total: 3182.09, fuente: "excel", motivo: "unica" });
    expect(elegirVentaDia(null, 2272.39, 2384.07)).toEqual({ total: 2272.39, fuente: "excel", motivo: "sin-desempate" });
    expect(elegirVentaDia(null, null, 500)).toEqual({ total: 500, fuente: "admin", motivo: "unica" });
    expect(elegirVentaDia(null, null, null)).toBeNull();
  });
});
