/**
 * La pestaña «CONTROL EFECTIVO <MES>» del Excel de Kelly · lectura OPCIONAL (pura).
 *
 * En Fonavi y Centro todo el efectivo de las ventas se deposita al banco; Kelly lo controla en esa pestaña:
 * VENTAS (efectivo vendido en el día), DEPÓSITO (lo que se llevó al banco), VARIACIÓN (lo que queda por depositar)
 * y una fila TOTAL. El control C5 compara los totales (lib/controles-fiabilidad.ts): si casi todo lo vendido en
 * efectivo se depositó, la caja está bien aunque el libro no registre movimientos en efectivo.
 *
 * Setiembre 2026: Fonavi 8,031.15 vendidos vs 8,031.10 depositados; Centro 7,787.70 vs 7,787.70.
 *
 * Las columnas se buscan por su encabezado (Kelly escribe «DEPÒSITO» y «VARIACIÒN» con acento grave), nunca por
 * posición. Si la pestaña no existe o no se entiende, devuelve null y la carga sigue igual.
 */

import { parseSheetMonthYear } from "./sheet-month";

export type ControlEfectivo = { hoja: string; ventas: number; depositos: number; variacion: number | null; filaTotal: number };

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

export const esHojaControlEfectivo = (nombre: string) => /^CONTROL EFECTIVO\b/.test(norm(nombre));

/** La pestaña «CONTROL EFECTIVO <MES>» del mes (YYYY-MM), o null si el archivo no la trae. */
export function hojaControlEfectivoDelMes(sheetNames: string[], mes: string): string | null {
  const year = Number(mes.slice(0, 4));
  return sheetNames.find((n) => {
    if (!esHojaControlEfectivo(n)) return false;
    const p = parseSheetMonthYear(n, year);
    return p !== null && `${p.year}-${String(p.month).padStart(2, "0")}` === mes;
  }) ?? null;
}

const aNumero = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[,\sS/]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Lee la fila TOTAL. `rows` = sheet_to_json(..., { header: 1 }). */
export function parseControlEfectivo(rows: unknown[][], hoja: string): ControlEfectivo | null {
  // El encabezado: la fila que tiene VENTAS y DEPÓSITO.
  let cab = -1, cVentas = -1, cDep = -1, cVar = -1;
  for (let i = 0; i < Math.min(rows.length, 15) && cab < 0; i++) {
    const r = rows[i] ?? [];
    const iv = r.findIndex((c) => norm(c) === "VENTAS");
    const id = r.findIndex((c) => /^DEPOSITOS?$/.test(norm(c)));
    if (iv >= 0 && id >= 0) {
      cab = i; cVentas = iv; cDep = id;
      cVar = r.findIndex((c) => /^VARIACION$/.test(norm(c)));
    }
  }
  if (cab < 0) return null;
  for (let i = cab + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (!r.some((c) => norm(c) === "TOTAL")) continue;
    const ventas = aNumero(r[cVentas]), depositos = aNumero(r[cDep]);
    if (ventas === null || depositos === null) return null;
    const variacion = cVar >= 0 ? aNumero(r[cVar]) : null;
    return { hoja, ventas: r2(ventas), depositos: r2(depositos), variacion: variacion === null ? null : r2(variacion), filaTotal: i + 1 };
  }
  return null;
}

/** Cómo viaja en import_batches.notes (sin migración): «efectivo_ventas=…, efectivo_depositos=…». */
export function controlEfectivoANotas(c: ControlEfectivo | null): string[] {
  if (!c) return [];
  return [`efectivo_ventas=${c.ventas}`, `efectivo_depositos=${c.depositos}`, ...(c.variacion !== null ? [`efectivo_variacion=${c.variacion}`] : [])];
}

export function controlEfectivoDeNotas(notas: string | null | undefined): { ventas: number; depositos: number } | null {
  const v = (k: string) => {
    const m = notas?.match(new RegExp(`(?:^|[^a-z_])${k}=(-?[\\d.]+)`));
    return m ? Number(m[1]) : null;
  };
  const ventas = v("efectivo_ventas"), depositos = v("efectivo_depositos");
  return ventas !== null && depositos !== null ? { ventas, depositos } : null;
}
