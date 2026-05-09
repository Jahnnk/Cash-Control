/**
 * Vuelca filas alrededor del día 30 de abril para entender por qué
 * el parser produce ef=8685.10 yp=17014.50 pos=11286.80 (=36986.40).
 */
import * as XLSX from "xlsx";

const FILE = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/2. Fonavi/1. Finanzas/INGRESOS & GASTOS - SUMMARY- FONAVI - 08.05.2026-V2.xlsx";

function fmt(c: unknown) {
  if (c === null || c === undefined) return "—";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).slice(0, 30);
}

function main() {
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const ws = wb.Sheets["Control de VTAS-ABR26"];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1, defval: null, raw: true,
  });

  console.log(`Volcando rows 175-211 (día 30 + cola del archivo):\n`);
  for (let i = 175; i < rows.length; i++) {
    const r = rows[i] ?? [];
    console.log(`[${String(i).padStart(3)}]`, r.slice(0, 11).map(fmt));
  }
}
main();
