/**
 * Tests unitarios del Prompt 18 — Defensas tolerantes en parser de
 * Ing&Gtos (Casos A/B/C + getLastDayOfSheetMonth).
 *
 * No usa framework de testing — assertions directos. Falla con
 * exit 1 ante el primer fallo. Útil para correr en pre-commit
 * o como smoke check post-deploy.
 *
 * Uso: npx tsx scripts/audit/test-parser-defenses.ts
 */
import * as XLSX from "xlsx";
import {
  getLastDayOfSheetMonth,
  parseExcelFile,
  type ParsedMovement,
  type ParseWarning,
} from "../../src/lib/excel-importer";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.error(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 1. getLastDayOfSheetMonth
// ═══════════════════════════════════════════════════════════════════
console.log("\n═══ getLastDayOfSheetMonth ═══");

assert(
  "Abr26 → 2026-04-30",
  getLastDayOfSheetMonth("Control de VTAS-Abr26") === "2026-04-30",
  String(getLastDayOfSheetMonth("Control de VTAS-Abr26")),
);
assert(
  "Feb24 → 2024-02-29 (bisiesto)",
  getLastDayOfSheetMonth("Control de VTAS-Feb24") === "2024-02-29",
  String(getLastDayOfSheetMonth("Control de VTAS-Feb24")),
);
assert(
  "Feb25 → 2025-02-28 (no bisiesto)",
  getLastDayOfSheetMonth("Control de VTAS-Feb25") === "2025-02-28",
);
assert(
  "Set26 → 2026-09-30 (variante peruana)",
  getLastDayOfSheetMonth("Control de VTAS-Set26") === "2026-09-30",
);
assert(
  "Sep26 → 2026-09-30 (variante neutra)",
  getLastDayOfSheetMonth("Control de VTAS-Sep26") === "2026-09-30",
);
assert(
  "Ing&Gtos Abr26 → 2026-04-30 (sin guión)",
  getLastDayOfSheetMonth("Ing&Gtos Abr26") === "2026-04-30",
);
assert(
  "Ene26 → 2026-01-31",
  getLastDayOfSheetMonth("Ing&Gtos Ene26") === "2026-01-31",
);
assert(
  "Dic26 → 2026-12-31",
  getLastDayOfSheetMonth("Ing&Gtos Dic26") === "2026-12-31",
);
assert(
  "Jun26 → 2026-06-30 (mes de 30)",
  getLastDayOfSheetMonth("Ing&Gtos Jun26") === "2026-06-30",
);
assert(
  "Feb00 → 2000-02-29 (siglo bisiesto)",
  getLastDayOfSheetMonth("Ing&Gtos Feb00") === "2000-02-29",
);
assert(
  "Texto sin patrón → null",
  getLastDayOfSheetMonth("hoja sin mes") === null,
);
assert(
  "Mes inválido → null",
  getLastDayOfSheetMonth("Ing&Gtos Xxx26") === null,
);
assert(
  "Case insensitive (abr26)",
  getLastDayOfSheetMonth("Ing&Gtos abr26") === "2026-04-30",
);
assert(
  "Case insensitive (ABR26)",
  getLastDayOfSheetMonth("Ing&Gtos ABR26") === "2026-04-30",
);

// ═══════════════════════════════════════════════════════════════════
// 2. parseExcelFile — sintetizamos un Excel en memoria para probar
//    cada caso de forma controlada.
// ═══════════════════════════════════════════════════════════════════
console.log("\n═══ parseExcelFile defensas A/B/C ═══");

/**
 * Construye un Excel binario con 3 filas de header (vacías) y luego
 * las filas que se pasan como matriz (incluyendo nulls para celdas
 * vacías). Devuelve el buffer listo para parseExcelFile.
 *
 * Layout columnas:
 *   col 0: fecha, col 1: tipo, col 2: grupo, col 3: proveedor,
 *   col 4: (—), col 5: concepto, col 6: cp, col 7: ncp,
 *   col 8: ie, col 9: ic, col 10: ge, col 11: gc
 */
function buildExcel(rows: unknown[][]): Buffer {
  const aoa: unknown[][] = [
    ["", "", "", "", "", "", "", "", "", "", "", ""], // header 1
    ["", "", "", "", "", "", "", "", "", "", "", ""], // header 2
    ["", "", "", "", "", "", "", "", "", "", "", ""], // header 3
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ing&Gtos Abr26");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function findWarning(ws: ParseWarning[], rowNumber: number): ParseWarning | undefined {
  return ws.find((w) => w.rowNumber === rowNumber);
}

// ─── Test A1: tipo vacío + monto en columna de egreso ─────────────
{
  const buf = buildExcel([
    ["2026-04-15", "", "PLANILLA", "PROV", "", "FALTANTE MARZO", "", "", null, null, 100, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos.find((x) => x.amount === 100);
  const w = findWarning(r.parseWarnings, 4);
  assert("A1: tipo vacío + ge=100 → autocorregido a egreso",
    !!m && m.type === "expense" && m.amount === 100,
    JSON.stringify(m));
  assert("A1: emite warning empty_type/autocorrected/correctedType=G",
    !!w && w.reason === "empty_type" && w.severity === "autocorrected" && w.correctedType === "G",
    JSON.stringify(w));
}

// ─── Test A2: tipo vacío + monto en columna de ingreso ────────────
{
  const buf = buildExcel([
    ["2026-04-15", "", "VENTAS", "", "", "YAPE", "", "", null, 50, null, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos.find((x) => x.amount === 50);
  const w = findWarning(r.parseWarnings, 4);
  assert("A2: tipo vacío + ic=50 → autocorregido a ingreso",
    !!m && m.type === "income" && m.amount === 50);
  assert("A2: emite warning empty_type/correctedType=I",
    !!w && w.reason === "empty_type" && w.correctedType === "I");
}

// ─── Test A3: tipo vacío + montos mixtos → bloqueante ─────────────
{
  const buf = buildExcel([
    ["2026-04-15", "", "MIXTO", "", "", "AMBIGUO", "", "", null, 30, 20, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos.find((x) => x.note?.includes("AMBIGUO"));
  const w = findWarning(r.parseWarnings, 4);
  assert("A3: tipo vacío + mixto → fila descartada",
    !m, "fila no debió importarse");
  assert("A3: emite warning blocking_error/empty_type/mixed",
    !!w && w.severity === "blocking_error" && w.column === "mixed");
}

// ─── Test A4: tipo vacío + sin monto → descartado silencioso ──────
{
  const buf = buildExcel([
    ["2026-04-15", "", "", "", "", "BASURA", "", "", null, null, null, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  assert("A4: tipo vacío + sin monto → no genera warning ni movimiento",
    r.movimientos.length === 0 && r.parseWarnings.length === 0);
}

// ─── Test B1: tipo='I' pero monto en ge (Caso B real) ─────────────
{
  const buf = buildExcel([
    ["2026-04-15", "I", "CAJA CHICA", "", "", "CAJA CHICA #14", "", "", null, null, 100, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos[0];
  const w = findWarning(r.parseWarnings, 4);
  assert("B1: tipo='I' + ge=100 → corregido a egreso",
    !!m && m.type === "expense" && m.amount === 100);
  assert("B1: emite warning type_mismatch/autocorrected/correctedType=G",
    !!w && w.reason === "type_mismatch" && w.severity === "autocorrected" && w.correctedType === "G" && w.originalType === "I");
}

// ─── Test B2: tipo='G' pero monto en ic (devolución) ──────────────
{
  const buf = buildExcel([
    ["2026-04-15", "G", "DEVOLUC", "", "", "REEMBOLSO", "", "", null, 70, null, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos[0];
  const w = findWarning(r.parseWarnings, 4);
  assert("B2: tipo='G' + ic=70 → tratado como ingreso (refund) y warning emitido",
    !!m && m.type === "income" && m.isRefund === true && m.note.startsWith("[DEVOLUCION]"));
  assert("B2: warning type_mismatch correctedType=I",
    !!w && w.reason === "type_mismatch" && w.correctedType === "I" && w.originalType === "G");
}

// ─── Test B3: tipo='I' + montos mixtos → bloqueante ───────────────
{
  const buf = buildExcel([
    ["2026-04-15", "I", "MIXTO", "", "", "AMBIGUO", "", "", null, 50, 30, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos.find((x) => x.note?.includes("AMBIGUO"));
  const w = findWarning(r.parseWarnings, 4);
  assert("B3: tipo='I' + mixto → fila descartada",
    !m);
  assert("B3: warning type_mismatch blocking_error",
    !!w && w.reason === "type_mismatch" && w.severity === "blocking_error");
}

// ─── Test C1: fecha vacía + monto + descripción → último día del mes
{
  const buf = buildExcel([
    [null, "G", "AFP", "", "", "AFP JUNIOR", "", "", null, null, 133.01, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos[0];
  const w = findWarning(r.parseWarnings, 4);
  assert("C1: fecha vacía + ge=133.01 + desc → fecha = 2026-04-30",
    !!m && m.date === "2026-04-30" && m.type === "expense" && m.amount === 133.01);
  assert("C1: warning empty_date/autocorrected con correctedDate",
    !!w && w.reason === "empty_date" && w.severity === "autocorrected" && w.correctedDate === "2026-04-30");
}

// ─── Test C2: fila previa con fecha + fila siguiente vacía → forward-fill (NO Caso C)
{
  const buf = buildExcel([
    ["2026-04-10", "G", "GASTOS", "", "", "PRIMERO", "", "", null, null, 50, null],
    [null,         "G", "GASTOS", "", "", "SEGUNDO", "", "", null, null, 60, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const segundo = r.movimientos.find((x) => x.note.includes("SEGUNDO"));
  const wC = r.parseWarnings.find((w) => w.reason === "empty_date");
  assert("C2: forward-fill activa, segundo movimiento hereda fecha 2026-04-10",
    !!segundo && segundo.date === "2026-04-10");
  assert("C2: NO emite warning empty_date (forward-fill normal)",
    !wC, JSON.stringify(wC));
}

// ─── Test C3: fila vacía sin descripción NI monto → descartada silenciosa
{
  const buf = buildExcel([
    [null, "G", "", "", "", "", "", "", null, null, null, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const wC = r.parseWarnings.find((w) => w.reason === "empty_date");
  assert("C3: fila completamente vacía → 0 movimientos, 0 warnings empty_date",
    r.movimientos.length === 0 && !wC);
}

// ─── Test combo A+C: tipo vacío + fecha vacía + monto + desc ──────
{
  const buf = buildExcel([
    [null, "", "AFP", "", "", "AFP JUNIOR", "", "", null, null, 133.01, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos[0];
  const wA = r.parseWarnings.find((w) => w.reason === "empty_type");
  const wC = r.parseWarnings.find((w) => w.reason === "empty_date");
  assert("A+C combo: 1 movimiento autocorregido (egreso, fecha 2026-04-30)",
    !!m && m.type === "expense" && m.date === "2026-04-30" && m.amount === 133.01);
  assert("A+C combo: 2 warnings emitidos para misma fila (rowNumber=4)",
    !!wA && wA.rowNumber === 4 && !!wC && wC.rowNumber === 4);
}

// ─── Test sanity: tipo='G' + ge>0 (caso normal) → 0 warnings ──────
{
  const buf = buildExcel([
    ["2026-04-15", "G", "GASTOS", "", "", "GASTO NORMAL", "", "", null, null, 100, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  assert("Sanity: caso normal sin defectos → 0 parseWarnings",
    r.parseWarnings.length === 0,
    JSON.stringify(r.parseWarnings));
  assert("Sanity: 1 movimiento, type=expense, amount=100",
    r.movimientos.length === 1 && r.movimientos[0].type === "expense");
}

// ═══════════════════════════════════════════════════════════════════
// 3. Decisión 1 (silenced) y Decisión 2 (info) — Prompt 18.1
// ═══════════════════════════════════════════════════════════════════
console.log("\n═══ Decisión 1 (silenced) y 2 (info) ═══");

// ─── Test S1: SALDOS EFECTIVO con monto en ie → silenced ──────────
{
  const buf = buildExcel([
    ["2026-04-30", "", "SALDOS", "", "", "SALDOS EFECTIVO (ENE-MAR)", "", "", 1718.03, null, null, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos.find((x) => x.amount === 1718.03);
  const w = findWarning(r.parseWarnings, 4);
  assert("S1: SALDOS EFECTIVO no se importa",
    !m, "no debió importarse");
  assert("S1: emite warning balance_row/silenced",
    !!w && w.reason === "balance_row" && w.severity === "silenced");
  assert("S1: warning incluye message accionable",
    !!w?.message && w.message.includes("saldo acumulado"));
}

// ─── Test S2: SALDOS CTA CTE con monto en ic → silenced ───────────
{
  const buf = buildExcel([
    ["2026-04-30", "", "SALDOS", "", "", "SALDOS CTA CTE (ENE-MAR)", "", "", null, 6694.34, null, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos.find((x) => x.amount === 6694.34);
  const w = findWarning(r.parseWarnings, 4);
  assert("S2: SALDOS CTA CTE no se importa",
    !m);
  assert("S2: emite warning balance_row/silenced",
    !!w && w.reason === "balance_row" && w.severity === "silenced");
}

// ─── Test S3: variantes (CUENTA, BCP) ─────────────────────────────
{
  const buf = buildExcel([
    ["2026-04-30", "", "", "", "", "SALDO BCP DICIEMBRE", "", "", null, 100, null, null],
    ["2026-04-30", "", "", "", "", "SALDOS CUENTA AL CIERRE", "", "", null, 200, null, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const silenced = r.parseWarnings.filter((w) => w.severity === "silenced");
  assert("S3: detecta variantes 'SALDO BCP' y 'SALDOS CUENTA' (case-insensitive)",
    silenced.length === 2, JSON.stringify(silenced));
}

// ─── Test S4: descripción común con palabra 'saldo' suelto NO matchea
{
  // "PAGO POR SALDO PENDIENTE" no debe matchear el regex (no termina
  // en EFECTIVO/CTA/CUENTA/BCP).
  const buf = buildExcel([
    ["2026-04-15", "G", "OTROS", "", "", "PAGO POR SALDO PENDIENTE", "", "", null, null, 50, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos.find((x) => x.amount === 50);
  const silenced = r.parseWarnings.filter((w) => w.severity === "silenced");
  assert("S4: 'SALDO PENDIENTE' (sin match) NO se silencia",
    !!m && silenced.length === 0);
}

// ─── Test I1: stale_forward_fill cuando Caso A + fwd-fill ≥3d antes
{
  const buf = buildExcel([
    // Fila explícita 20/04 con tipo OK
    ["2026-04-20", "G", "GASTOS", "", "", "PRIMERO 20/04", "", "", null, null, 100, null],
    // Fila siguiente: fecha vacía + tipo vacío + monto + descripción
    [null,         "",  "AFP",    "", "", "AFP REZAGADO",  "", "", null, null, 200, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const m = r.movimientos.find((x) => x.note.includes("AFP REZAGADO"));
  const wInfo = r.parseWarnings.find((w) => w.reason === "stale_forward_fill");
  const wA = r.parseWarnings.find((w) => w.reason === "empty_type");
  assert("I1: fila se importa con fecha 2026-04-20 (forward-fill, NO Caso C)",
    !!m && m.date === "2026-04-20");
  assert("I1: emite warning empty_type (Caso A) autocorregido",
    !!wA && wA.severity === "autocorrected");
  assert("I1: emite warning stale_forward_fill/info (10 días antes de 30/04)",
    !!wInfo && wInfo.severity === "info" && wInfo.date === "2026-04-20");
  assert("I1: warning info incluye message accionable mencionando último día",
    !!wInfo?.message && wInfo.message.includes("último día del mes"));
}

// ─── Test I2: Caso A con fwd-fill ≤2d antes → NO emite info ────────
{
  const buf = buildExcel([
    ["2026-04-29", "G", "GASTOS", "", "", "PRIMERO 29/04", "", "", null, null, 100, null],
    [null,         "",  "AFP",    "", "", "AFP CASI ULTIMO","", "", null, null, 200, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const wInfo = r.parseWarnings.find((w) => w.reason === "stale_forward_fill");
  assert("I2: fwd-fill 29/04 está a 1d de 30/04 → NO emite stale_forward_fill",
    !wInfo);
}

// ─── Test I3: Caso A con fecha EXPLÍCITA (no fwd-fill) → NO emite info
{
  const buf = buildExcel([
    ["2026-04-15", "", "AFP", "", "", "AFP EXPLICITA", "", "", null, null, 200, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const wInfo = r.parseWarnings.find((w) => w.reason === "stale_forward_fill");
  assert("I3: Caso A con fecha explícita 15/04 → NO emite stale_forward_fill",
    !wInfo);
}

// ─── Test I4: tipo declarado normal + fwd-fill desfasado → NO emite info
{
  const buf = buildExcel([
    ["2026-04-10", "G", "GASTOS", "", "", "PRIMERO", "", "", null, null, 100, null],
    [null,         "G", "GASTOS", "", "", "SEGUNDO", "", "", null, null, 200, null],
  ]);
  const r = parseExcelFile(buf, "Ing&Gtos Abr26");
  const wInfo = r.parseWarnings.find((w) => w.reason === "stale_forward_fill");
  assert("I4: tipo='G' explícito + fwd-fill 10/04 → NO emite info (no era Caso A)",
    !wInfo);
}

// ═══════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(50)}`);
console.log(passed === passed + failed ? `✅ ${passed}/${passed + failed} tests pasaron` :
  `${passed} pasaron, ${failed} fallaron de ${passed + failed} totales`);
console.log("═".repeat(50));
process.exit(failed > 0 ? 1 : 0);

void ({} as ParsedMovement);  // keep imports
