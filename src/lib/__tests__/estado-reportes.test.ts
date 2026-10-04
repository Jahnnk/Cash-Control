import { describe, it, expect } from "vitest";
import { estadoVentas, estadoMenor, estadoMayor, reportesQueFaltan, limitesDelMes, tresReportes, type VentasDelMes } from "../productos/estado-reportes";
import { celdaCobertura, type PeriodoCargado } from "../productos/cobertura-rotacion";

const HOY = "2026-10-04";
const ventas = (month: string, desde: string, hasta: string, dias: number): VentasDelMes => ({ businessId: 1, month, desde, hasta, dias });

describe("cuál de los tres reportes falta", () => {
  it("el mes en curso se mide hasta ayer; los cerrados, hasta su último día", () => {
    expect(limitesDelMes("2026-10", HOY)).toEqual({ ini: "2026-10-01", fin: "2026-10-03" });
    expect(limitesDelMes("2026-08", HOY)).toEqual({ ini: "2026-08-01", fin: "2026-08-31" });
  });

  it("ventas: sin subir, completo, o llega antes del cierre", () => {
    expect(estadoVentas(undefined, "2026-08", HOY)).toEqual({ estado: "vacio", texto: "sin subir" });
    expect(estadoVentas(ventas("2026-09", "2026-09-01", "2026-09-30", 26), "2026-09", HOY).estado).toBe("completo");
    expect(estadoVentas(ventas("2026-08", "2026-08-01", "2026-08-26", 26), "2026-08", HOY)).toEqual({ estado: "parcial", texto: "llega al 26 ago" });
    // Un local que no abre el domingo no deja el mes incompleto por terminar el 28.
    expect(estadoVentas(ventas("2026-08", "2026-08-02", "2026-08-29", 24), "2026-08", HOY).estado).toBe("completo");
  });

  it("menor rotación: una foto de abril a setiembre cubre cada uno de esos meses; octubre no", () => {
    const rangos = [{ desde: "2026-04-01", hasta: "2026-09-30" }];
    for (const m of ["2026-04", "2026-06", "2026-09"]) expect(estadoMenor(rangos, m, HOY).estado).toBe("completo");
    expect(estadoMenor(rangos, "2026-10", HOY).estado).toBe("vacio");
    expect(estadoMenor([], "2026-09", HOY)).toEqual({ estado: "vacio", texto: "sin subir" });
  });

  it("menor rotación solo de setiembre: agosto queda sin cubrir", () => {
    expect(estadoMenor([{ desde: "2026-09-01", hasta: "2026-09-30" }], "2026-08", HOY).estado).toBe("vacio");
  });

  it("mayor rotación sale de la casilla de cobertura", () => {
    const p: PeriodoCargado[] = [{ businessId: 1, month: "2026-08", origen: "sede", desde: "2026-08-01", hasta: "2026-08-29", ventas: 1, cargadoEl: null }];
    expect(estadoMayor(celdaCobertura(p, "2026-08", HOY))).toEqual({ estado: "parcial", texto: "faltan 30 y 31 ago" });
  });

  it("dice exactamente cuáles faltan (el caso de agosto en Fonavi)", () => {
    const p: PeriodoCargado[] = [{ businessId: 2, month: "2026-08", origen: "sede", desde: "2026-08-01", hasta: "2026-08-29", ventas: 1, cargadoEl: null }];
    const t = tresReportes({ celda: celdaCobertura(p, "2026-08", HOY), ventas: undefined, menor: [{ desde: "2026-09-01", hasta: "2026-09-30" }], month: "2026-08", hoy: HOY });
    expect(reportesQueFaltan(t)).toEqual(["ventas", "mayor", "menor"]);
    const ok = tresReportes({ celda: celdaCobertura([{ ...p[0], hasta: "2026-08-31" }], "2026-08", HOY), ventas: ventas("2026-08", "2026-08-01", "2026-08-31", 31), menor: [{ desde: "2026-04-01", hasta: "2026-09-30" }], month: "2026-08", hoy: HOY });
    expect(reportesQueFaltan(ok)).toEqual([]);
  });
});
