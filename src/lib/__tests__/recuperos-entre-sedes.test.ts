/** Casos reales de ago–set 2026 (conciliación con Jahnn, 16-oct). */
import { describe, it, expect } from "vitest";
import { recuperosDeOtrasSedes, motivoNoResta } from "../recuperos-entre-sedes";

const dev = (fecha: string, monto: number, nota: string) => ({ fecha, monto, nota });

describe("lo que otra sede devuelve se resta del gasto de quien pagó", () => {
  it("Fonavi set: el 50% del sueldo y la AFP de Luana que devuelve Centro bajan la PLANILLA de Fonavi", () => {
    const r = recuperosDeOtrasSedes([
      dev("2026-09-30", 250.38, "REEMBOLSO POR SUELDO LUANA MARKETING (SERVCIOS GASTRONOMICOS SAC)"),
      dev("2026-09-30", 32.12, "REEMBOLSO POR AFP LUANA MARKETING (SERVCIOS GASTRONOMICOS SAC)"),
    ], []);
    expect(r.map((x) => [x.monto, x.categoria])).toEqual([[250.38, "PLANILLA"], [32.12, "PLANILLA"]]);
  });

  it("Atelier ago: el aceite y la panela que devuelven las cafeterías bajan los INSUMOS", () => {
    const r = recuperosDeOtrasSedes([
      dev("2026-08-31", 153, "REEMBOLSO POR ACEITE DE OLIVA (EXPERIENCIAS GASTRONOMICAS YAYIS SRL)"),
      dev("2026-08-31", 97.5, "REEMBOLSO POR PANELA (SERVICIOS GASTRONOMICOS YAYIS SAC)"),
    ], []);
    expect(r.every((x) => x.categoria === "INSUMOS")).toBe(true);
  });

  it("lo que ya se repartió en origen NO se resta otra vez (agua y luz del 1er piso, alquiler de octubre)", () => {
    const repartidos = [{ fecha: "2026-09-25", otras: 101.32 }, { fecha: "2026-09-25", otras: 2.31 }, { fecha: "2026-10-05", otras: 1000 }];
    const r = recuperosDeOtrasSedes([
      dev("2026-09-25", 101.33, "REEMBOLSO POR AGUA 1ER PISO (EXPERIENCIAS GASTRONOMICAS YAYIS)"),
      dev("2026-09-25", 2.31, "REEMBOLSO POR LUZ 1ER PISO (EXPERIENCIAS GASTRONOMICAS YAYIS)"),
      dev("2026-09-30", 1000, "ALQUILER OCTUBRE 2026 (EXPERIENCIAS GASTRONOMICAS YAYIS SRL)"),
      // La luz del 2do piso Atelier la pagó ENTERA (S/77): lo que devuelve Fonavi sí se resta.
      dev("2026-09-25", 19.25, "REEMBOLSO POR LUZ 2DO PISO (EXPERIENCIAS GASTRONOMICAS YAYIS)"),
    ], repartidos);
    expect(r.map((x) => [x.monto, x.categoria])).toEqual([[19.25, "SERVICIOS"]]);
  });

  it("un mismo gasto repartido explica una sola devolución", () => {
    const r = recuperosDeOtrasSedes([dev("2026-09-25", 2.31, "LUZ 1ER PISO"), dev("2026-09-26", 2.31, "LUZ 1ER PISO")], [{ fecha: "2026-09-25", otras: 2.31 }]);
    expect(r).toHaveLength(1);
  });

  it("préstamos y plata que no era de la sede no tocan el gasto", () => {
    expect(motivoNoResta(dev("2026-09-30", 1200, "DEVOLUCION PRESTAMO 2DA CUOTA (PRODUCTOS SALUDABLES)"), [])).toBe("prestamo");
    expect(motivoNoResta(dev("2026-09-10", 80.46, "DEVOLUCIÓN POR PAGO MAL EJECUTADO A VICTOR ALIAGA (EXPERIENCIAS)"), [])).toBe("no-era-de-la-sede");
    expect(motivoNoResta(dev("2026-09-15", 21, "DEVOLUCIÓN POR YAPE ENVIADO A SEDE EQUIVOCADA"), [])).toBe("no-era-de-la-sede");
    expect(recuperosDeOtrasSedes([dev("2026-09-30", 1200, "DEVOLUCION PRESTAMO 2DA CUOTA")], [])).toEqual([]);
  });
});
