import * as XLSX from "xlsx";
import * as fs from "fs";
const buf = fs.readFileSync("/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/2. Fonavi/1. Finanzas/INGRESOS & GASTOS - FONAVI Abril.xlsx");
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
const ws = wb.Sheets["Control de VTAS-ABR26"];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
console.log(`Total filas: ${rows.length}`);
for (let i = 0; i < Math.min(20, rows.length); i++) {
  console.log(`Row ${i}:`, JSON.stringify(rows[i]?.slice(0, 11)));
}
