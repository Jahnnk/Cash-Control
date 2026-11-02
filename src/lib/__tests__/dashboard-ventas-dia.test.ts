import { describe, expect, it } from "vitest";
import { armarVentasPorDia, type EntradaSedeDia } from "../dashboard-ventas-dia";

// Reporte «Ventas de OCTUBRE 2026» de Byte (el que Jahnn pasó): 31 días, 993 pedidos, S/ 445.94 de descuentos, S/ 40,806.26.
const BYTE: [string, number, number, number][] = [
  ["2026-10-01", 43, 11.2, 1271.1],
  ["2026-10-02", 35, 10.98, 1523.22],
  ["2026-10-03", 38, 3, 1483.7],
  ["2026-10-04", 23, 4, 976.9],
  ["2026-10-05", 37, 7, 1461.8],
  ["2026-10-06", 28, 8.6, 1328.2],
  ["2026-10-07", 37, 8.75, 1799.05],
  ["2026-10-08", 31, 3.6, 1493.4],
  ["2026-10-09", 35, 19, 1839.4],
  ["2026-10-10", 31, 7.2, 1323.2],
  ["2026-10-11", 40, 0, 1705.8],
  ["2026-10-12", 29, 8, 991],
  ["2026-10-13", 32, 30.5, 1008.7],
  ["2026-10-14", 27, 3.18, 1355.02],
  ["2026-10-15", 54, 35.98, 1998.32],
  ["2026-10-16", 27, 14.18, 1283.22],
  ["2026-10-17", 33, 20.2, 1167.4],
  ["2026-10-18", 29, 15.8, 1237],
  ["2026-10-19", 27, 17.58, 1066.52],
  ["2026-10-20", 32, 7.98, 1272.12],
  ["2026-10-21", 29, 60.25, 967.85],
  ["2026-10-22", 21, 3.18, 795.32],
  ["2026-10-23", 31, 6.98, 1513.52],
  ["2026-10-24", 36, 34.5, 1489.5],
  ["2026-10-25", 35, 16.98, 1359.02],
  ["2026-10-26", 25, 7.5, 852.3],
  ["2026-10-27", 36, 11.5, 1337.6],
  ["2026-10-28", 28, 10.55, 1030.55],
  ["2026-10-29", 30, 11.2, 1487.9],
  ["2026-10-30", 29, 13.6, 1339.1],
  ["2026-10-31", 25, 32.97, 1048.53],
];

const centro: EntradaSedeDia = {
  businessId: 3, sede: "Centro",
  rows: BYTE.map(([date, , , total]) => ({ date, total })),
  detalle: BYTE.map(([date, pedidos, descuentos]) => ({ date, pedidos, descuentos })),
};

describe("armarVentasPorDia · reporte de Byte de octubre", () => {
  const v = armarVentasPorDia([centro], 3)!;

  it("reproduce los totales del reporte", () => {
    expect(v.dias).toHaveLength(31);
    expect(v.total).toBe(40806.26);
    expect(v.pedidos).toBe(993);
    expect(v.descuentos).toBe(445.94);
    expect(v.diasConVenta).toBe(31);
    expect(v.promedio).toBe(1316.33);
    expect(v.ticket).toBe(41.09);
  });

  it("encuentra el mejor y el peor día", () => {
    expect(v.mejor?.date).toBe("2026-10-15");
    expect(v.mejor?.total).toBe(1998.32);
    expect(v.peor?.date).toBe("2026-10-22");
    expect(v.peor?.total).toBe(795.32);
  });

  it("pone el día de la semana (1 de octubre de 2026 es jueves)", () => {
    expect(v.dias[0].diaSemana).toBe("jue");
    expect(v.dias[3].diaSemana).toBe("dom");
    expect(v.dias[0].ticket).toBe(29.56);
  });

  it("promedia por día de la semana, de lunes a domingo", () => {
    expect(v.porDiaSemana.map((d) => d.nombre)).toEqual(["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]);
    expect(v.porDiaSemana.reduce((t, d) => t + d.dias, 0)).toBe(31);
    expect(v.mejorDiaSemana).not.toBeNull();
  });
});

describe("armarVentasPorDia · casos", () => {
  const fonavi: EntradaSedeDia = { businessId: 2, sede: "Fonavi", rows: [{ date: "2026-10-01", total: 500 }, { date: "2026-10-03", total: 700 }], detalle: [{ date: "2026-10-01", pedidos: 10, descuentos: 5 }] };
  const atelier: EntradaSedeDia = { businessId: 1, sede: "Atelier", rows: [{ date: "2026-10-01", total: 300 }], detalle: [] };

  it("el Grupo suma las sedes día por día y deja los días sin venta en cero", () => {
    const v = armarVentasPorDia([fonavi, centro, atelier], null)!;
    expect(v.sedes.map((s) => s.nombre)).toEqual(["Fonavi", "Centro", "Atelier"]);
    expect(v.total).toBe(r2(40806.26 + 500 + 700 + 300));
    expect(v.dias[0].porSede).toEqual({ 1: 300, 2: 500, 3: 1271.1 });
    expect(v.dias[0].total).toBe(2071.1);
  });

  it("los pedidos solo cuentan donde hay reporte de Byte: Atelier sin detalle no mueve el ticket", () => {
    const v = armarVentasPorDia([fonavi, atelier], null)!;
    expect(v.dias[0].pedidos).toBe(10);
    expect(v.dias[0].ticket).toBe(50);
    expect(v.dias[2].pedidos).toBeNull();
  });

  it("un día sin venta en medio sale en 0 y no entra al promedio", () => {
    const v = armarVentasPorDia([fonavi], 2)!;
    expect(v.dias.map((d) => d.total)).toEqual([500, 0, 700]);
    expect(v.diasConVenta).toBe(2);
    expect(v.promedio).toBe(600);
  });

  it("sin ventas devuelve una vista vacía; sede inexistente, null", () => {
    expect(armarVentasPorDia([{ businessId: 2, sede: "Fonavi", rows: [], detalle: [] }], 2)!.dias).toEqual([]);
    expect(armarVentasPorDia([fonavi], 9)).toBeNull();
  });
});

const r2 = (n: number) => Math.round(n * 100) / 100;
