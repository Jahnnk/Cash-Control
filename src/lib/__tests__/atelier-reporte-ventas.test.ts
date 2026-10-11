/**
 * El «Reporte de Ventas» de Atelier reemplaza a «Ventas de <MES>» y a
 * «Ventas por Cliente» (auditoría de fricción, 10-oct-2026).
 */
import { describe, it, expect } from "vitest";
import { ventasPorDia, semanasCubiertas, clientesDeLaSemana } from "../atelier-reporte-ventas";

type D = Parameters<typeof ventasPorDia>[0][number];
const doc = (fecha: string, cliente: string, total: number, tipo: D["tipo"] = "FACTURA", extra: Partial<D> = {}): D => ({
  fecha, cliente, total, tipo, esSede: false, sedeId: null, descuento: 0, ...extra,
});

describe("ventasPorDia — lo que antes traía «Ventas de <MES>»", () => {
  it("cuenta un pedido por fila y suma la venta de cada día", () => {
    // Forma real del 03-oct-2026 en Atelier: 2 pedidos, S/291.28.
    const dias = ventasPorDia([
      doc("2026-10-03", "SERVICIOS GASTRONOMICOS YAYIS S.A.C.", 180.5),
      doc("2026-10-03", "CLIENTES VARIOS", 110.78, "TICKET", { descuento: 5 }),
      doc("2026-10-02", "G & V AGROANDINA S.A.C.", 2110.2),
    ], "2026-10-10");
    expect(dias).toEqual([
      { date: "2026-10-02", pedidos: 1, descuentos: 0, total: 2110.2 },
      { date: "2026-10-03", pedidos: 2, descuentos: 5, total: 291.28 },
    ]);
  });

  it("el día de hoy no se guarda: todavía no cierra", () => {
    expect(ventasPorDia([doc("2026-10-10", "X", 588.78)], "2026-10-10")).toEqual([]);
  });
});

describe("semanasCubiertas — solo semanas enteras", () => {
  const HOY = "2026-10-10"; // sábado

  it("arma la semana del archivo si lo subido cubre de lunes a sábado", () => {
    expect(semanasCubiertas([{ inicio: "2026-10-01", fin: "2026-10-10" }], { inicio: "2026-10-01", fin: "2026-10-10" }, HOY))
      .toEqual([{ inicio: "2026-10-05", fin: "2026-10-11" }]);
  });

  it("la semana que cruza el mes sale si el reporte de setiembre cubrió su parte", () => {
    const subidos = [{ inicio: "2026-09-01", fin: "2026-09-30" }, { inicio: "2026-10-01", fin: "2026-10-10" }];
    expect(semanasCubiertas(subidos, { inicio: "2026-10-01", fin: "2026-10-10" }, HOY).map((s) => s.inicio))
      .toEqual(["2026-09-28", "2026-10-05"]);
  });

  it("con un hueco, esa semana no se arma: diría que un cliente dejó de comprar", () => {
    expect(semanasCubiertas([{ inicio: "2026-10-01", fin: "2026-10-10" }], { inicio: "2026-10-01", fin: "2026-10-10" }, HOY)
      .map((s) => s.inicio)).not.toContain("2026-09-28");
  });

  it("una semana que todavía no llega a su sábado espera", () => {
    expect(semanasCubiertas([{ inicio: "2026-10-01", fin: "2026-10-08" }], { inicio: "2026-10-01", fin: "2026-10-08" }, "2026-10-08")).toEqual([]);
  });
});

describe("clientesDeLaSemana — lo que antes traía «Ventas por Cliente»", () => {
  it("agrupa por cliente, cuenta pedidos con y sin comprobante, y ordena por venta", () => {
    const filas = clientesDeLaSemana([
      doc("2026-10-05", "G & V AGROANDINA S.A.C.", 728.55),
      doc("2026-10-07", "g & v agroandina s.a.c. ", 100),
      doc("2026-10-06", "URBINA YAP SAM XIMENA OLGA", 104.35, "BOLETA"),
      doc("2026-10-06", "CLIENTES VARIOS", 50, "TICKET"),
      doc("2026-10-08", "SERVICIOS GASTRONOMICOS YAYIS S.A.C.", 900, "FACTURA", { esSede: true, sedeId: 3 }),
    ]);
    expect(filas.map((f) => f.cliente)).toEqual([
      "SERVICIOS GASTRONOMICOS YAYIS S.A.C.", "G & V AGROANDINA S.A.C.", "URBINA YAP SAM XIMENA OLGA", "CLIENTES VARIOS",
    ]);
    const gv = filas[1];
    expect(gv).toMatchObject({ totalPedidos: 2, conComprobante: 2, sinComprobante: 0, totalVentas: 828.55, ticketPromedio: 414.28, primeraCompra: "2026-10-05", ultimaCompra: "2026-10-07" });
    expect(filas[0]).toMatchObject({ esSede: true, sedeId: 3 });
    expect(filas[3]).toMatchObject({ conComprobante: 0, sinComprobante: 1 });
  });

  it("completa el RUC con lo que ya se conoce, para comparar semana contra semana", () => {
    const [f] = clientesDeLaSemana([doc("2026-10-05", "G & V AGROANDINA S.A.C.", 10)], new Map([["G & V AGROANDINA S.A.C.", "20600000001"]]));
    expect(f.documento).toBe("20600000001");
  });
});
