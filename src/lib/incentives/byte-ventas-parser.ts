/**
 * Parser del reporte "Ventas de <MES> <AÑO>" de Byte.
 *
 * Formato real (jul-2026):
 *   fila 0: ["Ventas de JULIO 2026"]                       ← título
 *   fila 1: ["Día", "# Pedidos", "Descuentos (S/)", "Total Vendido (S/)"]
 *   filas:  ["2026-07-01", 49, 8.9, 1508.82]
 *   última: [null, 688, 79.8, 18809.81]                    ← totales (sin fecha)
 *
 * Reglas del repo: columnas detectadas por HEADER, nunca por posición
 * (el !ref de Excel cambia si la columna A viene vacía). La fila de
 * totales se reconoce porque no tiene fecha — se usa para VERIFICAR la
 * suma, no se importa.
 */

export type ParsedVentaDay = {
  date: string;      // YYYY-MM-DD
  pedidos: number;
  descuentos: number;
  total: number;
};

export type VentasParseResult = {
  days: ParsedVentaDay[];
  periodStart: string | null;
  periodEnd: string | null;
  errores: string[];
  warnings: string[];
};

/** Fecha de celda → YYYY-MM-DD. Acepta ISO, dd/mm/yyyy y Date de xlsx. */
function toDay(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const lat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v.trim());
    if (lat) return `${lat[3]}-${lat[2].padStart(2, "0")}-${lat[1].padStart(2, "0")}`;
  }
  return null;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function parseVentasReport(rows: unknown[][]): VentasParseResult {
  const errores: string[] = [];
  const warnings: string[] = [];

  // Header por contenido, no por posición (puede haber título encima).
  let headerIdx = -1;
  let cDia = -1, cPedidos = -1, cTotal = -1, cDesc = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] ?? [];
    const find = (re: RegExp) => row.findIndex((c) => typeof c === "string" && re.test(c));
    const dia = find(/^\s*(d[ií]a|fecha)\s*$/i);
    const ped = find(/pedidos/i);
    const tot = find(/total\s*vendido/i);
    if (dia !== -1 && ped !== -1 && tot !== -1) {
      headerIdx = i; cDia = dia; cPedidos = ped; cTotal = tot;
      cDesc = find(/descuento/i);
      break;
    }
  }
  console.log(`[byte-ventas-parser] headerIdx=${headerIdx} cDia=${cDia} cPedidos=${cPedidos} cTotal=${cTotal} rows=${rows.length}`);
  if (headerIdx === -1) {
    errores.push("No encontré las columnas 'Día', '# Pedidos' y 'Total Vendido'. ¿Es el reporte de Ventas de Byte?");
    return { days: [], periodStart: null, periodEnd: null, errores, warnings };
  }

  const days: ParsedVentaDay[] = [];
  const seen = new Set<string>();
  let totalsRow: { pedidos: number; total: number } | null = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const date = toDay(row[cDia]);
    if (!date) {
      // Fila sin fecha con montos = la fila de TOTALES del reporte.
      const t = toNum(row[cTotal]);
      if (t > 0) totalsRow = { pedidos: toNum(row[cPedidos]), total: t };
      continue;
    }
    if (seen.has(date)) {
      warnings.push(`Fecha repetida en el archivo: ${date} — me quedo con la primera.`);
      continue;
    }
    seen.add(date);
    const pedidos = Math.round(toNum(row[cPedidos]));
    const total = toNum(row[cTotal]);
    if (total < 0 || pedidos < 0) {
      warnings.push(`${date}: valores negativos — fila ignorada.`);
      continue;
    }
    days.push({
      date,
      pedidos,
      descuentos: cDesc !== -1 ? toNum(row[cDesc]) : 0,
      total: Math.round(total * 100) / 100,
    });
  }

  if (days.length === 0) {
    errores.push("El archivo no trae ningún día con fecha y venta.");
    return { days: [], periodStart: null, periodEnd: null, errores, warnings };
  }

  // La fila de totales de Byte es el checksum del import: si no cuadra,
  // algo se leyó mal y es mejor avisar que importar en silencio.
  if (totalsRow) {
    const suma = Math.round(days.reduce((a, d) => a + d.total, 0) * 100) / 100;
    if (Math.abs(suma - totalsRow.total) > 0.01) {
      warnings.push(
        `La suma de los días (S/${suma.toFixed(2)}) no cuadra con el total del reporte (S/${totalsRow.total.toFixed(2)}). Revisa el archivo.`,
      );
    }
  }

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return {
    days: sorted,
    periodStart: sorted[0].date,
    periodEnd: sorted[sorted.length - 1].date,
    errores,
    warnings,
  };
}
