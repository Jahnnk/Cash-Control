/**
 * Auditoría de setiembre 2026 (24-oct-2026): las correcciones A1–A4 y los controles de fiabilidad, con datos
 * INVENTADOS que reproducen los casos reales (el repositorio es público: los movimientos reales no se copian aquí).
 * La regresión con los datos reales de setiembre corre aparte, contra la base: `npm run test:regresion`.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseExcelFile } from "../excel-importer";
import { compensarGastosNoEjecutados, personaDe } from "../gastos-compensados";
import { filasRevisarTipo, MARCA_REVISAR_TIPO } from "../revisar-tipo";
import { cifrasDelMes, cajaDelMes, type DatosMesSede, type GastoMes, type IngresoMes } from "../seis-cifras-mes";
import { cifrasDelGrupo, puntoDeEquilibrio } from "../seis-cifras";
import {
  c1Movimientos, c2Ventas, c3Clasificacion, c4Banco, c5Caja, c6TipoDudoso, c7Coherencia, c7Grupo, c8CargaVigente,
  controlesDeSede, controlesDelGrupo, estadoDe, type DatosControles,
} from "../controles-fiabilidad";

let n = 0;
const gasto = (fecha: string, categoria: string, monto: number, concepto: string, extra: Partial<GastoMes> = {}): GastoMes => ({
  id: `g${++n}`, fecha, categoria, concepto, monto, propio: monto, metodo: "transferencia",
  prestamoSocio: false, viaBanco: false, transferenciaInterna: false, importado: true, ...extra,
});
const ingreso = (fecha: string, monto: number, nota: string, extra: Partial<IngresoMes> = {}): IngresoMes => ({
  id: `i${++n}`, fecha, monto, nota, metodo: "transferencia", venta: false, reembolso: false, noOperativo: null,
  prestamoSocio: false, viaBanco: false, transferenciaInterna: false, importado: true, ...extra,
});

/** Un setiembre cerrado de una cafetería, con los casos de la auditoría. */
function setiembre(): DatosMesSede {
  return {
    businessId: 3, sede: "Centro", mes: "2026-09", finDeMes: "2026-09-30", hoy: "2026-10-24", hastaHoy: "2026-09-30",
    corteExcel: "2026-09-30", fuenteExcel: true,
    gastos: [
      gasto("2026-09-05", "INSUMOS", 4000, "FRUTAS (MERCADO)"),
      gasto("2026-09-30", "PLANILLA", 3000, "SUELDOS"),
      gasto("2026-09-30", "IMPUESTOS", 100, "IR SETIEMBRE"),
      gasto("2026-09-20", "DEVOLUCIONES A CLIENTES", 120, "RECLAMO INDECOPI"),
      // A1: dos gastos no ejecutados que vuelven el mismo mes (el caso de Rosario Reyes).
      gasto("2026-09-25", "POR ACLARAR", 10.9, "GASTO NO EJECUTADO (ROSA PÉREZ)"),
      gasto("2026-09-29", "POR ACLARAR", 33.2, "GASTO NO EJECUTADO (ROSA PÉREZ)"),
      // «A rendir» sin devolución: sigue siendo gasto.
      gasto("2026-09-29", "POR ACLARAR", 127.4, "A RENDIR (SOLE)"),
      // A2: «I» con el monto en la columna de gastos (fila vieja, autocorregida I→G al importar).
      gasto("2026-09-11", "TRANSFERENCIA INTERNA", 63.19, "DEPÓSITO POR VENTAS EN EFECTIVO [VO]"),
      gasto("2026-09-30", "AHORRO", 1000, "FONDOS MUTUOS"),
    ],
    ingresos: [
      ingreso("2026-09-10", 9000, "VENTAS", { venta: true }),
      ingreso("2026-09-25", 10.9, "DEVOLUCIÓN POR GASTO NO EJECUTADO (ROSA PÉREZ)"),
      ingreso("2026-09-30", 33.2, "GASTO NO EJECUTADO (ROSA PÉREZ)"),
      // A4: Grupo «Ventas», aunque la nota parezca un reembolso entre sedes.
      ingreso("2026-09-15", 21, "DEVOLUCIÓN POR YAPE ENVIADO A SEDE EQUIVOCADA", { venta: true, reembolso: true }),
    ],
    ventas: [{ date: "2026-09-10", total: 5000 }, { date: "2026-09-20", total: 5000 }],
    recuperos: { "2026-09-30": { recuperos: [], deGastos: [] } },
    avisos: [{ rowNumber: 114, date: "2026-09-11", amount: 63.19, column: "gc", reason: "type_mismatch", severity: "autocorrected", originalType: "I", correctedType: "G", description: "DEPÓSITO POR VENTAS EN EFECTIVO" }],
  };
}

describe("A1 · gasto no ejecutado o a rendir que vuelve el mismo mes", () => {
  it("empareja por monto, persona y la marca «GASTO NO EJECUTADO» (o el mismo concepto)", () => {
    const pares = compensarGastosNoEjecutados(
      [{ id: "g1", fecha: "2026-09-25", monto: 10.9, concepto: "GASTO NO EJECUTADO (ROSA PÉREZ)" }, { id: "g2", fecha: "2026-09-29", monto: 33.2, concepto: "GASTO NO EJECUTADO (ROSA PÉREZ)" }],
      [{ id: "i1", fecha: "2026-09-25", monto: 10.9, nota: "DEVOLUCIÒN POR GASTO NO EJECUTADO (ROSA PEREZ)" }, { id: "i2", fecha: "2026-09-30", monto: 33.2, nota: "GASTO NO EJECUTADO (ROSA PÉREZ)" }],
    );
    expect(pares.map((p) => [p.gastoId, p.ingresoId])).toEqual([["g1", "i1"], ["g2", "i2"]]);
  });
  it("no compensa si cambia la persona, el monto o el mes, ni con una devolución anterior al gasto", () => {
    const g = [{ id: "g", fecha: "2026-09-25", monto: 50, concepto: "A RENDIR (SOLE)" }];
    expect(compensarGastosNoEjecutados(g, [{ id: "a", fecha: "2026-09-26", monto: 50, nota: "DEVOLUCION A RENDIR (OTRA)" }])).toEqual([]);
    expect(compensarGastosNoEjecutados(g, [{ id: "b", fecha: "2026-09-26", monto: 49, nota: "DEVOLUCION A RENDIR (SOLE)" }])).toEqual([]);
    expect(compensarGastosNoEjecutados(g, [{ id: "c", fecha: "2026-10-01", monto: 50, nota: "DEVOLUCION A RENDIR (SOLE)" }])).toEqual([]);
    expect(compensarGastosNoEjecutados(g, [{ id: "d", fecha: "2026-09-24", monto: 50, nota: "DEVOLUCION A RENDIR (SOLE)" }])).toEqual([]);
    expect(compensarGastosNoEjecutados(g, [{ id: "e", fecha: "2026-09-26", monto: 50, nota: "DEVOLUCION A RENDIR (SOLE)" }])).toHaveLength(1);
  });
  it("cada devolución compensa un solo gasto", () => {
    const g = [1, 2].map((i) => ({ id: `g${i}`, fecha: "2026-09-25", monto: 10, concepto: "GASTO NO EJECUTADO (ANA)" }));
    expect(compensarGastosNoEjecutados(g, [{ id: "i", fecha: "2026-09-25", monto: 10, nota: "GASTO NO EJECUTADO (ANA)" }])).toHaveLength(1);
  });
  it("la persona es lo que va entre paréntesis al final, sin tildes", () => {
    expect(personaDe("DEVOLUCIÒN POR GASTO NO EJECUTADO (Rosa Pérez) [VO]")).toBe("ROSA PEREZ");
  });
});

describe("A2 · tipo y columna cruzados", () => {
  const CABECERA = ["Fecha", "Ing. / Gsto.", "Grupo ", "PROVEEDOR", "RUC", "Concepto", "Comprobante de Pago", "Nro. CP", "ING. EFECTIVO", "ING. CTA. CTE.", "GTOS. EFECTIVO", "GTOS. CTA. CTE.", "SALDO EFECTIVO", "SALDO CTA. CTE."];
  const serial = (iso: string) => Math.round(new Date(iso + "T00:00:00Z").getTime() / 86400000) + 25569;
  function libro(filas: unknown[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([[null], [null, null, null, null, null, null, null, null, "INGRESOS", null, "GASTOS"], CABECERA, ...filas]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ing&Gtos SEP26");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }
  it("«I» con el monto en gastos ya NO se autocorrige: entra marcada REVISAR TIPO, tal como está en las columnas", () => {
    const r = parseExcelFile(libro([
      [serial("2026-09-11"), "I", "Ventas", null, null, "DEPÓSITO POR VENTAS EN EFECTIVO", null, null, null, null, null, 63.19],
    ]), "Ing&Gtos SEP26");
    expect(r.parseWarnings.find((w) => w.reason === "type_mismatch")).toMatchObject({ severity: "revisar", originalType: "I", rowNumber: 4 });
    const m = r.movimientos[0];
    expect(m).toMatchObject({ type: "expense", category: "REVISAR TIPO", amount: 63.19, isByteSale: false });
    expect(m.note.startsWith(MARCA_REVISAR_TIPO)).toBe(true);
    // El total de egresos sigue igual al de la hoja (el dinero está en esa columna).
    expect(r.totales.egresosBcp).toBe(63.19);
  });
  it("«G» con el monto en ingresos sigue siendo una devolución (así anota Kelly la plata que vuelve)", () => {
    const r = parseExcelFile(libro([[serial("2026-09-12"), "G", "INSUMOS", null, null, "DEVOLUCIÓN HARINA", null, null, null, 15]]), "Ing&Gtos SEP26");
    expect(r.movimientos[0]).toMatchObject({ type: "income", isRefund: true });
  });
  it("reconoce las filas viejas por el aviso del importador (misma fecha, monto y concepto)", () => {
    const d = setiembre();
    const filas = filasRevisarTipo({ gastos: d.gastos.map((g) => ({ id: g.id, fecha: g.fecha, monto: g.monto, texto: g.concepto })), ingresos: [], avisos: d.avisos });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ fecha: "2026-09-11", monto: 63.19, fila: 114 });
  });
});

describe("las seis cifras del mes con A1, A2, A3 y A4", () => {
  const c = cifrasDelMes(setiembre());
  it("A1: los gastos no ejecutados que volvieron no son gasto ni otro ingreso", () => {
    expect(c.fuera.compensado).toBe(44.1);
    expect(c.ingresosFuera.compensados).toBe(44.1);
    // Fijos: planilla 3,000 + el «a rendir» sin devolución 127.40 (A2 deja fuera los 63.19).
    expect(c.gastos).toBe(3127.4);
  });
  it("IMPUESTOS no es costo variable; DEVOLUCIONES A CLIENTES sí", () => {
    expect(c.costos).toBe(4120);
    expect(c.impuestos).toBe(100);
  });
  it("A2: la fila cruzada sale de las cifras pero sigue en el total de egresos", () => {
    expect(c.fuera.revisarTipo).toBe(63.19);
    expect(c.fuera.noEsGasto).toBe(1000);
    expect(c.caja.salio).toBe(r2(4000 + 3000 + 100 + 120 + 10.9 + 33.2 + 127.4 + 63.19 + 1000));
  });
  it("A4: la fila con Grupo «Ventas» cuenta en lo ingresado por ventas aunque esté marcada como reembolso", () => {
    expect(c.ingresadoVentas).toBe(9021);
    expect(c.ingresosFuera.devolucionesSedes).toBe(0);
  });
  it("A3: el punto de equilibrio sale de estas mismas cifras", () => {
    expect(c.puntoEquilibrio).toBe(puntoDeEquilibrio(3127.4, 4120, 10000));
    expect(c.puntoEquilibrio).toBe(r2(3127.4 / (1 - 4120 / 10000)));
  });
});

function r2(n: number) { return Math.round(n * 100) / 100; }

function controlesBase(): DatosControles {
  const datos = setiembre();
  const caja = cajaDelMes(datos);
  return {
    datos,
    hoja: { ingresos: caja.entro, egresos: caja.salio },
    lotes: [{ id: "b1", cargadoEl: "2026-09-25", archivo: "SEP 25.xlsx", vigente: false }, { id: "b2", cargadoEl: "2026-10-02", archivo: "SEP 02-10.xlsx", vigente: true }],
    saldoInicial: { fecha: "2026-08-31", banco: 1000, caja: 50 },
    saldosDelMes: [{ fecha: "2026-09-30", banco: r2(1000 + caja.entro - caja.salio), caja: 50 }],
    ventasDia: { byte: [{ date: "2026-09-10", total: 5000 }, { date: "2026-09-20", total: 5000 }], excel: [{ date: "2026-09-10", total: 5000 }, { date: "2026-09-20", total: 5000 }] },
    ventasEfectivo: 0,
  };
}

describe("controles de fiabilidad", () => {
  it("C1: verde si lo importado = el pie; rojo con la diferencia si no", () => {
    const d = controlesBase();
    expect(c1Movimientos(d).estado).toBe("verde");
    expect(c1Movimientos({ ...d, hoja: { ingresos: d.hoja!.ingresos - 33.2, egresos: d.hoja!.egresos } })).toMatchObject({ estado: "rojo", diferencia: 33.2 });
    expect(c1Movimientos({ ...d, hoja: null }).estado).toBe("amarillo");
  });
  it("C2: 0 verde · hasta S/5 amarillo · más rojo, con los días", () => {
    const d = controlesBase();
    expect(c2Ventas(d, "2026-09-30").estado).toBe("verde");
    const am = c2Ventas({ ...d, ventasDia: { ...d.ventasDia, excel: [{ date: "2026-09-10", total: 5001.6 }, { date: "2026-09-20", total: 5000 }] } }, "2026-09-30");
    expect(am).toMatchObject({ estado: "amarillo", diferencia: 1.6 });
    expect(am.filas).toHaveLength(1);
    expect(c2Ventas({ ...d, ventasDia: { ...d.ventasDia, excel: [{ date: "2026-09-10", total: 4990 }] } }, "2026-09-30").estado).toBe("rojo");
  });
  it("C3: lo que quedó POR ACLARAR (sin lo compensado ni lo cruzado) contra los egresos", () => {
    const c3 = c3Clasificacion(controlesBase());
    // 127.40 de 8,454.69 = 1.5% → rojo; las filas compensadas de A1 no cuentan.
    expect(c3).toMatchObject({ estado: "rojo", diferencia: 127.4 });
    expect(c3.filas).toHaveLength(1);
  });
  it("C4: inicial + ingresos − egresos del banco = saldo del Excel (±S/1)", () => {
    const d = controlesBase();
    expect(c4Banco(d).estado).toBe("verde");
    const fin = d.saldosDelMes[0];
    expect(c4Banco({ ...d, saldosDelMes: [{ ...fin, banco: fin.banco! + 3810.52 }] })).toMatchObject({ estado: "rojo", diferencia: 3810.52 });
  });
  it("C5: caja negativa o quieta todo el mes con ventas en efectivo → rojo", () => {
    const d = controlesBase();
    expect(c5Caja(d).estado).toBe("verde");
    expect(c5Caja({ ...d, saldoInicial: { ...d.saldoInicial!, caja: -103 } }).estado).toBe("rojo");
    expect(c5Caja({ ...d, ventasEfectivo: 7787.7 }).estado).toBe("rojo");
  });
  it("C6: la fila con el tipo cruzado deja el mes en rojo", () => {
    const c6 = c6TipoDudoso(controlesBase());
    expect(c6).toMatchObject({ estado: "rojo", diferencia: 63.19 });
    expect(c6.filas?.[0]).toBe("Fila 114 · 11/09 · DEPÓSITO POR VENTAS EN EFECTIVO [VO] · S/63.19");
  });
  it("C7: las cifras cuadran; si alguien rompe el cálculo, rojo", () => {
    const c = cifrasDelMes(setiembre());
    expect(c7Coherencia(c).estado).toBe("verde");
    expect(c7Coherencia({ ...c, puntoEquilibrio: (c.puntoEquilibrio ?? 0) + 1 }).estado).toBe("rojo");
    expect(c7Coherencia({ ...c, ganancia: (c.ganancia ?? 0) + 1 }).estado).toBe("rojo");
    const g = cifrasDelGrupo([c]);
    expect(c7Grupo(g, [c]).estado).toBe("verde");
    expect(c7Grupo({ ...g, gastos: g.gastos + 1 }, [c]).estado).toBe("rojo");
  });
  it("C8: manda la última carga y cubre el mes; si no, amarillo", () => {
    const d = controlesBase();
    expect(c8CargaVigente(d).estado).toBe("verde");
    expect(c8CargaVigente({ ...d, lotes: [{ ...d.lotes[1], vigente: false }, { ...d.lotes[0], vigente: true, cargadoEl: "2026-09-25" }].reverse() }).estado).toBe("amarillo");
    expect(c8CargaVigente({ ...d, lotes: [{ ...d.lotes[0], vigente: true }], datos: { ...d.datos, corteExcel: "2026-09-24" } }).estado).toBe("amarillo");
  });
  it("estado del mes: confiable / con observaciones / no confiable", () => {
    const v = { id: "C1" as const, nombre: "", estado: "verde" as const, diferencia: null, detalle: "", queHacer: "" };
    expect(estadoDe([v, v])).toBe("confiable");
    expect(estadoDe([v, { ...v, estado: "amarillo" }])).toBe("con_observaciones");
    expect(estadoDe([v, { ...v, estado: "amarillo" }, { ...v, estado: "rojo" }])).toBe("no_confiable");
  });
  it("todo junto: el setiembre inventado queda «No confiable» (C3 y C6 en rojo); el grupo hereda el peor estado", () => {
    const r = controlesDeSede(controlesBase());
    expect(r.estado).toBe("no_confiable");
    expect(r.controles.filter((c) => c.estado === "rojo").map((c) => c.id)).toEqual(["C3", "C6"]);
    const g = controlesDelGrupo("2026-09", [r], c7Grupo(cifrasDelGrupo([r.cifras]), [r.cifras]));
    expect(g.estado).toBe("no_confiable");
  });
});
