/** Tarjeta de sede del Resumen (rediseño, 17-oct-2026), con Fonavi setiembre. */
import { describe, it, expect } from "vitest";
import { cifrasDeSede } from "../seis-cifras";
import { tarjetaDeSede } from "../tarjeta-sede";

const fonaviSet = () => cifrasDeSede({
  businessId: 2, sede: "Fonavi", mes: "2026-09", finDeMes: "2026-09-30", corte: "2026-09-30",
  filas: [
    { categoria: "INSUMOS", propio: 17147.5, monto: 17147.5 },
    { categoria: "PLANILLA", propio: 13537.83, monto: 13537.83 },
    { categoria: "IMPUESTOS", propio: 125, monto: 125 },
    { categoria: "PRÉSTAMOS Y TARJETAS", propio: 1813.5, monto: 1813.5 },
  ],
  ventas: 37293.99, caja: { entro: 37109.37, salio: 33181.21 }, cobrado: 35726.87, ingresadoVentas: 35705.87,
  ingresosFuera: { devolucionesSedes: 382.5, prestamos: 0, rescates: 0, otros: 1000, devolucionesGastos: 0 },
});

describe("tarjeta de sede", () => {
  const t = tarjetaDeSede(fonaviSet());

  it("las cuatro barras: ventas, costos (variables), gastos (fijos) y ganancia real; los impuestos aparte", () => {
    expect(t).toMatchObject({ ventas: 37293.99, costos: 17147.5, gastos: 13537.83, impuestos: 125 });
    expect(t.ganancia).toBe(6483.66);
    expect(t.gananciaPct).toBe(17.4);
    expect(t.margenPct).toBe(54);
  });

  it("caja del mes: ingresado por ventas + otras entradas = lo que entró (igual al Excel)", () => {
    expect(t.caja).toEqual({ ingresado: 35705.87, otras: 1403.5, total: 37109.37 });
  });

  it("sin resultado (mes que recién empieza) no inventa costos ni gastos", () => {
    const s = cifrasDeSede({ businessId: 2, sede: "Fonavi", mes: "2026-10", finDeMes: "2026-10-31", corte: "2026-10-03", filas: [{ categoria: "INSUMOS", propio: 100, monto: 100 }], ventas: 3000, caja: { entro: 0, salio: 0 } });
    const x = tarjetaDeSede(s);
    expect(x.costos).toBeNull();
    expect(x.porque).toBe("El mes recién empieza");
  });
});
