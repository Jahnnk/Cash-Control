/**
 * Corre el parser real sobre el SUMMARY-V2 y compara con la DB.
 * Objetivo: ver si el parser produce S/36,986.40 (correcto) o
 * S/72,439.10 (lo que está en DB).
 */
import * as fs from "fs";
import { parseControlVtas, listControlVtasSheets } from "../../src/lib/control-vtas-parser";

const FILE = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/2. Fonavi/1. Finanzas/INGRESOS & GASTOS - SUMMARY- FONAVI - 08.05.2026-V2.xlsx";

function main() {
  const buf = fs.readFileSync(FILE);
  const sheets = listControlVtasSheets(buf);
  console.log(`Sheets detectadas: ${JSON.stringify(sheets)}\n`);

  for (const sheetName of sheets) {
    console.log(`\n=== Parseando "${sheetName}" ===`);
    const r = parseControlVtas(buf, sheetName);
    console.log(`Errores: ${r.errores.length}`);
    if (r.errores.length) console.log(r.errores);
    console.log(`Warnings: ${r.warnings.length}`);
    console.log(`Rango fechas: ${r.rangoFechas.start} → ${r.rangoFechas.end}`);
    console.log(`Días: ${r.ventasDiarias.length}`);

    let totalEf = 0, totalYp = 0, totalPos = 0, totalDay = 0;
    for (const d of r.ventasDiarias) {
      totalEf += d.efectivo;
      totalYp += d.yape_plin;
      totalPos += d.pos;
      totalDay += d.total;
    }
    console.log(`Total Efectivo:  S/${totalEf.toFixed(2)}`);
    console.log(`Total Yape/Plin: S/${totalYp.toFixed(2)}`);
    console.log(`Total POS:       S/${totalPos.toFixed(2)}`);
    console.log(`Total general:   S/${totalDay.toFixed(2)}`);
    console.log(`Propinas: ${r.propinas.length} (S/${r.propinas.reduce((s,p)=>s+p.amount,0).toFixed(2)})`);
    console.log(`Alertas:  ${r.alertasRedondeo.length}`);

    console.log(`\n-- Detalle por día (primeros 5) --`);
    for (const d of r.ventasDiarias.slice(0, 5)) {
      console.log(
        `  ${d.date}: ef=${d.efectivo.toFixed(2)} yp=${d.yape_plin.toFixed(2)} pos=${d.pos.toFixed(2)} → total=${d.total.toFixed(2)}`,
      );
    }
    console.log(`-- Detalle por día (últimos 5) --`);
    for (const d of r.ventasDiarias.slice(-5)) {
      console.log(
        `  ${d.date}: ef=${d.efectivo.toFixed(2)} yp=${d.yape_plin.toFixed(2)} pos=${d.pos.toFixed(2)} → total=${d.total.toFixed(2)}`,
      );
    }
  }
}

main();
