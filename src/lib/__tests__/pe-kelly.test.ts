import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseCategoriasPE, parsePEMensualExcel, clasificarGastosPE, normGrupoPE } from "../pe-kelly";

function libro(hojas: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [n, aoa] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const CATEGORIAS: unknown[][] = [
  ["CATEGORÍAS PE — un solo lugar para clasificar"],
  ["Kelly no ha escrito el nombre del grupo igual todos los meses…"],
  ["Texto tal como aparece en \"Grupo\"", "Tipo", "Nota"],
  ["PLANILLA", "Fijo", "Sueldos"],
  ["PRÉSTAMOS SOCIO", "Fijo", "Diners + Kelly"],
  ["PRESTAMO DINERS", "Fijo", null],
  ["INSUMOS", "Variable", null],
  ["PRODUCTOS ATELIER", "Variable", null],
  ["DECORACIÒN", "Excluido", null],
  ["OTROS", "Excluido", null],
];

describe("pestaña Categorías PE", () => {
  it("lee grupo, tipo y nota", () => {
    const r = parseCategoriasPE(libro({ "Categorías PE": CATEGORIAS }))!;
    expect(r.errores).toEqual([]);
    expect(r.categorias).toHaveLength(7);
    expect(r.categorias[1]).toEqual({ grupo: "PRÉSTAMOS SOCIO", grupoNorm: "PRESTAMOS SOCIO", tipo: "Fijo", nota: "Diners + Kelly" });
  });

  it("sin la pestaña devuelve null (el sistema sigue con su clasificación)", () => {
    expect(parseCategoriasPE(libro({ Otra: [["x"]] }))).toBeNull();
  });

  it("un tipo desconocido o dos variantes con tipos distintos son error", () => {
    const r = parseCategoriasPE(libro({ "Categorías PE": [...CATEGORIAS, ["INSUMOS", "Fijo"], ["LUZ", "Mensual"]] }))!;
    expect(r.errores).toHaveLength(2);
  });
});

describe("clasificación de gastos con la lista de Kelly", () => {
  const cats = parseCategoriasPE(libro({ "Categorías PE": CATEGORIAS }))!.categorias;

  it("tildes, mayúsculas y espacios no dejan un gasto afuera", () => {
    expect(normGrupoPE("  Decoración ")).toBe(normGrupoPE("DECORACIÒN"));
    const r = clasificarGastosPE([
      { grupo: "PLANILLA", monto: 10959.42 },
      { grupo: "Préstamos Socio", monto: 1161.6 },
      { grupo: "INSUMOS", monto: 5644.52 },
      { grupo: "decoración", monto: 12 },
      { grupo: "SS GENERALES", monto: 85 },
    ], cats);
    expect(r).toEqual({ fijos: 12121.02, variables: 5644.52, excluido: 12, sinTipo: [{ grupo: "SS GENERALES", monto: 85 }] });
  });
});

describe("pestañas PE <MES> (lo que calculó el Excel)", () => {
  it("lee los totales y el punto de equilibrio por etiqueta", () => {
    const hoja: unknown[][] = [
      [null, "PUNTO DE EQUILIBRIO — AGO26 · YAYI'S FONAVI (automático)"],
      [],
      [null, "Ventas totales BITE", null, 38872.65],
      [null, "Total Costos Variables", null, 22219.56],
      [null, "Total Costos Fijos", null, 16062.13],
      [null, "Total Excluido (financiamiento / inversión / no recurrente)", null, 10940.62],
      [null, "Margen de contribución (%)", null, 0.4284],
      [null, "PUNTO DE EQUILIBRIO MENSUAL (S/)", null, 37493.1954216605],
      [null, "Debe ser \"0\"", null, 0],
    ];
    const r = parsePEMensualExcel(libro({ "PE AGO26": hoja, "PE Resumen": [["x"]] }), 2026);
    expect(r).toEqual([{
      month: "2026-08", hoja: "PE AGO26", ventas: 38872.65, costosVariables: 22219.56, costosFijos: 16062.13,
      excluido: 10940.62, puntoEquilibrio: 37493.2, conciliacion: 0,
    }]);
  });
  it("con ajustes del mes toma los totales finales, no los brutos (Atelier ago-2026)", () => {
    const hoja: unknown[][] = [
      ["PUNTO DE EQUILIBRIO — AGO26 · YAYI'S ATELIER"],
      ["Ventas totales BITE", null, 40905.24],
      ["Total Costos Fijos (bruto, antes de ajustes de este mes)", null, 28189.83],
      ["Total Excluido (bruto, antes de ajustes de este mes)", null, 5050.63],
      ["(–) Devolución de préstamo intercompañía a Fonavi (fila 257)", null, 1000],
      ["Total Costos Variables", null, 19236.14],
      ["Total Costos Fijos", null, 25989.83],
      ["Total Excluido (financiamiento / inversión / no recurrente)", null, 7250.63],
      ["PUNTO DE EQUILIBRIO MENSUAL (S/)", null, 49061.5777],
    ];
    const [r] = parsePEMensualExcel(libro({ "PE AGO26": hoja }), 2026);
    expect(r).toMatchObject({ costosFijos: 25989.83, excluido: 7250.63, costosVariables: 19236.14, puntoEquilibrio: 49061.58 });
  });
});
