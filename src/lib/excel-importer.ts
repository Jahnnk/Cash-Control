/**
 * Parser puro del Excel "Ing&Gtos [Mes][Año]" de Kelly.
 * Sin side-effects: recibe un Buffer, devuelve un ParseResult.
 *
 * Reglas validadas con Excel real (FONAVI Abril 2026):
 *   1. Detecta saldo inicial buscando Grupo='SALDO' y Concepto 'Saldo al ...'
 *   2. Forward-fill de fechas (Kelly deja vacío en mismo día)
 *   3. Solo procesa filas con tipo 'I' o 'G' (case-insensitive)
 *   4. Detecta devoluciones: tipo='G' pero monto en columnas de ingreso
 *   5. Ignora montos S/0 y filas sin importes
 *   6. Infiere payment_method del concepto (YAPE/PLIN, POS, transferencia)
 *   7. Marca is_byte_sale cuando Grupo='Ventas'
 *   8. Construye nota legible filtrando basura
 *
 * Validación matemática (FONAVI Abril 2026):
 *   - 276 movimientos, 125 ingresos + 151 egresos, 1 devolución, 119 byte
 *   - Saldos finales: Efectivo S/2,092.31, BCP S/4,228.77
 */

import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────

export type ParsedMovement = {
  excelRow: number;
  date: string;                            // YYYY-MM-DD
  type: "income" | "expense";
  category: string;
  paymentMethod: "efectivo" | "transferencia" | "yape_plin" | "pos";
  destination: "cash" | "bank";
  amount: number;
  isByteSale: boolean;
  isRefund: boolean;
  note: string;
};

export type ParseResult = {
  saldoInicial: {
    efectivo: number | null;
    bcp: number | null;
    fechaCierre: string | null;            // YYYY-MM-DD
  };
  movimientos: ParsedMovement[];
  errores: string[];
  warnings: string[];
  rangoFechas: { start: string | null; end: string | null };
  categoriasUnicas: string[];
  totales: {
    ingresosEfectivo: number;
    ingresosBcp: number;
    egresosEfectivo: number;
    egresosBcp: number;
    saldoFinalEfectivo: number;
    saldoFinalBcp: number;
  };
  distribucionPaymentMethod: Record<string, number>;
  ingresos: number;
  egresos: number;
  devoluciones: number;
  ventasByte: number;
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const BASURA = ["", "N/A", "NA", "SC", "falta", "falta factura"];
const BASURA_LOWER = BASURA.map((s) => s.toLowerCase());
const PROV_FILTERED_LOWER = [...BASURA_LOWER, "efectivo", "bcp"];

function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function isBasura(v: string): boolean {
  return BASURA_LOWER.includes(v.toLowerCase());
}

function isProvBasura(v: string): boolean {
  return PROV_FILTERED_LOWER.includes(v.toLowerCase());
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Convierte un valor de fecha del Excel (puede ser Date, número serial
 * o string) a YYYY-MM-DD. Retorna null si no es interpretable.
 */
function toDateStr(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Use UTC components to avoid TZ shifts (xlsx parses as UTC midnight)
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    // Excel serial date — XLSX provides SSF. Use SSF.parse_date_code.
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) {
      const y = parsed.y;
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  if (typeof v === "string" && v.trim()) {
    // ISO o YYYY-MM-DD
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // dd/mm/yyyy o dd-mm-yyyy
    const m2 = v.trim().match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
    if (m2) {
      let yy = m2[3];
      if (yy.length === 2) yy = "20" + yy;
      return `${yy}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
    }
  }
  return null;
}

function buildNote(prov: string, conc: string, cp: string, ncp: string): string {
  const partes: string[] = [];
  if (conc && !isBasura(conc)) partes.push(conc);
  if (prov && !isProvBasura(prov)) partes.push(`(${prov})`);
  if (cp && !isBasura(cp)) {
    if (ncp && !isBasura(ncp)) partes.push(`[${cp} ${ncp}]`);
    else partes.push(`[${cp}]`);
  }
  return partes.join(" ") || "Sin descripción";
}

function inferIncomePaymentMethod(concepto: string): "yape_plin" | "pos" | "transferencia" {
  const c = concepto.toUpperCase();
  if (c.includes("YAPE") || c.includes("PLIN")) return "yape_plin";
  if (c.includes("POS")) return "pos";
  return "transferencia";
}

// ─────────────────────────────────────────────────────────────────
// Sheet listing
// ─────────────────────────────────────────────────────────────────

export function listSheets(buffer: Buffer | ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return wb.SheetNames.filter((n) => /^Ing&Gtos/i.test(n.replace(/\s+/g, "")) || /Ing.?&.?Gtos/i.test(n));
}

export function listAllSheets(buffer: Buffer | ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return wb.SheetNames;
}

// ─────────────────────────────────────────────────────────────────
// Parser principal
// ─────────────────────────────────────────────────────────────────

export function parseExcelFile(
  buffer: Buffer | ArrayBuffer,
  sheetName?: string
): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const errores: string[] = [];
  const warnings: string[] = [];

  // Elegir hoja
  let chosen = sheetName;
  if (!chosen) {
    const candidates = listSheets(buffer);
    if (candidates.length === 0) {
      errores.push("No se encontró ninguna pestaña 'Ing&Gtos' en el archivo.");
      chosen = wb.SheetNames[0];
    } else {
      chosen = candidates[candidates.length - 1]; // última (más reciente)
    }
  }
  if (!chosen || !wb.Sheets[chosen]) {
    errores.push(`Hoja '${chosen}' no encontrada.`);
    return emptyResult(errores, warnings);
  }

  const ws = wb.Sheets[chosen];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];

  let saldoInicialEfectivo: number | null = null;
  let saldoInicialBcp: number | null = null;
  let fechaCierre: string | null = null;

  const movimientos: ParsedMovement[] = [];
  const categorias = new Set<string>();
  const distMethod: Record<string, number> = { transferencia: 0, efectivo: 0, yape_plin: 0, pos: 0 };

  let ultimaFechaValida: string | null = null;
  let ingresos = 0, egresos = 0, devoluciones = 0, ventasByte = 0;
  let inEfectivo = 0, inBcp = 0, exEfectivo = 0, exBcp = 0;

  // Filas 1-3 son headers (índices 0-2). Procesamos desde índice 3.
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i] || [];
    const excelRow = i + 1;

    const fechaRaw = row[0];
    const tipoRaw = clean(row[1]).toUpperCase();
    const grupoRaw = clean(row[2]);
    const proveedor = clean(row[3]);
    const concepto = clean(row[5]);
    const cp = clean(row[6]);
    const ncp = clean(row[7]);
    const ie = toNumber(row[8]);
    const ic = toNumber(row[9]);
    const ge = toNumber(row[10]);
    const gc = toNumber(row[11]);

    // Detección de saldo inicial: Grupo='SALDO' y Concepto contiene 'Saldo al'
    if (grupoRaw.toUpperCase() === "SALDO" && /saldo\s+al/i.test(concepto)) {
      if (saldoInicialEfectivo === null) saldoInicialEfectivo = ie || 0;
      if (saldoInicialBcp === null) saldoInicialBcp = ic || 0;
      // Fecha de cierre: extraer del concepto "Saldo al [fecha]"
      const m = concepto.match(/saldo\s+al\s+([\d/.\-]+)/i);
      if (m) fechaCierre = toDateStr(m[1]);
      // Si no se encontró en el texto, usar la fecha de la fila si la hay
      if (!fechaCierre) {
        const fd = toDateStr(fechaRaw);
        if (fd) fechaCierre = fd;
      }
      continue;
    }

    // Filtro: tipo debe ser 'I' o 'G'
    if (tipoRaw !== "I" && tipoRaw !== "G") continue;

    // Forward-fill de fecha
    let fecha = toDateStr(fechaRaw);
    if (!fecha) {
      if (ultimaFechaValida) fecha = ultimaFechaValida;
      else {
        warnings.push(`Fila ${excelRow}: sin fecha y no hay fecha previa válida — saltada`);
        continue;
      }
    } else {
      ultimaFechaValida = fecha;
    }

    // Detección de devoluciones: tipo='G' pero monto en columnas de ingreso
    let isRefund = false;
    let effectiveType: "income" | "expense" = tipoRaw === "I" ? "income" : "expense";
    if (tipoRaw === "G" && (ie > 0 || ic > 0) && !(ge > 0) && !(gc > 0)) {
      isRefund = true;
      effectiveType = "income";
    }

    // Determinar monto y dirección
    let amount = 0;
    let paymentMethod: ParsedMovement["paymentMethod"] = "transferencia";
    let destination: "cash" | "bank" = "bank";

    if (effectiveType === "income") {
      if (ie > 0) {
        amount = ie;
        paymentMethod = "efectivo";
        destination = "cash";
      } else if (ic > 0) {
        amount = ic;
        paymentMethod = inferIncomePaymentMethod(concepto);
        destination = "bank";
      }
    } else {
      if (ge > 0) {
        amount = ge;
        paymentMethod = "efectivo";
        destination = "cash";
      } else if (gc > 0) {
        amount = gc;
        paymentMethod = "transferencia";
        destination = "bank";
      }
    }

    // Saltar si el monto es 0 o no se determinó (turnos sin venta, etc.)
    if (!(amount > 0)) continue;

    // Construir nota
    let note = buildNote(proveedor, concepto, cp, ncp);
    if (isRefund) note = `[DEVOLUCION] ${note}`;

    const cat = grupoRaw || "Sin categoría";
    categorias.add(cat);

    const isByteSale = grupoRaw.toUpperCase() === "VENTAS";

    movimientos.push({
      excelRow,
      date: fecha,
      type: effectiveType,
      category: cat,
      paymentMethod,
      destination,
      amount: Math.round(amount * 100) / 100,
      isByteSale,
      isRefund,
      note,
    });

    // Stats
    distMethod[paymentMethod] = (distMethod[paymentMethod] ?? 0) + 1;
    if (effectiveType === "income") {
      ingresos++;
      if (isByteSale) ventasByte++;
      if (isRefund) devoluciones++;
      if (destination === "cash") inEfectivo += amount;
      else inBcp += amount;
    } else {
      egresos++;
      if (destination === "cash") exEfectivo += amount;
      else exBcp += amount;
    }
  }

  // Totales y rango
  const dates = movimientos.map((m) => m.date).sort();
  const start = dates[0] ?? null;
  const end = dates[dates.length - 1] ?? null;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const inEfR = r2(inEfectivo);
  const inBcR = r2(inBcp);
  const exEfR = r2(exEfectivo);
  const exBcR = r2(exBcp);
  const saldoFinalEfectivo = r2((saldoInicialEfectivo ?? 0) + inEfR - exEfR);
  const saldoFinalBcp = r2((saldoInicialBcp ?? 0) + inBcR - exBcR);

  return {
    saldoInicial: {
      efectivo: saldoInicialEfectivo,
      bcp: saldoInicialBcp,
      fechaCierre,
    },
    movimientos,
    errores,
    warnings,
    rangoFechas: { start, end },
    categoriasUnicas: Array.from(categorias).sort(),
    totales: {
      ingresosEfectivo: inEfR,
      ingresosBcp: inBcR,
      egresosEfectivo: exEfR,
      egresosBcp: exBcR,
      saldoFinalEfectivo,
      saldoFinalBcp,
    },
    distribucionPaymentMethod: distMethod,
    ingresos,
    egresos,
    devoluciones,
    ventasByte,
  };
}

function emptyResult(errores: string[], warnings: string[]): ParseResult {
  return {
    saldoInicial: { efectivo: null, bcp: null, fechaCierre: null },
    movimientos: [],
    errores,
    warnings,
    rangoFechas: { start: null, end: null },
    categoriasUnicas: [],
    totales: {
      ingresosEfectivo: 0, ingresosBcp: 0,
      egresosEfectivo: 0, egresosBcp: 0,
      saldoFinalEfectivo: 0, saldoFinalBcp: 0,
    },
    distribucionPaymentMethod: { transferencia: 0, efectivo: 0, yape_plin: 0, pos: 0 },
    ingresos: 0, egresos: 0, devoluciones: 0, ventasByte: 0,
  };
}
