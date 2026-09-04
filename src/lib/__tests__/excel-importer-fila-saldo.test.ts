/**
 * La fila de SALDO que abre cada pestaña.
 *
 * Kelly arranca cada mes con el arrastre del mes anterior y lo marca
 * con Grupo='SALDO'. No es un movimiento: es el punto de partida.
 *
 * El parser solo la reconocía cuando el concepto decía "Saldo al …".
 * Pero Kelly escribe "SALDOS DE MESES ANTERIORS" o "SALDOS 31/08/2026",
 * que no calzan con esa frase — y esas filas entraban como INGRESO.
 * Pasó de verdad: S/2,491.87 se coló dos veces en Centro (junio y
 * julio 2026), S/4,983.74 de venta que nunca existió.
 *
 * Y hubo un segundo efecto: la fila lleva la fecha del último día del
 * MES ANTERIOR, así que el candado de "filas fuera del mes" la leía
 * como fecha equivocada y bloqueaba el archivo entero. Al dejar de ser
 * un movimiento, el candado deja de verla.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseExcelFile } from "../excel-importer";
import { revisarFechasDelMes } from "../filas-fuera-del-mes";

const CABECERA = [
  "Fecha", "Ing. / Gsto.", "Grupo ", "PROVEEDOR", "RUC", "Concepto",
  "Comprobante de Pago", "Nro. CP", "ING. EFECTIVO", "ING. CTA. CTE.",
  "GTOS. EFECTIVO", "GTOS. CTA. CTE.", "SALDO EFECTIVO", "SALDO CTA. CTE.",
];

const serial = (iso: string) =>
  Math.round(new Date(iso + "T00:00:00Z").getTime() / 86400000) + 25569;

function libro(filas: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    [null, null, null, null, null, null, null, null, null, null, null, null, null, "SALDO"],
    [null, null, null, null, null, null, null, null, "INGRESOS", null, "GASTOS", null, "SALDO"],
    CABECERA,
    ...filas,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ing&Gtos AGO26");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** La fila de saldo tal cual la escribe Kelly, con el concepto variable. */
const filaSaldo = (fecha: string, concepto: string) =>
  [serial(fecha), "I", "SALDO", "SALDO", null, concepto, null, null, 2491.87, 1419.9, null, null];

/** Una venta normal del mes, para que la hoja no quede vacía. */
const ventaNormal = [serial("2026-08-05"), "I", "Ventas", "BCP", "NA", "YAPE", "SC", "SC", null, 474.9, null, null];

const parse = (filas: unknown[][]) => parseExcelFile(libro(filas), "Ing&Gtos AGO26");

describe("la fila de saldo nunca es un movimiento", () => {
  // Las tres redacciones que Kelly usó de verdad entre mayo y setiembre.
  const REDACCIONES = [
    "Saldo al 31/07/2026",
    "SALDOS DE MESES ANTERIORS (ENE-JUN)",
    "SALDOS 31/08/2026",
  ];

  for (const concepto of REDACCIONES) {
    it(`la descarta escriba "${concepto}"`, () => {
      const r = parse([filaSaldo("2026-07-31", concepto), ventaNormal]);
      expect(r.movimientos).toHaveLength(1);
      expect(r.movimientos[0].category).not.toBe("SALDO");
      // Y no infla los ingresos con los S/2,491.87 del arrastre.
      const totalIngresos = r.movimientos
        .filter((m) => m.type === "income")
        .reduce((s, m) => s + m.amount, 0);
      expect(totalIngresos).toBe(474.9);
    });
  }

  it("deja rastro de lo descartado, con su monto", () => {
    // Descartar plata en silencio es tan peligroso como importarla de
    // más: tiene que quedar auditable.
    const r = parse([filaSaldo("2026-07-31", "SALDOS DE MESES ANTERIORS"), ventaNormal]);
    const rastro = r.parseWarnings.filter((w) => w.reason === "balance_row");
    expect(rastro).toHaveLength(1);
    expect(rastro[0].amount).toBe(2491.87);
    expect(rastro[0].severity).toBe("silenced");
  });

  it("sigue capturando el saldo inicial cuando dice 'Saldo al'", () => {
    // Esa redacción SÍ dice a qué fecha corresponde el corte, así que
    // se puede aplicar sin adivinar.
    const r = parse([filaSaldo("2026-07-31", "Saldo al 31/07/2026"), ventaNormal]);
    expect(r.saldoInicial.efectivo).toBe(2491.87);
    expect(r.saldoInicial.bcp).toBe(1419.9);
  });
});

describe("el candado de fechas fuera del mes", () => {
  it("ya no bloquea por la fila de saldo del mes anterior", () => {
    // Era el error que veía Jahnn: "la pestaña de agosto tiene 1 fila
    // con fecha de julio (S/2491.87 de ingresos)".
    const r = parse([filaSaldo("2026-07-31", "SALDOS DE MESES ANTERIORS"), ventaNormal]);
    expect(revisarFechasDelMes(r.movimientos, "2026-08")).toBeNull();
  });

  it("pero SIGUE bloqueando una fecha de verdad equivocada", () => {
    // El candado no se aflojó: una compra fechada en julio dentro de la
    // pestaña de agosto se sigue frenando, que es para lo que existe.
    const compraMalFechada = [
      serial("2026-07-12"), "G", "INSUMOS", "PROVEEDOR", null, "HARINA", "FA", "001", null, null, null, 4613.4,
    ];
    const r = parse([filaSaldo("2026-07-31", "SALDOS 31/07/2026"), ventaNormal, compraMalFechada]);
    const rev = revisarFechasDelMes(r.movimientos, "2026-08");
    expect(rev).not.toBeNull();
    expect(rev!.filas).toHaveLength(1);
    expect(rev!.filas[0].fecha).toBe("2026-07-12");
    expect(rev!.totalEgresos).toBe(4613.4);
  });
});
