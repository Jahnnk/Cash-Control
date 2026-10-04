import { describe, it, expect } from "vitest";
import { celdaCobertura, type PeriodoCargado } from "../productos/cobertura-rotacion";
import { faltaDeSede } from "../productos/falta-subir";
import { mesesDesdeAbril } from "../productos/cobertura-datos";

const p = (month: string, desde: string, hasta: string, origen: "sede" | "direccion" = "sede"): PeriodoCargado => ({ businessId: 1, month, origen, desde, hasta, ventas: 1000, cargadoEl: null });
const HOY = "2026-10-04";
const celdas = (ps: PeriodoCargado[]) => mesesDesdeAbril(HOY).map((m) => celdaCobertura(ps, m, HOY));

describe("qué meses faltan por subir", () => {
  it("los meses van de abril al mes en curso", () => {
    expect(mesesDesdeAbril(HOY)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  it("dice qué falta: julio sin reporte, agosto con 30–31, octubre aún sin subir", () => {
    const f = faltaDeSede(celdas([
      p("2026-04", "2026-04-01", "2026-04-30"), p("2026-05", "2026-05-01", "2026-05-31"), p("2026-06", "2026-06-01", "2026-06-30"),
      p("2026-08", "2026-08-01", "2026-08-29"), p("2026-09", "2026-09-01", "2026-09-30", "direccion"),
    ]), HOY);
    expect(f).toEqual(["julio (sin reporte)", "agosto (faltan 30 y 31 ago)", "octubre (en curso, del 1 a ayer)"]);
  });

  it("la carga de dirección completa el mes aunque la de la sede llegue al 26", () => {
    const f = faltaDeSede(celdas([
      p("2026-09", "2026-09-01", "2026-09-26"), p("2026-09", "2026-09-01", "2026-09-30", "direccion"),
    ]), HOY);
    expect(f.some((x) => x.startsWith("setiembre"))).toBe(false);
  });

  it("el mes en curso al día no se pide", () => {
    const f = faltaDeSede(celdas([p("2026-10", "2026-10-01", "2026-10-03")]), HOY);
    expect(f.some((x) => x.startsWith("octubre"))).toBe(false);
  });
});

describe("la alarma de «carga parcial» no salta con un mes recién empezado", () => {
  it("4 días de octubre no se marcan sospechosos aunque vendan menos por día", async () => {
    const { marcarSospechosas } = await import("../productos/cobertura-rotacion");
    const meses = ["2026-07", "2026-08", "2026-09", "2026-10"];
    const base = (ps: PeriodoCargado[]) => marcarSospechosas(meses.map((m) => celdaCobertura(ps, m, "2026-10-05")));
    const ps = [
      { ...p("2026-07", "2026-07-01", "2026-07-31"), ventas: 40000 }, { ...p("2026-08", "2026-08-01", "2026-08-31"), ventas: 40000 },
      { ...p("2026-09", "2026-09-01", "2026-09-30"), ventas: 40000 }, { ...p("2026-10", "2026-10-01", "2026-10-03"), ventas: 300 },
    ];
    expect(base(ps)[3].sospechosa).toBeFalsy();
    // Y un mes cerrado que vende muy poco por día sigue marcándose.
    const poco = [{ ...ps[0], ventas: 5000 }, ps[1], ps[2]];
    expect(marcarSospechosas(meses.slice(0, 3).map((m) => celdaCobertura(poco, m, "2026-10-05")))[0].sospechosa).toBe(true);
  });
});
