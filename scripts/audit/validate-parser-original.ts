/**
 * Re-valida el parser contra el archivo Abril.xlsx ORIGINAL para
 * confirmar que el fix de mes/forward-fill no rompe casos buenos.
 * Esperado original: 31 días, S/73,972.80 total, rango 11/03-10/04.
 *
 * NOTA: el "esperado original" es del archivo viejo (Kelly cambió
 * el formato). Solo verificamos que el parser sigue corriendo sin
 * crashear y que las cifras siguen siendo razonables.
 */
import * as fs from "fs";
import { parseControlVtas, listControlVtasSheets } from "../../src/lib/control-vtas-parser";

const FILE = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/2. Fonavi/1. Finanzas/INGRESOS & GASTOS - FONAVI Abril.xlsx";

function main() {
  if (!fs.existsSync(FILE)) {
    console.log(`Archivo no existe: ${FILE}`);
    return;
  }
  const buf = fs.readFileSync(FILE);
  const sheets = listControlVtasSheets(buf);
  console.log(`Sheets: ${JSON.stringify(sheets)}`);

  for (const s of sheets) {
    console.log(`\n=== "${s}" ===`);
    const r = parseControlVtas(buf, s);
    console.log(`Días: ${r.ventasDiarias.length}`);
    console.log(`Rango: ${r.rangoFechas.start} → ${r.rangoFechas.end}`);
    const total = r.ventasDiarias.reduce((a, d) => a + d.total, 0);
    console.log(`Total general: S/${total.toFixed(2)}`);
    console.log(`Propinas: ${r.propinas.length} (S/${r.propinas.reduce((a,p)=>a+p.amount,0).toFixed(2)})`);
    console.log(`Alertas: ${r.alertasRedondeo.length}`);
    console.log(`Errores: ${r.errores.length} | Warnings: ${r.warnings.length}`);
    if (r.warnings.length) console.log("Warnings:", r.warnings);
  }
}
main();
