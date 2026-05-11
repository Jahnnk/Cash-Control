/**
 * Parser de la pestaña 'Control de VTAS-(mes)' del Excel de Kelly.
 *
 * Estructura: 6 filas por día.
 *   Fila 1 (encabezado del día): col B = fecha, col C = día semana.
 *   Filas 2-5: detalles por método.
 *     col D = concepto QuipuPOS, col E = monto QuipuPOS
 *     col F = concepto Cuentas, col G = monto Cuentas
 *     col H = diferencia, col J = nota
 *   Fila 6: subtotal "Total" (se ignora).
 *
 * 3 capas extraídas:
 *   1. byte_sales_daily: agregado Efectivo + Yape + POS (col G).
 *   2. tips_pending: diferencias con nota "PROPINA" + todas las
 *      "Ventas al Crédito".
 *   3. rounding_alerts: diferencias != 0 sin "PROPINA" en la nota.
 */

import * as XLSX from "xlsx";

export type ByteSalesDaily = {
  date: string;            // YYYY-MM-DD
  efectivo: number;        // lado Cuentas col G (lo que entró a caja/banco)
  yape_plin: number;       // lado Cuentas col G
  pos: number;             // lado Cuentas col G
  total: number;           // computed = ef + yp + pos (sin crédito, lado Cuentas)
  /**
   * Suma de los montos lado QuipuPOS (col E) del día, incluyendo
   * la fila de Ventas al Crédito. Permite mostrar el "Total
   * reportado por POS" del Excel (E194) y el desglose de Ajustes
   * = total_pos_excel - total - crédito.
   */
  total_pos_excel: number;
};

export type TipPending = {
  date: string;
  amount: number;
  source_concept: "Yape" | "POS" | "Ventas al Crédito";
  note_text: string;
  collaborator_name: string | null;
};

export type RoundingAlert = {
  date: string;
  payment_method: "yape_plin" | "pos";
  amount_quipupos: number;
  amount_cuentas: number;
  difference: number;
  note_text: string;
};

export type ControlVtasParseResult = {
  ventasDiarias: ByteSalesDaily[];
  propinas: TipPending[];
  alertasRedondeo: RoundingAlert[];
  errores: string[];
  warnings: string[];
  rangoFechas: { start: string | null; end: string | null };
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function toDateStr(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
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

function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

export function listControlVtasSheets(buffer: Buffer | ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  // Patrón: "Control de VTAS-MAR26" o "Control de VTAS Abr26" — admite
  // - o espacio entre VTAS y mes-año.
  return wb.SheetNames.filter((n) => /^control\s*de\s*vtas[\s\-]?[A-Za-z]{3}\d{2}$/i.test(n));
}

/**
 * Extrae mes/año del nombre de la hoja "Control de VTAS-ABR26".
 * Devuelve null si el patrón no matchea.
 *
 * Crítico para evitar que filas posteriores al último día (totales
 * generales del mes con etiquetas "Efectivo"/"Yape"/"POS") sean
 * forward-filled a una fecha del mes y sobrescriban valores reales.
 * Ver bug: SUMMARY-V2 abril 2026 tenía "31/04/2026" inválido en col B
 * → forward-fill mantenía 2026-04-30 → totales del mes (S/36,986.40)
 * sobrescribían día 30 real (S/1,533.70) → mes inflado al doble.
 */
function parseSheetMonth(sheetName: string): { year: number; month: number } | null {
  const m = sheetName.match(/Control\s*de\s*VTAS[\s\-]?([A-Za-z]{3})(\d{2})/i);
  if (!m) return null;
  const monthMap: Record<string, number> = {
    ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
    JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
  };
  const month = monthMap[m[1].toUpperCase()];
  if (!month) return null;
  const year = 2000 + parseInt(m[2], 10);
  return { year, month };
}

export function parseControlVtas(
  buffer: Buffer | ArrayBuffer,
  sheetName: string
): ControlVtasParseResult {
  const errores: string[] = [];
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    errores.push(`Hoja '${sheetName}' no encontrada.`);
    return emptyResult(errores, warnings);
  }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];

  // Detección dinámica de la columna "Fecha" en el header (fila 0).
  // CRÍTICO: el rango !ref del Excel cambia según si la columna A
  // tiene datos o no. En Fonavi !ref=B1:L211 → idx 0 del array = col B.
  // En Centro !ref=A1:L211 → idx 0 = col A (vacía). Sin esta detección,
  // el parser asumía idx 0 = Fecha y producía 0 días silenciosamente
  // para Centro. Ver AGENTS.md "Parsers de Excel".
  const headerRow = rows[0] ?? [];
  let dateColIdx = -1;
  for (let c = 0; c < headerRow.length; c++) {
    const cell = headerRow[c];
    if (typeof cell === "string" && /^\s*fecha\s*$/i.test(cell)) {
      dateColIdx = c;
      break;
    }
  }
  // Log de auditoría — visible en logs de Vercel para debug post-import.
  console.log(
    `[control-vtas-parser] sheetName="${sheetName}" dateColIdx=${dateColIdx} headerRow.length=${headerRow.length}`,
  );
  if (dateColIdx === -1) {
    errores.push(
      `No encontré columna 'Fecha' en el header de '${sheetName}'. Headers leídos: [${headerRow.map((h) => (h === null || h === undefined ? "—" : `"${String(h).slice(0, 20)}"`)).join(", ")}]`,
    );
    return emptyResult(errores, warnings);
  }

  // Offsets relativos a la columna "Fecha". Layout esperado tras el
  // header "Fecha":
  //   +0 Fecha (solo en primera fila del día)
  //   +1 Día de la semana
  //   +2 Concepto QuipuPOS
  //   +3 Monto QuipuPOS
  //   +4 Concepto Cuentas    ← el que importamos
  //   +5 Monto Cuentas       ← el que importamos
  //   +6 Diferencia (Comparativo)
  //   +7 Referencia "(1)" "(2)" ...
  //   +8 Nota descriptiva
  const idxFecha = dateColIdx;
  const idxConceptoQuipu = dateColIdx + 2;
  const idxMontoQuipu = dateColIdx + 3;
  const idxConceptoCuentas = dateColIdx + 4;
  const idxMontoCuentas = dateColIdx + 5;
  const idxDiferencia = dateColIdx + 6;
  const idxNota = dateColIdx + 8;

  // Mes/año esperado según el nombre de la hoja. Filas con fechas
  // fuera de este mes son ruido (totales generales, validaciones,
  // huérfanos arrastrados de otros meses) y se descartan.
  const sheetMonth = parseSheetMonth(sheetName);
  if (!sheetMonth) {
    warnings.push(
      `No pude extraer mes/año del nombre de hoja '${sheetName}'. Procesando sin validación de mes (riesgoso).`,
    );
  }

  const ventasPorDia = new Map<string, ByteSalesDaily>();
  const propinas: TipPending[] = [];
  const alertas: RoundingAlert[] = [];

  let ultimaFecha: string | null = null;
  let emptyRowStreak = 0;

  // Header en fila 0. Datos desde fila 1.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];

    // Detección de fila vacía: ninguna celda relevante tiene contenido.
    // 2+ vacías seguidas → cortar el parseo (fin de la sección de
    // datos, lo siguiente son totales del mes / validaciones).
    const filaVacia =
      row[idxFecha] == null && row[idxConceptoQuipu] == null && row[idxMontoQuipu] == null &&
      row[idxConceptoCuentas] == null && row[idxMontoCuentas] == null;
    if (filaVacia) {
      emptyRowStreak++;
      if (emptyRowStreak >= 2) {
        // Reset de fecha — cualquier fila siguiente sin fecha propia
        // se descarta en lugar de heredar. Y break definitivo.
        ultimaFecha = null;
        break;
      }
      continue;
    }
    emptyRowStreak = 0;

    // Forward-fill fecha. Si la celda contiene una fecha INVÁLIDA
    // (ej. "31/04/2026" — abril no tiene 31 días), la descartamos y
    // NO heredamos la última fecha vista, para que las filas
    // siguientes (totales del mes o ruido) no se asignen al último
    // día real del mes.
    const fechaRaw = row[idxFecha];
    let fecha = toDateStr(fechaRaw);
    const fechaCellHasContent = fechaRaw != null && String(fechaRaw).trim() !== "";
    if (!fecha) {
      if (fechaCellHasContent) {
        // Hay algo en la celda fecha pero no parsea → fecha basura.
        // Romper forward-fill para que no contamine días reales.
        ultimaFecha = null;
        continue;
      }
      if (ultimaFecha) fecha = ultimaFecha;
      else continue;
    } else {
      // Validar que la fecha caiga dentro del mes esperado por el
      // nombre de la hoja. Cualquier cosa fuera es ruido.
      if (sheetMonth) {
        const [fy, fm] = fecha.split("-").map(Number);
        if (fy !== sheetMonth.year || fm !== sheetMonth.month) {
          ultimaFecha = null;
          continue;
        }
      }
      ultimaFecha = fecha;
    }

    const conceptoCuentas = clean(row[idxConceptoCuentas]);
    const montoQuipupos = toNum(row[idxMontoQuipu]);
    const montoCuentas = toNum(row[idxMontoCuentas]);
    const diferencia = toNum(row[idxDiferencia]);
    const nota = clean(row[idxNota]);

    if (!conceptoCuentas) continue;
    if (conceptoCuentas === "Total") continue;

    const upperNote = nota.toUpperCase();
    const esPropina = upperNote.includes("PROPINA");

    // Inicializar bucket del día si no existe
    if (!ventasPorDia.has(fecha)) {
      ventasPorDia.set(fecha, {
        date: fecha,
        efectivo: 0, yape_plin: 0, pos: 0,
        total: 0,
        total_pos_excel: 0,
      });
    }
    const ventaDia = ventasPorDia.get(fecha)!;

    // Acumulamos el lado QuipuPOS (col E) para todas las categorías del
    // día (Efectivo, Yape, POS, Ventas al Crédito). Esto reproduce E194
    // del Excel: el total que el sistema POS reporta vendido.
    if (montoQuipupos > 0) {
      ventaDia.total_pos_excel += montoQuipupos;
    }

    if (conceptoCuentas === "Efectivo") {
      if (montoCuentas > 0) ventaDia.efectivo = montoCuentas;
      // Diferencias en efectivo son raras; si hay y nota='PROPINA', la registramos
      if (diferencia !== 0 && esPropina) {
        propinas.push({
          date: fecha, amount: Math.abs(diferencia),
          source_concept: "Yape", note_text: nota, collaborator_name: null,
        });
      }
    } else if (conceptoCuentas === "Yape") {
      if (montoCuentas > 0) ventaDia.yape_plin = montoCuentas;
      if (diferencia !== 0) {
        if (esPropina) {
          propinas.push({
            date: fecha, amount: Math.abs(diferencia),
            source_concept: "Yape", note_text: nota, collaborator_name: null,
          });
        } else {
          alertas.push({
            date: fecha, payment_method: "yape_plin",
            amount_quipupos: montoQuipupos, amount_cuentas: montoCuentas,
            difference: diferencia, note_text: nota,
          });
        }
      }
    } else if (conceptoCuentas === "POS") {
      if (montoCuentas > 0) ventaDia.pos = montoCuentas;
      if (diferencia !== 0) {
        if (esPropina) {
          propinas.push({
            date: fecha, amount: Math.abs(diferencia),
            source_concept: "POS", note_text: nota, collaborator_name: null,
          });
        } else {
          alertas.push({
            date: fecha, payment_method: "pos",
            amount_quipupos: montoQuipupos, amount_cuentas: montoCuentas,
            difference: diferencia, note_text: nota,
          });
        }
      }
    } else if (conceptoCuentas === "Ventas al Crédito" || conceptoCuentas === "Ventas al Credito") {
      // Confirmado por usuario: TODAS son propinas
      if (montoCuentas > 0) {
        propinas.push({
          date: fecha, amount: montoCuentas,
          source_concept: "Ventas al Crédito", note_text: nota, collaborator_name: null,
        });
      }
    }
    // Otros conceptos: ignorar silenciosamente
  }

  // Computar total y ordenar por fecha
  const ventasDiarias = Array.from(ventasPorDia.values())
    .map((v) => ({
      ...v,
      total: Math.round((v.efectivo + v.yape_plin + v.pos) * 100) / 100,
      total_pos_excel: Math.round(v.total_pos_excel * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const start = ventasDiarias[0]?.date ?? null;
  const end = ventasDiarias[ventasDiarias.length - 1]?.date ?? null;

  return {
    ventasDiarias,
    propinas,
    alertasRedondeo: alertas,
    errores,
    warnings,
    rangoFechas: { start, end },
  };
}

function emptyResult(errores: string[], warnings: string[]): ControlVtasParseResult {
  return {
    ventasDiarias: [],
    propinas: [],
    alertasRedondeo: [],
    errores,
    warnings,
    rangoFechas: { start: null, end: null },
  };
}
