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
  efectivo: number;
  yape_plin: number;
  pos: number;
  total: number;           // computed
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

  const ventasPorDia = new Map<string, ByteSalesDaily>();
  const propinas: TipPending[] = [];
  const alertas: RoundingAlert[] = [];

  let ultimaFecha: string | null = null;

  // Header en fila 0 (índice 0). Datos desde índice 1.
  // Mapeo de columnas (verificado contra Excel real):
  //   idx 0 = Fecha (solo en primera fila del día)
  //   idx 1 = Día de la semana
  //   idx 2 = Concepto QuipuPOS
  //   idx 3 = Monto QuipuPOS
  //   idx 4 = Concepto Cuentas    ← el que importamos
  //   idx 5 = Monto Cuentas       ← el que importamos
  //   idx 6 = Diferencia (Comparativo)
  //   idx 7 = Referencia "(1)" "(2)" ...
  //   idx 8 = Nota descriptiva
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];

    // Forward-fill fecha (idx 0)
    const fechaRaw = row[0];
    let fecha = toDateStr(fechaRaw);
    if (!fecha) {
      if (ultimaFecha) fecha = ultimaFecha;
      else continue;
    } else {
      ultimaFecha = fecha;
    }

    const conceptoCuentas = clean(row[4]);
    const montoQuipupos = toNum(row[3]);
    const montoCuentas = toNum(row[5]);
    const diferencia = toNum(row[6]);
    const nota = clean(row[8]);

    if (!conceptoCuentas) continue;
    if (conceptoCuentas === "Total") continue;

    const upperNote = nota.toUpperCase();
    const esPropina = upperNote.includes("PROPINA");

    // Inicializar bucket del día si no existe
    if (!ventasPorDia.has(fecha)) {
      ventasPorDia.set(fecha, { date: fecha, efectivo: 0, yape_plin: 0, pos: 0, total: 0 });
    }
    const ventaDia = ventasPorDia.get(fecha)!;

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
    .map((v) => ({ ...v, total: Math.round((v.efectivo + v.yape_plin + v.pos) * 100) / 100 }))
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
