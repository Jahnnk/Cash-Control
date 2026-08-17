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
import { parseSheetMonthYear, currentYearLima } from "./sheet-month";
import { leerSaldoBancoExcel, type SaldoBancoExcel } from "./saldo-banco-excel";

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

/**
 * Warning estructurado emitido por el parser cuando detecta y/o
 * autocorrige errores recurrentes de Kelly. Se persiste en
 * import_batches.warnings_json para auditoría histórica y se muestra
 * en el preview del modal de import.
 *
 * - reason='empty_type'      → Caso A: la celda 'tipo' venía vacía.
 * - reason='type_mismatch'   → Caso B: el tipo I/G no coincide con
 *                              la columna donde estaba el monto.
 * - reason='empty_date'      → Caso C: la fila tenía la celda fecha
 *                              vacía y no había forward-fill posible.
 * - reason='balance_row'     → fila informativa de saldo acumulado
 *                              (ej. "SALDOS EFECTIVO (ENE-MAR)")
 *                              que el parser silencia para no inflar
 *                              ingresos/egresos. Se loggea para
 *                              auditoría histórica.
 * - reason='stale_forward_fill' → la fecha viene por forward-fill
 *                              y está ≥3 días antes del último día
 *                              del mes. Posible registro tardío de
 *                              una fila que debería ser fin de mes.
 *
 * severity='autocorrected'  → la fila se importa con corrección.
 * severity='blocking_error' → la fila NO se importa; el botón
 *                             "Confirmar import" se deshabilita.
 * severity='silenced'       → la fila se descarta a propósito (no
 *                             se importa) y se documenta el motivo.
 * severity='info'           → la fila se importa normalmente, pero
 *                             el usuario debería revisarla antes de
 *                             confirmar. Mensaje accionable.
 */
export type ParseWarning = {
  rowNumber: number;
  date: string | null;
  amount: number;
  column: "ie" | "ic" | "ge" | "gc" | "mixed" | "none";
  description: string;
  reason:
    | "empty_type"
    | "type_mismatch"
    | "empty_date"
    | "balance_row"
    | "stale_forward_fill";
  originalType?: string | null;
  correctedType?: "I" | "G";
  originalDate?: null;
  correctedDate?: string;     // YYYY-MM-DD
  message?: string;           // mensaje accionable para info/silenced
  severity: "autocorrected" | "blocking_error" | "silenced" | "info";
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
  /** Warnings estructurados de los Casos A/B/C (Prompt 18). */
  parseWarnings: ParseWarning[];
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
  /**
   * El saldo REAL del banco que anotó Kelly, buscado por encabezado y
   * por el saldo que lo acompaña (nunca por posición de celda — ver
   * src/lib/saldo-banco-excel.ts). `null` si no lo anotó o si todas las
   * lecturas de la columna eran de meses anteriores: en ese caso vale
   * más no dar dato que dar uno equivocado.
   */
  saldoBancoReal: SaldoBancoExcel | null;
  /** Por qué no se pudo leer, cuando `saldoBancoReal` es null. */
  saldoBancoMotivo: string | null;
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

/**
 * Extrae el mes/año del nombre de una pestaña ("Ing&Gtos Abr26",
 * "Control de VTAS-Abr26", etc.) y devuelve el último día calendario
 * de ese mes en formato YYYY-MM-DD. Maneja años bisiestos correctamente.
 *
 * Acepta abreviaciones de 3 letras case-insensitive:
 *   ENE FEB MAR ABR MAY JUN JUL AGO SET SEP OCT NOV DIC
 *
 * El año es de 2 dígitos y OPCIONAL: si Kelly nombra la pestaña sin año
 * (ej. "Ing&Gtos-JUL" en vez de "Ing&Gtos-JUL26"), se asume el año en
 * curso (hora de Perú) en vez de ignorar la pestaña en silencio.
 *
 * Devuelve null si el patrón no matchea (no se puede deducir el mes).
 */
export function getLastDayOfSheetMonth(sheetName: string): string | null {
  const parsed = parseSheetMonthYear(sheetName, currentYearLima());
  if (!parsed) return null;
  const { month, year } = parsed;
  // new Date(year, month, 0) → día 0 del mes siguiente = último día del mes
  // actual. Maneja bisiestos automáticamente (Feb24 → 29, Feb25 → 28).
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
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

  // Último día del mes según nombre de hoja — fallback de Caso C cuando
  // la fila tiene fecha vacía y no hay forward-fill posible.
  const lastDayOfSheetMonth = getLastDayOfSheetMonth(chosen);

  let saldoInicialEfectivo: number | null = null;
  let saldoInicialBcp: number | null = null;
  let fechaCierre: string | null = null;

  const movimientos: ParsedMovement[] = [];
  const categorias = new Set<string>();
  const distMethod: Record<string, number> = { transferencia: 0, efectivo: 0, yape_plin: 0, pos: 0 };
  const parseWarnings: ParseWarning[] = [];

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

    // ─── DEFENSAS TOLERANTES (Prompt 18, Casos A/B/C) ───
    // Detectar dónde está el monto ANTES de filtrar por tipo, para
    // poder autocorregir filas con tipo vacío o mismatch.
    const hasIncomeAmount = ie > 0 || ic > 0;
    const hasExpenseAmount = ge > 0 || gc > 0;
    const hasAnyAmount = hasIncomeAmount || hasExpenseAmount;
    const hasMixedAmounts = hasIncomeAmount && hasExpenseAmount;
    const description = clean(concepto);

    // Determinar la columna donde está el monto principal (para reporte
    // del warning). Si hay mixto la marcamos 'mixed', si no hay nada 'none'.
    const detectedAmount =
      ie > 0 ? ie : ic > 0 ? ic : ge > 0 ? ge : gc > 0 ? gc : 0;
    const detectedColumn: ParseWarning["column"] =
      hasMixedAmounts ? "mixed" :
      ie > 0 ? "ie" : ic > 0 ? "ic" : ge > 0 ? "ge" : gc > 0 ? "gc" : "none";

    // Detectar filas de saldo acumulado que Kelly registra al cierre
    // de mes (ej. "SALDOS EFECTIVO (ENE-MAR)", "SALDOS CTA CTE (ENE-FEB)").
    // Estas filas tienen descripción real pero NO son movimientos del
    // mes — si las importamos, inflan ingresos. Las silenciamos y
    // dejamos rastro en parseWarnings/warnings_json para auditoría.
    const isBalanceAccumulatorRow = /\bSALDO[S]?\s+(EFECTIVO|CTA|CUENTA|BCP)\b/i.test(description);

    // Filtrar filas no-informativas para no emitir warnings ruidosos
    // sobre filas de saldo, totales acumulados o filas con concepto
    // basura ("N/A", "SC", vacío). Solo aplicamos defensas A/B/C a
    // filas con descripción real Y grupo distinto de "SALDO" Y que
    // no sean acumuladores de saldo previo.
    const isInformativeRow =
      description.length > 0 &&
      !isBasura(description) &&
      grupoRaw.toUpperCase() !== "SALDO" &&
      !isBalanceAccumulatorRow;

    // Si es fila de saldo acumulado con monto detectable, loggear
    // como silenced y descartar (no la procesamos). Esto cierra el
    // hueco de R278/R279 en Centro Abril 2026.
    if (isBalanceAccumulatorRow && hasAnyAmount) {
      parseWarnings.push({
        rowNumber: excelRow,
        date: toDateStr(fechaRaw) ?? ultimaFechaValida ?? lastDayOfSheetMonth,
        amount: detectedAmount,
        column: detectedColumn,
        description,
        reason: "balance_row",
        message:
          "Fila de saldo acumulado de meses anteriores — descartada para no inflar ingresos/egresos del mes actual.",
        severity: "silenced",
      });
      continue;
    }

    // Filtro original: tipo debe ser 'I' o 'G'. Antes era un descarte
    // silencioso; ahora aplicamos Caso A (tipo vacío con autocorrección).
    let normalizedTipo: "I" | "G" | null =
      tipoRaw === "I" ? "I" : tipoRaw === "G" ? "G" : null;

    // Caso A — tipo vacío con monto detectable.
    // Solo aplicamos a filas informativas para no inflar la lista de
    // warnings con saldos / filas de resumen / basura.
    let tipoFueCasoA = false; // se setea si Caso A se disparó (para
                              // posible warning stale_forward_fill abajo).
    if (normalizedTipo === null) {
      if (!hasAnyAmount) continue; // descarte normal: ni tipo ni monto
      if (!isInformativeRow) continue; // saldos / basura → silencioso como antes
      if (hasMixedAmounts) {
        // Bloqueante: imposible deducir intención
        parseWarnings.push({
          rowNumber: excelRow,
          date: toDateStr(fechaRaw) ?? ultimaFechaValida ?? lastDayOfSheetMonth,
          amount: detectedAmount,
          column: "mixed",
          description,
          reason: "empty_type",
          originalType: null,
          severity: "blocking_error",
        });
        continue;
      }
      // Autocorrección: deducir tipo según dónde estuvo el monto
      const corrected: "I" | "G" = hasIncomeAmount ? "I" : "G";
      normalizedTipo = corrected;
      tipoFueCasoA = true;
      parseWarnings.push({
        rowNumber: excelRow,
        date: toDateStr(fechaRaw) ?? ultimaFechaValida ?? lastDayOfSheetMonth,
        amount: detectedAmount,
        column: detectedColumn,
        description,
        reason: "empty_type",
        originalType: null,
        correctedType: corrected,
        severity: "autocorrected",
      });
    }

    // Caso B — tipo declarado pero monto en columna del lado opuesto
    // (sin mixto). El caso `tipo='G' con monto en ie/ic` ya estaba
    // tratado abajo como "devolución legítima"; ahora lo tagueamos
    // también con un warning para auditoría sin cambiar la lógica
    // de devolución.
    // Solo aplicamos warnings a filas informativas para evitar ruido
    // de saldos/basura. Las filas no-informativas mantienen la lógica
    // original (siguen el flujo y son descartadas por amount==0 o por
    // los filtros existentes).
    let isCasoBLegitimate = false; // Caso B autocorregido (no devolución)
    if (isInformativeRow && !hasMixedAmounts && hasAnyAmount) {
      if (normalizedTipo === "I" && hasExpenseAmount && !hasIncomeAmount) {
        parseWarnings.push({
          rowNumber: excelRow,
          date: toDateStr(fechaRaw) ?? ultimaFechaValida ?? lastDayOfSheetMonth,
          amount: detectedAmount,
          column: detectedColumn,
          description,
          reason: "type_mismatch",
          originalType: "I",
          correctedType: "G",
          severity: "autocorrected",
        });
        normalizedTipo = "G";
        isCasoBLegitimate = true;
      } else if (normalizedTipo === "G" && hasIncomeAmount && !hasExpenseAmount) {
        // Esto coincide con la lógica preexistente de "devolución".
        // La conservamos (isRefund=true, prefijo [DEVOLUCION] en nota)
        // pero ahora también emitimos un warning estructurado.
        parseWarnings.push({
          rowNumber: excelRow,
          date: toDateStr(fechaRaw) ?? ultimaFechaValida ?? lastDayOfSheetMonth,
          amount: detectedAmount,
          column: detectedColumn,
          description,
          reason: "type_mismatch",
          originalType: "G",
          correctedType: "I",
          severity: "autocorrected",
        });
      }
    } else if (isInformativeRow && hasMixedAmounts) {
      // tipo presente + montos en ambos lados → ambiguo, bloqueante
      parseWarnings.push({
        rowNumber: excelRow,
        date: toDateStr(fechaRaw) ?? ultimaFechaValida ?? lastDayOfSheetMonth,
        amount: detectedAmount,
        column: "mixed",
        description,
        reason: "type_mismatch",
        originalType: normalizedTipo,
        severity: "blocking_error",
      });
      continue;
    }

    // Forward-fill de fecha (defensa existente). Caso C nuevo cuando
    // ni la fila ni el forward-fill aportan fecha.
    let fecha = toDateStr(fechaRaw);
    let fechaFueForwardFilled = false;
    if (!fecha) {
      if (ultimaFechaValida) {
        fecha = ultimaFechaValida;
        fechaFueForwardFilled = true;
      } else if (hasAnyAmount && description && lastDayOfSheetMonth) {
        // Caso C — fecha vacía + monto + descripción → último día del
        // mes de la pestaña. El propietario confirmó que esos gastos
        // pertenecen al mes anterior cuando Kelly los registra a
        // inicios del siguiente.
        fecha = lastDayOfSheetMonth;
        parseWarnings.push({
          rowNumber: excelRow,
          date: lastDayOfSheetMonth,
          amount: detectedAmount,
          column: detectedColumn,
          description,
          reason: "empty_date",
          originalDate: null,
          correctedDate: lastDayOfSheetMonth,
          severity: "autocorrected",
        });
      } else {
        warnings.push(`Fila ${excelRow}: sin fecha y no hay fecha previa válida — saltada`);
        continue;
      }
    } else {
      ultimaFechaValida = fecha;
    }

    // Warning info de "fwd-fill desfasado": si Caso A se disparó Y la
    // fecha vino por forward-fill (no explícita) Y la fecha está ≥3
    // días antes del último día del mes, es señal de que Kelly pudo
    // haber registrado tarde una fila de cierre de mes y la fecha
    // heredada NO refleja la intención real. Loggeamos sin cambiar
    // la fecha (conservador) para que el usuario revise antes de
    // confirmar el import.
    if (tipoFueCasoA && fechaFueForwardFilled && lastDayOfSheetMonth) {
      const fechaTs = new Date(fecha + "T00:00:00Z").getTime();
      const lastTs = new Date(lastDayOfSheetMonth + "T00:00:00Z").getTime();
      const diffDays = Math.round((lastTs - fechaTs) / (1000 * 60 * 60 * 24));
      if (diffDays >= 3) {
        parseWarnings.push({
          rowNumber: excelRow,
          date: fecha,
          amount: detectedAmount,
          column: detectedColumn,
          description,
          reason: "stale_forward_fill",
          message:
            `La fecha (${fecha}) vino del forward-fill y está ${diffDays} días antes del último día del mes (${lastDayOfSheetMonth}). ` +
            "Si esta fila pertenece al cierre del mes, edítala en el Excel poniendo la fecha correcta (recomendado el último día del mes) antes de confirmar.",
          severity: "info",
        });
      }
    }

    // Detección de devoluciones: tipo='G' pero monto en columnas de ingreso
    // (efectivo/cuenta). Mantiene el comportamiento histórico —
    // detectado independientemente del Caso B para preservar el
    // tagging [DEVOLUCION] en la nota.
    let isRefund = false;
    let effectiveType: "income" | "expense" = normalizedTipo === "I" ? "income" : "expense";
    if (normalizedTipo === "G" && hasIncomeAmount && !hasExpenseAmount) {
      isRefund = true;
      effectiveType = "income";
    }
    // Si Caso B ya re-tipó normalizedTipo a su lado correcto, effectiveType
    // ya lo refleja arriba (income si I, expense si G), y no marcamos
    // refund — es un caso B "limpio" (Kelly se equivocó), no un refund.
    void isCasoBLegitimate;

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

  // El saldo REAL del banco que anotó Kelly. Pasada aparte y 100% por
  // encabezado: el resto de este parser lee por posición fija y no se
  // toca para no romper lo que ya funciona.
  const lectura = leerSaldoBancoExcel(rows);
  if (!lectura.ok) {
    warnings.push(`Saldo del banco: ${lectura.motivo}`);
  } else if (lectura.saldo.lecturasEncontradas > 1) {
    warnings.push(
      `La columna del banco tenía ${lectura.saldo.lecturasEncontradas} lecturas; se tomó la de la fila ${lectura.saldo.fila} (S/${lectura.saldo.valor.toFixed(2)}), que es la que acompaña al saldo final del libro.`,
    );
  }

  return {
    saldoInicial: {
      efectivo: saldoInicialEfectivo,
      bcp: saldoInicialBcp,
      fechaCierre,
    },
    movimientos,
    errores,
    warnings,
    parseWarnings,
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
    saldoBancoReal: lectura.ok ? lectura.saldo : null,
    saldoBancoMotivo: lectura.ok ? null : lectura.motivo,
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
    parseWarnings: [],
    rangoFechas: { start: null, end: null },
    categoriasUnicas: [],
    totales: {
      ingresosEfectivo: 0, ingresosBcp: 0,
      egresosEfectivo: 0, egresosBcp: 0,
      saldoFinalEfectivo: 0, saldoFinalBcp: 0,
    },
    distribucionPaymentMethod: { transferencia: 0, efectivo: 0, yape_plin: 0, pos: 0 },
    saldoBancoReal: null, saldoBancoMotivo: null,
    ingresos: 0, egresos: 0, devoluciones: 0, ventasByte: 0,
  };
}
