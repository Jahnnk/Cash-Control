import { describe, it, expect } from "vitest";
import { construirInformeSede, claveProveedor, type GastoInforme } from "../informe-gastos";

const g = (mes: string, categoria: string, monto: number, concepto: string, extra: Partial<GastoInforme> = {}): GastoInforme => ({
  mes, fecha: `${mes}-10`, categoria, concepto, monto, propio: monto, deExcel: true, ...extra,
});

const MESES = ["2026-07", "2026-06", "2026-05"];
const base = (gastos: GastoInforme[], ventas: Record<string, number | null> = { "2026-08": 10000, "2026-07": 10000, "2026-06": 10000, "2026-05": 10000 }) =>
  construirInformeSede({ businessId: 2, sede: "Fonavi", mes: "2026-08", mesesPrevios: MESES, gastos, ventasPorMes: ventas });

const cadaMes = (categoria: string, monto: number, concepto: string) => ["2026-08", ...MESES].map((m) => g(m, categoria, monto, concepto));

describe("informe de gastos por sede", () => {
  it("los bolsillos suman lo que salió, y la parte de otra sede va aparte", () => {
    const r = base([
      g("2026-08", "PLANILLA", 3000, "SUELDO"),
      g("2026-08", "INSUMOS", 2000, "LECHE (VICTOR ALIAGA)"),
      g("2026-08", "PRÉSTAMOS Y TARJETAS", 500, "CUOTA DINERS"),
      g("2026-08", "EQUIPOS", 800, "LICUADORA"),
      g("2026-08", "AHORRO", 1000, "FONDOS MUTUOS"),
      g("2026-08", "POR ACLARAR", 50, "Sin descripción"),
      g("2026-08", "ALQUILER", 2700, "ALQUILER", { propio: 1800 }),
    ]);
    expect(r.bolsillos).toMatchObject({ fijo: 4800, variable: 2000, desconocido: 50, operacion: 6850, deudas: 500, inversion: 800, noEsGasto: 1000, otrasSedes: 900, total: 10050 });
  });

  it("costo de lo vendido, planilla y costo primo como % de la venta, con semáforo del rubro", () => {
    const r = base([
      g("2026-08", "PRODUCTOS ATELIER", 3000, "FACTURAS (PRODUCTOS SALUDABLES YAYIS)"),
      g("2026-08", "INSUMOS", 500, "LECHE"),
      g("2026-08", "PACKAGING", 200, "BOLSAS"),
      g("2026-08", "PLANILLA", 2500, "SUELDOS"),
    ]);
    const [cv, pl, primo] = r.indicadores;
    expect(cv).toMatchObject({ pct: 37, estado: "alerta", meta: 35 });
    expect(pl).toMatchObject({ pct: 25, estado: "ok" });
    expect(primo).toMatchObject({ pct: 62, estado: "ok" });
    expect(r.alertas[0].titulo).toBe("Costo de lo vendido: 37% de la venta");
  });

  it("sin venta no hay semáforo", () => {
    const r = base([g("2026-08", "PLANILLA", 100, "X")], { "2026-08": null });
    expect(r.indicadores.every((i) => i.estado === "sin-venta")).toBe(true);
  });

  it("ranking contra el promedio de los meses anteriores y aviso si una categoría se dispara", () => {
    const r = base([
      ...cadaMes("PLANILLA", 3000, "SUELDOS"),
      g("2026-08", "MANTENIMIENTO", 900, "ARREGLO"), g("2026-07", "MANTENIMIENTO", 100, "ARREGLO"),
    ]);
    const mant = r.categorias.find((c) => c.categoria === "MANTENIMIENTO")!;
    expect(mant.prom3).toBeCloseTo(33.33, 1);
    expect(r.alertas.some((a) => a.titulo.startsWith("MANTENIMIENTO subió"))).toBe(true);
    expect(r.categorias[0]).toMatchObject({ categoria: "PLANILLA", variacionPct: 0 });
  });

  it("recurrencia: el proveedor de todos los meses, el piso mensual y los gastos hormiga", () => {
    const r = base([
      ...cadaMes("ALQUILER", 1800, "ALQUILER (GINO PINASCO)"),
      ...cadaMes("PLANILLA", 3000, "SUELDOS"),
      g("2026-08", "EQUIPOS", 900, "BALANZA (BALANZAS CENTER)"),
      ...Array.from({ length: 10 }, () => g("2026-08", "DELIVERY Y FLETES", 10, "MOTO")),
    ]);
    expect(r.pagos.find((p) => p.categoria === "ALQUILER")?.recurrente).toBe(true);
    expect(r.pagos.find((p) => p.categoria === "EQUIPOS")?.recurrente).toBe(false);
    expect(r.recurrencia.pisoMensual.total).toBe(4800);
    expect(r.recurrencia.hormiga).toMatchObject({ pagos: 10, total: 100 });
    expect(r.recurrencia.proveedores.find((p) => p.nombre === "GINO PINASCO")).toMatchObject({ meses: 4, de: 4 });
  });

  it("no compara meses a mano con meses del Excel (Atelier hasta julio): recurrencia sin base", () => {
    const r = base([
      g("2026-08", "INSUMOS", 500, "LECHE (VICTOR ALIAGA)"),
      g("2026-07", "INSUMOS", 400, "Leche Sr Victor", { deExcel: false }),
    ]);
    expect(r.recurrencia.pctRecurrente).toBeNull();
    expect(r.pagos[0].recurrente).toBeNull();
    expect(r.alertas.some((a) => a.titulo.startsWith("Gasto nuevo"))).toBe(false);
  });

  it("el mismo proveedor escrito distinto es uno solo", () => {
    expect(claveProveedor("FACTURAS (PRODUCTOS SALUDABLES YAYI´S SRL)")).toBe("PRODUCTOS SALUDABLES YAYI´S SRL");
    const r = base([
      g("2026-08", "PRODUCTOS ATELIER", 100, "A (PRODUCTOS SALUDABLES YAYI)"),
      g("2026-08", "PRODUCTOS ATELIER", 200, "B (PRODUCTOS SALUDABLES YAYIS)"),
    ]);
    expect(r.recurrencia.proveedores).toHaveLength(1);
    expect(r.recurrencia.proveedores[0].monto).toBe(300);
  });
});
