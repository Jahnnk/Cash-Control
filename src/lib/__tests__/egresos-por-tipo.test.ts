/**
 * Egresos por tipo (25-oct-2026): la pestaña «Resumen fijo vs variable» de Jahnn dentro del sistema, y el puente
 * hasta las seis cifras. Datos inventados que reproducen los casos de Fonavi setiembre (el repo es público).
 */
import { describe, it, expect } from "vitest";
import { egresosPorTipo, tipoEgreso } from "../egresos-por-tipo";
import { cifrasDelMes, type DatosMesSede, type GastoMes, type IngresoMes } from "../seis-cifras-mes";
import { hablanDeLoMismo, recuperosDeOtrasSedes } from "../recuperos-entre-sedes";

let n = 0;
const gasto = (fecha: string, categoria: string, monto: number, concepto: string, extra: Partial<GastoMes> = {}): GastoMes => ({
  id: `g${++n}`, fecha, categoria, concepto, monto, propio: monto, metodo: "transferencia",
  prestamoSocio: false, viaBanco: false, transferenciaInterna: false, importado: true, ...extra,
});
const ingreso = (fecha: string, monto: number, nota: string, extra: Partial<IngresoMes> = {}): IngresoMes => ({
  id: `i${++n}`, fecha, monto, nota, metodo: "transferencia", venta: false, reembolso: false, noOperativo: null,
  prestamoSocio: false, viaBanco: false, transferenciaInterna: false, importado: true, ...extra,
});

/** Un setiembre de cafetería con los casos de la auditoría de Fonavi. */
function mes(): DatosMesSede {
  return {
    businessId: 2, sede: "Fonavi", mes: "2026-09", finDeMes: "2026-09-30", hoy: "2026-10-25", hastaHoy: "2026-09-30",
    corteExcel: "2026-09-30", fuenteExcel: true,
    gastos: [
      gasto("2026-09-30", "PLANILLA", 1000, "SUELDO LUANA"),
      gasto("2026-09-09", "MANTENIMIENTO", 100, "MNTO REFRIGERADORA (LUIS LINAN)"),
      gasto("2026-09-29", "POR ACLARAR", 127.4, "A RENDIR (SOLE)"),
      gasto("2026-09-05", "INSUMOS", 3000, "FRUTAS"),
      gasto("2026-09-30", "IMPUESTOS", 125, "IR"),
      gasto("2026-09-30", "DEVOLUCIONES A CLIENTES", 31.2, "DEVOLUCIÓN A CLIENTE (JOSUE)"),
      gasto("2026-09-15", "PRÉSTAMOS Y TARJETAS", 600, "CUOTA DINERS"),
      gasto("2026-09-16", "REMODELACIÓN", 9.6, "PINTURA"),
      gasto("2026-09-15", "DEVOLUCIONES", 21, "VENTA PAGADA POR ERROR A ESTA SEDE"),
    ],
    ingresos: [ingreso("2026-09-10", 9000, "VENTAS", { venta: true })],
    ventas: [{ date: "2026-09-10", total: 9500 }],
    // Centro devolvió 282.50 de la planilla de Luana; Atelier, los 100 de la refrigeradora.
    recuperos: { "2026-09-30": { recuperos: [
      { fecha: "2026-09-30", monto: 282.5, categoria: "PLANILLA", nota: "REEMBOLSO POR SUELDO LUANA" },
      { fecha: "2026-09-30", monto: 100, categoria: "MANTENIMIENTO", nota: "DEVOLUCIÓN POR GASTOS MAL EJECUTADO ARREGLO REFRI" },
    ], deGastos: [] } },
    avisos: [],
  };
}

describe("egresos por tipo (la pestaña de Jahnn)", () => {
  const d = mes();
  const e = egresosPorTipo(d, cifrasDelMes(d));

  it("cinco tipos que suman el total de egresos (control = 0)", () => {
    expect(e.tipos.map((t) => [t.tipo, t.monto])).toEqual([
      ["Fijo", 1227.4], ["Variable", 3156.2], ["Financiamiento", 600], ["Inversión", 9.6], ["No es gasto", 21],
    ]);
    expect(e.totalEgresos).toBe(5014.2);
    expect(e.control).toBe(0);
  });
  it("criterios acordados con Jahnn: POR ACLARAR es fijo provisional; DEVOLUCIONES A CLIENTES e IMPUESTOS son variables; la reparación es mantenimiento (fijo)", () => {
    expect(tipoEgreso("POR ACLARAR")).toBe("Fijo");
    expect(tipoEgreso("DEVOLUCIONES A CLIENTES")).toBe("Variable");
    expect(tipoEgreso("IMPUESTOS")).toBe("Variable");
    expect(tipoEgreso("MANTENIMIENTO")).toBe("Fijo");
    expect(tipoEgreso("DEVOLUCIONES")).toBe("No es gasto");
    expect(tipoEgreso("UNA CATEGORÍA NUEVA")).toBe("Fijo");
  });
  it("porcentajes de los egresos y de los ingresos", () => {
    expect(e.tipos[0].pct).toBe(24.5);
    expect(e.fijoMasVariable).toBe(4383.6);
    expect(e.ingresos).toBe(9000);
    expect(e.fijoPctIngresos).toBe(13.6);
    expect(e.variablePctIngresos).toBe(35.1);
  });
  it("el puente cierra al céntimo con las seis cifras", () => {
    const c = cifrasDelMes(d);
    expect(e.puente.fijo).toMatchObject({ desde: 1227.4, hasta: c.gastos, seisCifras: c.gastos, sinExplicar: 0 });
    expect(e.puente.fijo.lineas).toEqual([expect.objectContaining({ etiqueta: "Devuelto por otras sedes o personas", monto: -382.5 })]);
    expect(e.puente.fijo.lineas[0].detalle).toHaveLength(2);
    expect(e.puente.variable).toMatchObject({ desde: 3156.2, hasta: c.costos, sinExplicar: 0 });
    expect(e.puente.variable.lineas).toEqual([{ etiqueta: "Impuestos (van en su propia línea)", monto: -125 }]);
  });
  it("compartidos, gastos no ejecutados y pagos del socio también tienen su línea", () => {
    const d2 = mes();
    d2.gastos.push(
      gasto("2026-09-20", "SERVICIOS", 300, "LUZ", { propio: 150 }),
      gasto("2026-09-25", "POR ACLARAR", 10.9, "GASTO NO EJECUTADO (ROSA)"),
      gasto("2026-09-26", "INSUMOS", 50, "HARINA", { metodo: "socio" }),
    );
    d2.ingresos.push(ingreso("2026-09-25", 10.9, "DEVOLUCIÓN POR GASTO NO EJECUTADO (ROSA)"));
    const e2 = egresosPorTipo(d2, cifrasDelMes(d2));
    expect(e2.puente.fijo.lineas.map((l) => [l.etiqueta, l.monto])).toEqual([
      ["Parte de otras sedes en gastos compartidos", -150],
      ["Devuelto por otras sedes o personas", -382.5],
      ["Gastos no ejecutados que volvieron", -10.9],
    ]);
    expect(e2.puente.variable.lineas.map((l) => l.etiqueta)).toContain("Pagado por el socio de su bolsillo");
    expect(e2.puente.fijo.sinExplicar).toBe(0);
    expect(e2.puente.variable.sinExplicar).toBe(0);
  });
});

describe("devolución de un gasto mal ejecutado que está como gasto (la refrigeradora de Fonavi)", () => {
  const dev = { fecha: "2026-09-30", monto: 100, nota: "DEVOLUCIÒN POR GASTOS MAL EJECUTADO ARREGLO REFRI (PRODUCTOS SALUDABLES YAYIS)" };
  it("resta de la categoría del gasto que devuelve (MANTENIMIENTO)", () => {
    expect(recuperosDeOtrasSedes([dev], [], [{ fecha: "2026-09-09", monto: 100, categoria: "MANTENIMIENTO", concepto: "MNTO REFRIGERADORA (LUIS LINAN)" }]))
      .toEqual([expect.objectContaining({ monto: 100, categoria: "MANTENIMIENTO" })]);
  });
  it("el monto solo no basta: un gasto de S/100 de otra cosa no se toma", () => {
    expect(recuperosDeOtrasSedes([dev], [], [{ fecha: "2026-09-08", monto: 100, categoria: "CAJA CHICA", concepto: "CAJA CHICA # 17 (ROSARIO REYES)" }])).toEqual([]);
  });
  it("si hay dos parecidos, toma el más cercano a la devolución", () => {
    const r = recuperosDeOtrasSedes([dev], [], [
      { fecha: "2026-08-27", monto: 100, categoria: "INSUMOS", concepto: "REVISIÓN REFRIGERADORA (LUIS LIÑAN)" },
      { fecha: "2026-09-09", monto: 100, categoria: "MANTENIMIENTO", concepto: "MNTO REFRIGERADORA (LUIS LINAN)" },
    ]);
    expect(r).toEqual([expect.objectContaining({ categoria: "MANTENIMIENTO" })]);
  });
  it("sin un gasto que devolver (lo pagado está en DEVOLUCIONES), sigue sin restar, como antes", () => {
    expect(recuperosDeOtrasSedes([dev], [], [])).toEqual([]);
  });
  it("una venta pagada por error a otra sede no es un gasto devuelto", () => {
    expect(recuperosDeOtrasSedes([{ fecha: "2026-09-15", monto: 21, nota: "DEVOLUCIÓN POR VENTA PAGADA POR ERROR" }], [], [{ fecha: "2026-09-12", monto: 21, categoria: "INSUMOS", concepto: "VENTA" }])).toEqual([]);
  });
  it("«REFRI» y «REFRIGERADORA» hablan de lo mismo; los nombres de empresa no cuentan", () => {
    expect(hablanDeLoMismo("ARREGLO REFRI (PRODUCTOS SALUDABLES YAYIS)", "MNTO REFRIGERADORA (LUIS LINAN)")).toBe(true);
    expect(hablanDeLoMismo("DEVOLUCION POR GASTOS MAL EJECUTADO (PRODUCTOS SALUDABLES YAYIS)", "TAPERS (PRODUCTOS SALUDABLES YAYIS)")).toBe(false);
  });
});
