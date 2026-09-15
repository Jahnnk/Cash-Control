/**
 * Parser de la pestaña "CONTROL VENTAS <MES><AA>" del Excel de Kelly.
 *
 * ─── Por qué existe ───
 *
 * Jahnn, 14-sep-2026: el reporte mensual de Atelier mostraba "Ventas Byte
 * S/13,095.60" y, al abrir el detalle, todos los días en cero. La causa:
 * la pestaña "Control de VTAS" separa por medio de pago (efectivo, Yape,
 * POS) y Atelier vende casi todo AL CRÉDITO, así que el detalle —que solo
 * suma lo cobrado— salía vacío, y el total mezclaba el crédito de Kelly
 * con un Yape que Byte no tenía.
 *
 * Kelly armó una pestaña nueva que es exactamente lo que hacía falta: el
 * reporte diario de Byte al lado de su propia separación en crédito y
 * contado, con la diferencia de cada día.
 *
 *   Día | # Pedidos | Descuentos | Total Vendido | VTA. CRÉDITO |
 *   VTA. CONTADO | TOTAL | VARIACIÓN | (nota)
 *
 * "Total Vendido" es Byte; "Crédito" y "Contado" son el registro de Kelly;
 * TOTAL y VARIACIÓN son fórmulas (crédito + contado, y la resta). Acá solo
 * se leen los datos de origen y la nota: las fórmulas se recalculan en el
 * sistema, para que un error de fórmula en el Excel no pase de largo.
 *
 * Columnas detectadas por el TEXTO del encabezado, nunca por posición
 * (regla del repo: el rango `!ref` cambia según la columna A).
 */

import * as XLSX from "xlsx";
import { parseSheetMonthYear, currentYearLima } from "./sheet-month";

export type VentaControlDiaria = {
  date: string;            // YYYY-MM-DD
  pedidos: number;
  descuentos: number;
  totalVendido: number;    // lo que reporta Byte
  ventaCredito: number;    // registro de Kelly
  ventaContado: number;    // registro de Kelly
  nota: string | null;     // p. ej. "FACTURAS ANULADAS"
};

export type ControlVentasDiarioResult = {
  mes: string | null;      // YYYY-MM de la pestaña
  filas: VentaControlDiaria[];
  errores: string[];
};

/** "CONTROL VENTAS SEP26", "Control Ventas AGO26"… (no confundir con "Control de VTAS-SEP"). */
export function esHojaControlVentas(nombre: string): boolean {
  return /^control\s+ventas[\s\-]+[A-Za-z]{3}\d{0,2}$/i.test(nombre.trim());
}

export function listControlVentasSheets(buffer: Buffer | ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  return wb.SheetNames.filter(esHojaControlVentas);
}

/** La pestaña CONTROL VENTAS de un mes (YYYY-MM), si el archivo la trae. */
export function hojaControlVentasDelMes(sheetNames: string[], mes: string): string | null {
  const year = Number(mes.slice(0, 4));
  return (
    sheetNames.find((n) => {
      if (!esHojaControlVentas(n)) return false;
      const p = parseSheetMonthYear(n, year);
      return p !== null && `${p.year}-${String(p.month).padStart(2, "0")}` === mes;
    }) ?? null
  );
}

const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function aNumero(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\sS/]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function aFecha(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null;
  }
  if (typeof v === "string") {
    const iso = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return null;
}

export function parseControlVentasDiario(buffer: Buffer | ArrayBuffer, sheetName: string): ControlVentasDiarioResult {
  const errores: string[] = [];
  const parsed = parseSheetMonthYear(sheetName, currentYearLima());
  const mes = parsed ? `${parsed.year}-${String(parsed.month).padStart(2, "0")}` : null;
  if (!mes) return { mes, filas: [], errores: [`No pude leer el mes del nombre de la pestaña '${sheetName}'.`] };

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) return { mes, filas: [], errores: [`No encontré la pestaña '${sheetName}'.`] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

  // Fila de encabezado: la que tiene "Día" y "Total Vendido".
  const hIdx = rows.findIndex((r) => r.some((c) => norm(c) === "dia") && r.some((c) => norm(c).startsWith("total vendido")));
  if (hIdx === -1) {
    return { mes, filas: [], errores: [`En '${sheetName}' no encontré el encabezado (Día / Total Vendido).`] };
  }
  const h = rows[hIdx].map(norm);
  const col = (pred: (t: string) => boolean) => h.findIndex(pred);
  const c = {
    dia: col((t) => t === "dia"),
    pedidos: col((t) => t.includes("pedidos")),
    descuentos: col((t) => t.startsWith("descuentos")),
    vendido: col((t) => t.startsWith("total vendido")),
    credito: col((t) => t.includes("credito")),
    contado: col((t) => t.includes("contado")),
    variacion: col((t) => t.startsWith("variacion")),
  };
  console.log(`[control-ventas-diario] sheetName="${sheetName}" headerRow=${hIdx} cols=${JSON.stringify(c)}`);
  const faltan = Object.entries(c).filter(([k, i]) => i === -1 && k !== "variacion" && k !== "descuentos").map(([k]) => k);
  if (faltan.length > 0) {
    return { mes, filas: [], errores: [`En '${sheetName}' faltan columnas: ${faltan.join(", ")}.`] };
  }
  // La nota va a la derecha de VARIACIÓN (o de CONTADO si no hubiera variación).
  const cNota = (c.variacion !== -1 ? c.variacion : Math.max(c.contado, c.credito)) + 1;

  const filas: VentaControlDiaria[] = [];
  for (const r of rows.slice(hIdx + 1)) {
    const date = aFecha(r[c.dia]);
    if (!date) continue; // "TOTAL", filas vacías
    if (date.slice(0, 7) !== mes) {
      errores.push(`La fila con fecha ${date} no es de ${mes} (pestaña '${sheetName}'). Corrígela en el Excel.`);
      continue;
    }
    const fila: VentaControlDiaria = {
      date,
      pedidos: Math.round(aNumero(r[c.pedidos])),
      descuentos: c.descuentos === -1 ? 0 : aNumero(r[c.descuentos]),
      totalVendido: aNumero(r[c.vendido]),
      ventaCredito: aNumero(r[c.credito]),
      ventaContado: aNumero(r[c.contado]),
      nota: typeof r[cNota] === "string" && r[cNota]!.toString().trim() ? r[cNota]!.toString().trim() : null,
    };
    // Un día en cero todavía no se llenó (o no hubo venta): no se guarda.
    if (fila.pedidos === 0 && fila.totalVendido === 0 && fila.ventaCredito === 0 && fila.ventaContado === 0) continue;
    filas.push(fila);
  }
  const fechas = new Set<string>();
  for (const f of filas) {
    if (fechas.has(f.date)) errores.push(`El día ${f.date} aparece dos veces en '${sheetName}'.`);
    fechas.add(f.date);
  }
  return { mes, filas, errores };
}
