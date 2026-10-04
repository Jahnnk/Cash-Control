import { describe, it, expect } from "vitest";
import { celdaCobertura, type PeriodoCargado } from "../productos/cobertura-rotacion";
import { faltaDeSede } from "../../app/grupo/productos/cobertura-por-mes";
import { mesesDesdeAbril } from "../../app/grupo/productos/cobertura-por-mes";

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
