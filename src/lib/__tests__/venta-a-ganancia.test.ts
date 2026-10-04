import { describe, it, expect } from "vitest";
import { barrasDelMes, notaVendidoCobrado } from "../venta-a-ganancia";
import { cifrasDeSede } from "../seis-cifras";

const sede = (businessId: number, nombre: string, o: { ventas: number | null; cobrado: number | null; corte?: string | null; gastos?: number }) =>
  cifrasDeSede({
    businessId, sede: nombre, mes: "2026-09", finDeMes: "2026-09-30", corte: o.corte === undefined ? "2026-09-30" : o.corte,
    filas: o.gastos ? [{ categoria: "PLANILLA", propio: o.gastos, monto: o.gastos }] : [], ventas: o.ventas, caja: { entro: 0, salio: 0 }, cobrado: o.cobrado,
  });

describe("de la venta a la ganancia", () => {
  it("dice qué pasó entre lo vendido y lo cobrado", () => {
    expect(notaVendidoCobrado(10000, 9990)).toMatch(/prácticamente todo/);
    expect(notaVendidoCobrado(10000, 8700)).toMatch(/Vendiste S\/ 1,300 más de lo que cobraste/);
    expect(notaVendidoCobrado(10000, 11200)).toMatch(/Cobraste S\/ 1,200 más de lo que vendiste/);
    expect(notaVendidoCobrado(null, 100)).toBeNull();
  });

  it("ordena Fonavi, Centro, Atelier y reutiliza la ganancia de las seis cifras", () => {
    const b = barrasDelMes([
      sede(1, "Atelier", { ventas: 10000, cobrado: 10500, gastos: 9000 }),
      sede(2, "Fonavi", { ventas: 20000, cobrado: 19000, gastos: 5000 }),
      sede(3, "Centro", { ventas: 30000, cobrado: 30000, gastos: 6000 }),
    ]);
    expect(b.map((x) => x.sede)).toEqual(["Fonavi", "Centro", "Atelier"]);
    expect(b[0]).toMatchObject({ vendido: 20000, cobrado: 19000, ganancia: 15000, gananciaPct: 75, conBarras: true });
  });

  it("sin Excel o sin ventas no dibuja barras; sin gastos no inventa ganancia", () => {
    const [sinExcel] = barrasDelMes([sede(2, "Fonavi", { ventas: 5000, cobrado: null, corte: null })]);
    expect(sinExcel.conBarras).toBe(false);
    const [sinGastos] = barrasDelMes([sede(2, "Fonavi", { ventas: 5000, cobrado: 4800 })]);
    expect(sinGastos).toMatchObject({ conBarras: true, ganancia: null, sinGananciaPorque: "Sin gastos cargados" });
  });

  it("con el mes a medias no compara lo cobrado con lo vendido", () => {
    const [b] = barrasDelMes([sede(2, "Fonavi", { ventas: 3000, cobrado: 1000, corte: "2026-09-05" })]);
    expect(b.nota).toMatch(/Mes a medias/);
  });
});
