import { describe, it, expect } from "vitest";
import { celdaCobertura, marcarSospechosas, type PeriodoCargado } from "../productos/cobertura-rotacion";
import { mesesDesdeAbril } from "../productos/cobertura-datos";
import { mesesEnPalabras, casilla, FaltaSubir, type DatosCobertura } from "../../app/grupo/productos/grilla-cobertura";
import { reportesQueFaltan } from "../productos/estado-reportes";

const p = (businessId: number, month: string, desde: string, hasta: string, origen: "sede" | "direccion" = "sede"): PeriodoCargado => ({ businessId, month, origen, desde, hasta, ventas: 1000, cargadoEl: null });
const HOY = "2026-10-04";

describe("la grilla de reportes de Byte", () => {
  it("los meses van de abril al mes en curso", () => {
    expect(mesesDesdeAbril(HOY)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  it("junta meses seguidos para decirlo corto", () => {
    expect(mesesEnPalabras(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"])).toBe("abril a agosto");
    expect(mesesEnPalabras(["2026-04", "2026-06", "2026-10"])).toBe("abril · junio · octubre");
    expect(mesesEnPalabras(["2025-12", "2026-01"])).toBe("diciembre a enero");
  });

  it("cada casilla dice cuál de los tres reportes falta (agosto de Fonavi: ventas, mayor incompleta y menor)", () => {
    const datos: DatosCobertura = {
      hoy: HOY,
      periodos: [p(2, "2026-08", "2026-08-01", "2026-08-29"), p(2, "2026-09", "2026-09-01", "2026-09-30", "direccion")],
      ventas: [{ businessId: 2, month: "2026-09", desde: "2026-09-01", hasta: "2026-09-30", dias: 30, total: 1000 }],
      menor: [{ businessId: 2, desde: "2026-09-01", hasta: "2026-09-30" }],
    };
    expect(reportesQueFaltan(casilla(datos, 2, "2026-08").tres)).toEqual(["ventas", "mayor", "menor"]);
    expect(reportesQueFaltan(casilla(datos, 2, "2026-09").tres)).toEqual([]);
    // Otra sede no hereda lo de Fonavi.
    expect(reportesQueFaltan(casilla(datos, 3, "2026-09").tres)).toEqual(["ventas", "mayor", "menor"]);
  });

  it("la mayor rotación que solo subió la sede no cuenta como completa (hay que subir la de gerencia)", () => {
    const datos: DatosCobertura = { hoy: HOY, periodos: [p(2, "2026-05", "2026-05-01", "2026-05-31")], ventas: [], menor: [] };
    expect(casilla(datos, 2, "2026-05").tres.mayor).toEqual({ estado: "parcial", texto: "solo de la sede, falta el tuyo" });
  });

  it("la menor rotación de seis meses completa todos esos meses a la vez", () => {
    const datos: DatosCobertura = { hoy: HOY, periodos: [], ventas: [], menor: [{ businessId: 2, desde: "2026-04-01", hasta: "2026-09-30" }] };
    for (const m of ["2026-04", "2026-07", "2026-09"]) expect(casilla(datos, 2, m).tres.menor.estado).toBe("completo");
  });

  it("FaltaSubir es un componente (no se rompe al armarse)", () => {
    expect(typeof FaltaSubir).toBe("function");
  });
});

describe("la alarma de «carga parcial» no salta con un mes recién empezado", () => {
  const meses = ["2026-07", "2026-08", "2026-09", "2026-10"];
  const ps = [
    { ...p(1, "2026-07", "2026-07-01", "2026-07-31"), ventas: 40000 }, { ...p(1, "2026-08", "2026-08-01", "2026-08-31"), ventas: 40000 },
    { ...p(1, "2026-09", "2026-09-01", "2026-09-30"), ventas: 40000 }, { ...p(1, "2026-10", "2026-10-01", "2026-10-03"), ventas: 300 },
  ];
  it("4 días de octubre no se marcan sospechosos aunque vendan menos por día", () => {
    expect(marcarSospechosas(meses.map((m) => celdaCobertura(ps, m, "2026-10-05")))[3].sospechosa).toBeFalsy();
  });
  it("un mes cerrado que vende muy poco por día sigue marcándose", () => {
    const poco = [{ ...ps[0], ventas: 5000 }, ps[1], ps[2]];
    expect(marcarSospechosas(meses.slice(0, 3).map((m) => celdaCobertura(poco, m, "2026-10-05")))[0].sospechosa).toBe(true);
  });
});
