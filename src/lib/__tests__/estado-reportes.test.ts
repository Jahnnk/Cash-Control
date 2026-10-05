import { describe, it, expect } from "vitest";
import { estadoVentas, estadoMenor, estadoMayor, reportesQueFaltan, limitesDelMes, tresReportes, type VentasDelMes } from "../productos/estado-reportes";
import { celdaCobertura, type PeriodoCargado } from "../productos/cobertura-rotacion";

const HOY = "2026-10-04";
const ventas = (month: string, desde: string, hasta: string, dias: number, total = 40000): VentasDelMes => ({ businessId: 1, month, desde, hasta, dias, total });

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

  it("mayor rotación: lo de la sede no basta, tiene que ser de gerencia", () => {
    const p: PeriodoCargado[] = [{ businessId: 1, month: "2026-05", origen: "sede", desde: "2026-05-01", hasta: "2026-05-31", ventas: 40000, cargadoEl: null }];
    expect(estadoMayor(celdaCobertura(p, "2026-05", HOY), p, "2026-05", HOY, 40000)).toEqual({ estado: "parcial", texto: "solo de la sede, falta el tuyo" });
    expect(estadoMayor(celdaCobertura([], "2026-05", HOY), [], "2026-05", HOY, 40000)).toEqual({ estado: "vacio", texto: "sin subir" });
  });

  it("mayor rotación de gerencia: completo si cubre el mes y cuadra con las ventas", () => {
    const g = (hasta: string, v = 38000): PeriodoCargado[] => [{ businessId: 1, month: "2026-07", origen: "direccion", desde: "2026-07-01", hasta, ventas: v, cargadoEl: null }];
    const bien = g("2026-07-31");
    expect(estadoMayor(celdaCobertura(bien, "2026-07", HOY), bien, "2026-07", HOY, 38512).estado).toBe("completo");
    // Llega al 29: incompleto, aunque sea suyo.
    const corto = g("2026-07-29");
    expect(estadoMayor(celdaCobertura(corto, "2026-07", HOY), corto, "2026-07", HOY, 38512).estado).toBe("completo"); // 2 días de tolerancia
    const muyCorto = g("2026-07-20");
    expect(estadoMayor(celdaCobertura(muyCorto, "2026-07", HOY), muyCorto, "2026-07", HOY, 38512)).toMatchObject({ estado: "parcial" });
  });

  it("si el total no cuadra con las ventas, avisa: Atelier abril (+42%) y Centro julio (−24%)", () => {
    const atelierAbril: PeriodoCargado[] = [{ businessId: 1, month: "2026-04", origen: "direccion", desde: "2026-04-01", hasta: "2026-04-30", ventas: 54897.23, cargadoEl: null }];
    expect(estadoMayor(celdaCobertura(atelierAbril, "2026-04", HOY), atelierAbril, "2026-04", HOY, 38664.45)).toEqual({ estado: "revisar", texto: "no cuadra con ventas (+42%)" });
    const centroJulio: PeriodoCargado[] = [{ businessId: 3, month: "2026-07", origen: "direccion", desde: "2026-07-01", hasta: "2026-07-31", ventas: 31239.9, cargadoEl: null }];
    expect(estadoMayor(celdaCobertura(centroJulio, "2026-07", HOY), centroJulio, "2026-07", HOY, 41025.38)).toEqual({ estado: "revisar", texto: "no cuadra con ventas (−24%)" });
  });

  it("las diferencias normales (+1% a +4%, y +12% de abril en las cafeterías) no alarman", () => {
    for (const [prod, vta] of [[42634.4, 38201.78], [41052.6, 39608.81], [38244.8, 37221.95]] as const) {
      const p: PeriodoCargado[] = [{ businessId: 2, month: "2026-05", origen: "direccion", desde: "2026-05-01", hasta: "2026-05-31", ventas: prod, cargadoEl: null }];
      expect(estadoMayor(celdaCobertura(p, "2026-05", HOY), p, "2026-05", HOY, vta).estado).toBe("completo");
    }
  });

  it("dice exactamente cuáles faltan (el caso de agosto en Fonavi)", () => {
    const p: PeriodoCargado[] = [{ businessId: 2, month: "2026-08", origen: "sede", desde: "2026-08-01", hasta: "2026-08-29", ventas: 36844, cargadoEl: null }];
    const t = tresReportes({ celda: celdaCobertura(p, "2026-08", HOY), periodos: p, ventas: undefined, menor: [{ desde: "2026-09-01", hasta: "2026-09-30" }], month: "2026-08", hoy: HOY });
    expect(reportesQueFaltan(t)).toEqual(["ventas", "mayor", "menor"]);
    const g: PeriodoCargado[] = [{ ...p[0], origen: "direccion", hasta: "2026-08-31", ventas: 37000 }];
    const ok = tresReportes({ celda: celdaCobertura(g, "2026-08", HOY), periodos: g, ventas: ventas("2026-08", "2026-08-01", "2026-08-31", 31, 36900), menor: [{ desde: "2026-04-01", hasta: "2026-09-30" }], month: "2026-08", hoy: HOY });
    expect(reportesQueFaltan(ok)).toEqual([]);
  });
});
