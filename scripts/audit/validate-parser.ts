/**
 * Validación matemática del parser contra el Excel real de Kelly:
 * "INGRESOS Y GASTOS - FONAVI Abril.xlsx", pestaña "Ing&Gtos Abr26".
 *
 * Números esperados:
 *   276 movs (125 in + 151 out, 1 devolución, 119 byte)
 *   Saldos finales: Efectivo S/2,092.31, BCP S/4,228.77
 */
import * as fs from "fs";
import { parseExcelFile } from "../../src/lib/excel-importer.js";

const PATH = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/2. Fonavi/1. Finanzas/INGRESOS & GASTOS - FONAVI Abril.xlsx";

const EXPECTED = {
  saldoInicialEfectivo: 292.40,
  saldoInicialBcp: 6138.62,
  movimientos: 276,
  ingresos: 125,
  egresos: 151,
  devoluciones: 1,
  ventasByte: 119,
  ingresosEfectivo: 8954.10,
  ingresosBcp: 27706.73,
  egresosEfectivo: 7154.19,
  egresosBcp: 29616.58,
  saldoFinalEfectivo: 2092.31,
  saldoFinalBcp: 4228.77,
};

function close(a: number, b: number, tol = 0.011): boolean {
  return Math.abs(a - b) <= tol;
}

function check(label: string, actual: number, expected: number) {
  const ok = close(actual, expected);
  console.log(`${ok ? "✓" : "✗"} ${label}: ${actual} vs esperado ${expected}` + (ok ? "" : "  ❌"));
  return ok;
}

const buf = fs.readFileSync(PATH);
const result = parseExcelFile(buf, "Ing&Gtos Abr26");

console.log("=== Resultado del parser ===");
console.log(`Errores: ${result.errores.length}`);
console.log(`Warnings: ${result.warnings.length}`);
if (result.errores.length) console.log(JSON.stringify(result.errores, null, 2));
if (result.warnings.length) console.log("Warnings:", JSON.stringify(result.warnings, null, 2));

console.log("\n=== Validación ===");
let allOk = true;
const checks = [
  ["Saldo inicial efectivo", result.saldoInicial.efectivo ?? 0, EXPECTED.saldoInicialEfectivo],
  ["Saldo inicial BCP", result.saldoInicial.bcp ?? 0, EXPECTED.saldoInicialBcp],
  ["Movimientos", result.movimientos.length, EXPECTED.movimientos],
  ["Ingresos", result.ingresos, EXPECTED.ingresos],
  ["Egresos", result.egresos, EXPECTED.egresos],
  ["Devoluciones", result.devoluciones, EXPECTED.devoluciones],
  ["Ventas Byte", result.ventasByte, EXPECTED.ventasByte],
  ["Ingresos Efectivo", result.totales.ingresosEfectivo, EXPECTED.ingresosEfectivo],
  ["Ingresos BCP", result.totales.ingresosBcp, EXPECTED.ingresosBcp],
  ["Egresos Efectivo", result.totales.egresosEfectivo, EXPECTED.egresosEfectivo],
  ["Egresos BCP", result.totales.egresosBcp, EXPECTED.egresosBcp],
  ["Saldo final Efectivo", result.totales.saldoFinalEfectivo, EXPECTED.saldoFinalEfectivo],
  ["Saldo final BCP", result.totales.saldoFinalBcp, EXPECTED.saldoFinalBcp],
] as const;

for (const [label, actual, expected] of checks) {
  if (!check(label, actual, expected)) allOk = false;
}

console.log("\nDistribución payment_method:", JSON.stringify(result.distribucionPaymentMethod));
console.log(`Categorías únicas: ${result.categoriasUnicas.length}`);
console.log(`Rango: ${result.rangoFechas.start} → ${result.rangoFechas.end}`);
console.log(`Fecha cierre saldo: ${result.saldoInicial.fechaCierre}`);

if (!allOk) {
  console.log("\n❌ VALIDACIÓN FALLÓ — revisar parser antes de continuar.");
  process.exit(1);
}
console.log("\n✅ VALIDACIÓN OK — todos los números coinciden con el Excel.");
