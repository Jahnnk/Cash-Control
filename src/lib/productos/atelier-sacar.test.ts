import { describe, it, expect } from "vitest";
import { armarAtelier, efectoEnAtelier, nombreSinCanal, type MesAtelier } from "./atelier-sacar";

const mes = (month: string, filas: [string, number, number][], sospechoso = false): MesAtelier => ({
  month, dias: 30, sospechoso, filas: filas.map(([nombre, unidades, ingresos]) => ({ nombre, unidades, ingresos })),
});

describe("Qué sacar de Atelier", () => {
  it("quita el prefijo de canal", () => {
    expect(nombreSinCanal("Y-BROWNIE")).toBe("BROWNIE");
    expect(nombreSinCanal("P-BROWNIE")).toBe("BROWNIE");
  });

  it("junta Y- y P- en un solo producto y separa los canales", () => {
    const ms = ["2026-08", "2026-09", "2026-10"].map((m) => mes(m, [["Y-BROWNIE", 100, 500], ["P-BROWNIE", 50, 250], ["MASA BASE", 999, 1]]));
    const r = armarAtelier(ms, [], new Map());
    expect(r.items).toHaveLength(1); // la sub-receta sin prefijo no cuenta
    expect(r.items[0].pctCafeterias).toBe(67);
    expect(r.items[0].semana.total).toBeGreaterThan(r.items[0].semana.b2b);
  });

  it("un producto que vende poquísimo y cae sale a «sacar»", () => {
    const grandes: [string, number, number][] = Array.from({ length: 10 }, (_, i) => [`Y-GRANDE ${i}`, 400, 2000]);
    const ms = [["2026-08", 9], ["2026-09", 8], ["2026-10", 1]].map(([m, u]) => mes(m as string, [...grandes, ["P-RARO", u as number, (u as number) * 5]]));
    const r = armarAtelier(ms, [], new Map());
    expect(r.items.find((i) => i.nombre === "RARO")?.veredicto).toBe("sacar");
  });

  it("un mes sospechoso no cuenta y el producto nuevo no se juzga", () => {
    const ms = [mes("2026-09", [["Y-NUEVO", 1, 5]]), mes("2026-10", [["Y-NUEVO", 1, 5]], true)];
    const r = armarAtelier(ms, [], new Map());
    expect(r.meses).toEqual(["2026-09"]);
    expect(r.items[0].veredicto).toBe("nuevo");
  });

  it("efecto en Atelier: cuántas unidades dejarían de pedir las cafeterías", () => {
    const ms = ["2026-08", "2026-09", "2026-10"].map((m) => mes(m, [["Y-BROWNIE", 100, 500], ["P-BROWNIE", 50, 250]]));
    const r = armarAtelier(ms, [], new Map());
    const e = efectoEnAtelier("Brownie", r.items);
    expect(e?.cafeterias).toBeGreaterThan(e!.b2b);
    expect(efectoEnAtelier("Cosa distinta", r.items)).toBeNull();
  });
});
