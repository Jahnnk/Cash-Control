/** Estado de resultados de 6 meses (Fase 2, 16-oct-2026). */
import { describe, it, expect } from "vitest";
import { cifrasDeSede } from "../seis-cifras";
import { estadoDeResultados } from "../estado-resultados";

const sede = (businessId: number, nombre: string, mes: string, ventas: number, filas: { categoria: string; monto: number }[], o: { fuenteExcel?: boolean; corte?: string } = {}) =>
  cifrasDeSede({
    businessId, sede: nombre, mes, finDeMes: `${mes}-30`, corte: o.corte ?? `${mes}-30`, fuenteExcel: o.fuenteExcel,
    filas: filas.map((f) => ({ categoria: f.categoria, propio: f.monto, monto: f.monto })), ventas,
    caja: { entro: ventas, salio: filas.reduce((t, f) => t + f.monto, 0) }, cobrado: ventas, ingresadoVentas: ventas,
    ingresosFuera: { devolucionesSedes: 0, prestamos: 0, rescates: 0, otros: 0, devolucionesGastos: 0 },
  });

const set = [
  sede(2, "Fonavi", "2026-09", 37000, [{ categoria: "INSUMOS", monto: 3600 }, { categoria: "PRODUCTOS ATELIER", monto: 12000 }, { categoria: "PLANILLA", monto: 10300 }, { categoria: "IMPUESTOS", monto: 125 }, { categoria: "PRÉSTAMOS Y TARJETAS", monto: 1800 }]),
  sede(1, "Atelier", "2026-09", 36000, [{ categoria: "INSUMOS", monto: 18000 }, { categoria: "PLANILLA", monto: 12700 }]),
];

describe("estado de resultados", () => {
  it("una sede: ventas → margen bruto → EBITDA → ganancia, con las categorías", () => {
    const e = estadoDeResultados(2, [{ mes: "2026-09", sedes: set }], "2026-10-16");
    const m = e.meses[0];
    // Los impuestos van en su línea, después del EBITDA.
    expect(m).toMatchObject({ ventas: 37000, costos: 15600, margenBruto: 21400, gastos: 10300, ebitda: 11100, impuestos: 125, ganancia: 10975 });
    expect(m.fuera.deudas).toBe(1800);
    expect(e.costos.map((c) => c.categoria)).toEqual(["PRODUCTOS ATELIER", "INSUMOS"]);
    expect(e.gastos.map((c) => c.categoria)).toEqual(["PLANILLA"]);
  });

  it("el grupo cuenta una vez lo que Atelier le vende a las cafeterías (sale de ventas y de PRODUCTOS ATELIER)", () => {
    const e = estadoDeResultados("grupo", [{ mes: "2026-09", sedes: set }], "2026-10-16");
    const m = e.meses[0];
    expect(m.ventas).toBe(37000 + 36000 - 12000);
    expect(e.costos.find((c) => c.categoria === "PRODUCTOS ATELIER")?.montos[0] ?? 0).toBe(0);
    // La ganancia del grupo es la suma de las sedes: la venta interna no cambia la ganancia.
    expect(m.ganancia).toBe(10975 + (36000 - 18000 - 12700));
  });

  it("el sello: conciliado (cerrado y con Excel), a mano (sin Excel) o en curso", () => {
    expect(estadoDeResultados(2, [{ mes: "2026-09", sedes: set }], "2026-10-16").meses[0].estado).toBe("conciliado");
    const aMano = [sede(1, "Atelier", "2026-06", 41000, [{ categoria: "INSUMOS", monto: 20000 }], { fuenteExcel: false })];
    expect(estadoDeResultados(1, [{ mes: "2026-06", sedes: aMano }], "2026-10-16").meses[0].estado).toBe("a-mano");
    expect(estadoDeResultados(2, [{ mes: "2026-09", sedes: set }], "2026-09-20").meses[0].estado).toBe("en-curso");
  });
});
