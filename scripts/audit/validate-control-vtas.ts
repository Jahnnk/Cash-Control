import * as fs from "fs";
import { parseControlVtas, listControlVtasSheets } from "../../src/lib/control-vtas-parser";
const PATH = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/2. Fonavi/1. Finanzas/INGRESOS & GASTOS - FONAVI Abril.xlsx";
const buf = fs.readFileSync(PATH);
const sheets = listControlVtasSheets(buf);
console.log("Pestañas Control de VTAS detectadas:", sheets);
if (sheets.length === 0) { console.log("(no hay)"); process.exit(0); }
const sheet = sheets[sheets.length - 1];
console.log("Procesando:", sheet);
const r = parseControlVtas(buf, sheet);
console.log({
  errores: r.errores,
  warnings: r.warnings,
  rango: r.rangoFechas,
  ventasDias: r.ventasDiarias.length,
  propinas: r.propinas.length,
  alertas: r.alertasRedondeo.length,
});
const totales = r.ventasDiarias.reduce((acc, v) => ({
  efectivo: acc.efectivo + v.efectivo,
  yape_plin: acc.yape_plin + v.yape_plin,
  pos: acc.pos + v.pos,
  total: acc.total + v.total,
}), { efectivo: 0, yape_plin: 0, pos: 0, total: 0 });
console.log("Totales mes:", totales);
const totPropinas = r.propinas.reduce((s, p) => s + p.amount, 0);
console.log("Total propinas:", Math.round(totPropinas * 100) / 100);
console.log("\nMuestra primeros 3 días:");
for (const v of r.ventasDiarias.slice(0, 3)) console.log(v);
console.log("\nMuestra primeras 3 propinas:");
for (const p of r.propinas.slice(0, 3)) console.log(p);
console.log("\nMuestra primeras 3 alertas:");
for (const a of r.alertasRedondeo.slice(0, 3)) console.log(a);
