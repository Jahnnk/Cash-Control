/**
 * La verificación contra el Excel de Kelly, con el caso real de Atelier en
 * setiembre de 2026 (el saldo del alquiler mal repartido).
 */
import { describe, it, expect } from "vitest";
import { verificarMes, omitidosDeNotas, type GastoFila, type IngresoFila } from "../verificacion-kelly";

const ing = (monto: number, nota: string, o: Partial<IngresoFila> = {}): IngresoFila => ({
  monto, nota, importado: true, fecha: "2026-09-10", reembolsoEntreSedes: false, prestamoSocio: false, transferenciaInterna: false, noOperativo: null, ...o,
});
const gas = (monto: number, concepto: string, o: Partial<GastoFila> = {}): GastoFila => ({
  monto, concepto, importado: true, fecha: "2026-09-04", categoria: "INSUMOS", compartido: false, atelier: null, fonavi: null, centro: null,
  prestamoSocio: false, transferenciaInterna: false, ...o,
});
const FIJOS = [{ categoria: "ALQUILER", concepto: "Alquiler", fijo: 1800 }];

// Setiembre de Atelier, resumido: ventas + reembolso + préstamo; gastos con el alquiler en dos partes.
const ingresos = [
  ing(27750.02, "VENTAS"),
  ing(900, "REEMBOLSO POR ALQUILER SEP26 (EXPERIENCIAS GASTRONOMICAS YAYIS SRL)", { reembolsoEntreSedes: true }),
  ing(1500, "PRÉSTAMO PARA 50% ARREGLO ABATIDOR (JUAN TERRONES)", { noOperativo: "Préstamos / financiamiento recibido" }),
];
const gastosBien = [
  gas(28842.52, "VARIOS"),
  gas(2400, "ALQUILER SEPTIEMBRE 2026", { categoria: "ALQUILER", compartido: true, atelier: 1800, fonavi: 600, centro: 0 }),
  gas(300, "SALDO ALQUILER SEP26", { categoria: "ALQUILER", compartido: true, atelier: 0, fonavi: 300, centro: 0, fecha: "2026-09-11" }),
  gas(89.9, "INTERNET", { categoria: "SERVICIOS", compartido: true, atelier: 44.95, fonavi: 44.95, centro: 0 }),
];
const foto = { ingresos: 30150.02, egresos: 31632.42, omitidosEgresos: 0 };

describe("verificación del Excel de Kelly", () => {
  it("setiembre corregido: cuadra y el puente explica cada sol", () => {
    const v = verificarMes({ foto, ingresos, gastos: gastosBien, sistema: { ingresos: 27750.02, gastos: 30687.47 }, fijosAtelier: FIJOS, esAtelier: true });
    expect(v.estado).toBe("ok");
    expect(v.alertas).toEqual([]);
    expect(v.puenteIngresos.map((l) => l.monto)).toEqual([30150.02, -900, -1500]);
    expect(v.puenteGastos.map((l) => l.monto)).toEqual([31632.42, -944.95]);
  });

  it("el error del alquiler (saldo de S/300 con S/1,800 a Atelier) salta solo", () => {
    const mal = gastosBien.map((g) => (g.concepto === "SALDO ALQUILER SEP26" ? { ...g, atelier: 1800, fonavi: -1500 } : g));
    const v = verificarMes({ foto, ingresos, gastos: mal, sistema: { ingresos: 27750.02, gastos: 32487.47 }, fijosAtelier: FIJOS, esAtelier: true });
    expect(v.estado).toBe("alerta");
    expect(v.alertas.map((a) => a.regla).sort()).toEqual(["fijo", "reparto"]);
  });

  it("un préstamo contado como venta salta solo (caso agosto)", () => {
    const conPrestamo = [...ingresos.slice(0, 2), ing(1500, "PRÉSTAMO PARA 50% ARREGLO ABATIDOR (JUAN TERRONES)")];
    const v = verificarMes({ foto, ingresos: conPrestamo, gastos: gastosBien, sistema: { ingresos: 29250.02, gastos: 30687.47 }, fijosAtelier: FIJOS, esAtelier: true });
    expect(v.alertas.map((a) => a.regla)).toEqual(["prestamo"]);
  });

  it("si al cargar se pierde una fila, lo avisa contra la foto", () => {
    const v = verificarMes({ foto, ingresos: ingresos.slice(0, 2), gastos: gastosBien, sistema: { ingresos: 27750.02, gastos: 30687.47 }, fijosAtelier: FIJOS, esAtelier: true });
    expect(v.alertas.some((a) => a.regla === "plata-completa")).toBe(true);
  });

  it("si el sistema muestra algo que el puente no explica, lo avisa", () => {
    const v = verificarMes({ foto, ingresos, gastos: gastosBien, sistema: { ingresos: 27750.02, gastos: 30700 }, fijosAtelier: FIJOS, esAtelier: true });
    expect(v.sinExplicar.gastos).toBe(12.53);
    expect(v.alertas.map((a) => a.regla)).toEqual(["puente"]);
  });

  it("lo registrado solo por dirección entra al puente con su nombre", () => {
    const conManual = [...gastosBien, gas(120, "Compra a mano", { importado: false })];
    const v = verificarMes({ foto, ingresos, gastos: conManual, sistema: { ingresos: 27750.02, gastos: 30807.47 }, fijosAtelier: FIJOS, esAtelier: true });
    expect(v.estado).toBe("ok");
    expect(v.puenteGastos.at(-1)).toEqual({ etiqueta: "Registrado solo en el sistema (dirección)", monto: 120 });
  });

  it("sin foto (cargas viejas) igual revisa el puente y las reglas", () => {
    const v = verificarMes({ foto: null, ingresos, gastos: gastosBien, sistema: { ingresos: 27750.02, gastos: 30687.47 }, fijosAtelier: FIJOS, esAtelier: true });
    expect(v.estado).toBe("sin-foto");
  });

  it("lee los omitidos de las notas del lote", () => {
    expect(omitidosDeNotas("byte_sales_days=30, tips=21, alerts=4, omitidos_egresos=2700")).toBe(2700);
    expect(omitidosDeNotas(null)).toBe(0);
  });
});

describe("verificación de ventas (Control de VTAS de Kelly vs reporte de Byte)", () => {
  it("caso Atelier set-2026: explica cada sol y marca los días que difieren en S/5 o más", async () => {
    const { verificarVentas } = await import("../verificacion-kelly");
    const r = verificarVentas({
      byte: [{ date: "2026-09-07", total: 2919.97 }, { date: "2026-09-08", total: 779.8 }, { date: "2026-09-09", total: 1640.72 }],
      kelly: [{ date: "2026-09-07", total: 2316.58 }, { date: "2026-09-08", total: 777.8 }, { date: "2026-09-09", total: 1640.72 }, { date: "2026-09-22", total: 3182.09 }],
      registro: [{ date: "2026-09-23", total: 100 }],
    })!;
    expect(r.sistema).toBe(2919.97 + 779.8 + 1640.72 + 3182.09 + 100);
    expect(r.puente.map((l) => l.monto)).toEqual([7917.19, 605.39, 100]);
    // El 08/09 difiere solo S/2: entra al puente pero no es alerta.
    expect(r.alertas).toHaveLength(1);
    expect(r.alertas[0].detalle).toContain("07/09");
    expect(r.alertas[0].detalle).not.toContain("08/09");
  });

  it("sin ninguna fuente no verifica ventas", async () => {
    const { verificarVentas } = await import("../verificacion-kelly");
    expect(verificarVentas({ byte: [], kelly: [], registro: [] })).toBeNull();
  });
});

describe("el ingreso y gasto del dashboard son los del Excel", () => {
  it("igual al Excel: sin alerta; distinto: alerta", async () => {
    const { verificarMes } = await import("../verificacion-kelly");
    const base = { foto, ingresos, gastos: gastosBien, sistema: { ingresos: 27750.02, gastos: 30687.47 }, fijosAtelier: FIJOS, esAtelier: true };
    const ok = verificarMes({ ...base, caja: { entro: 30150.02, salio: 31632.42 } });
    expect(ok.estado).toBe("ok");
    expect(ok.caja).toEqual({ entro: 30150.02, salio: 31632.42, esperadoEntro: 30150.02, esperadoSalio: 31632.42 });
    const mal = verificarMes({ ...base, caja: { entro: 30150.02, salio: 31000 } });
    expect(mal.alertas.map((a) => a.regla)).toEqual(["caja"]);
  });

  it("un gasto pagado por el socio no cuenta como plata que salió", async () => {
    const { verificarMes } = await import("../verificacion-kelly");
    const conSocio = [...gastosBien, gas(500, "Pagado por Jahnn", { importado: false, metodo: "socio" })];
    const v = verificarMes({ foto, ingresos, gastos: conSocio, sistema: { ingresos: 27750.02, gastos: 31187.47 }, fijosAtelier: FIJOS, esAtelier: true, caja: { entro: 30150.02, salio: 31632.42 } });
    expect(v.caja?.esperadoSalio).toBe(31632.42);
    expect(v.alertas).toEqual([]);
  });
});

describe("ventas con el administrador como tercer dato", () => {
  it("30/08: Byte incompleto, el admin confirma el Excel y el sistema lo usa", async () => {
    const { verificarVentas } = await import("../verificacion-kelly");
    const r = verificarVentas({
      byte: [{ date: "2026-08-30", total: 102.1 }, { date: "2026-08-05", total: 1187.3 }],
      kelly: [{ date: "2026-08-30", total: 899.6 }, { date: "2026-08-05", total: 1071.3 }],
      registro: [{ date: "2026-08-30", total: 899.6 }, { date: "2026-08-05", total: 1187.3 }],
    })!;
    expect(r.sistema).toBe(899.6 + 1187.3);
    expect(r.alertas.map((a) => a.titulo)).toEqual([
      "El reporte de Byte parece incompleto en 1 día",
      "El Excel no coincide con Byte en 1 día",
    ]);
  });
});
