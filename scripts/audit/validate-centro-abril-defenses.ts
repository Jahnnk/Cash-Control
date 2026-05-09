/**
 * Valida end-to-end el archivo real de Centro Abril 2026 contra el
 * parser con defensas tolerantes. Imprime:
 *   - Lista de hojas detectadas
 *   - Por cada hoja Ing&Gtos: total movs, parseWarnings desglosados
 *     por reason/severity, filas afectadas, totales reales
 */
import * as fs from "fs";
import { parseExcelFile, listSheets } from "../../src/lib/excel-importer";

const FILE = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/3. Centro/1. Finanzas/INGRESOS & GASTOS - CENTRO- Abril.xlsx";

function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`No existe: ${FILE}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(FILE);
  const sheets = listSheets(buf);
  console.log(`Hojas Ing&Gtos detectadas: ${JSON.stringify(sheets)}\n`);

  for (const s of sheets) {
    console.log(`\n══════ Parseando "${s}" ══════`);
    const r = parseExcelFile(buf, s);

    console.log(`Movimientos: ${r.movimientos.length}`);
    console.log(`  Ingresos: ${r.ingresos}, Egresos: ${r.egresos}, Devoluciones: ${r.devoluciones}`);
    console.log(`  Rango: ${r.rangoFechas.start} → ${r.rangoFechas.end}`);
    console.log(`  Totales: ingEf=${r.totales.ingresosEfectivo}  ingBcp=${r.totales.ingresosBcp}  egEf=${r.totales.egresosEfectivo}  egBcp=${r.totales.egresosBcp}`);
    console.log(`  Errores: ${r.errores.length} | Warnings strings: ${r.warnings.length} | parseWarnings: ${r.parseWarnings.length}`);

    if (r.parseWarnings.length > 0) {
      console.log(`\n--- ParseWarnings desglosados ---`);
      const byReason = new Map<string, number>();
      const bySeverity = new Map<string, number>();
      for (const w of r.parseWarnings) {
        byReason.set(w.reason, (byReason.get(w.reason) ?? 0) + 1);
        bySeverity.set(w.severity, (bySeverity.get(w.severity) ?? 0) + 1);
      }
      console.log(`  Por reason:`, Object.fromEntries(byReason));
      console.log(`  Por severity:`, Object.fromEntries(bySeverity));

      console.log(`\n--- Detalle (primeros 20) ---`);
      for (const w of r.parseWarnings.slice(0, 20)) {
        console.log(`  R${w.rowNumber} | ${w.reason}/${w.severity} | ${w.column} | S/${w.amount.toFixed(2)} | ${w.description.slice(0, 50)}`);
      }

      // Filas con múltiples warnings (combo A+C)
      const grouped = new Map<number, number>();
      for (const w of r.parseWarnings) {
        grouped.set(w.rowNumber, (grouped.get(w.rowNumber) ?? 0) + 1);
      }
      const multiwarn = [...grouped.entries()].filter(([, n]) => n > 1);
      if (multiwarn.length > 0) {
        console.log(`\n--- Filas con MÚLTIPLES warnings (combo) ---`);
        for (const [rn, n] of multiwarn) {
          const wars = r.parseWarnings.filter((w) => w.rowNumber === rn);
          console.log(`  R${rn}: ${n} warnings → ${wars.map((w) => w.reason).join(", ")}`);
        }
      }
    }

    if (r.warnings.length > 0) {
      console.log(`\n--- Warnings string legacy (no parseWarnings) ---`);
      r.warnings.slice(0, 10).forEach((w) => console.log(`  ${w}`));
    }
  }
}
main();
