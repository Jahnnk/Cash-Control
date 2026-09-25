/**
 * Saca la "foto" (ingresos, gastos y saldos finales del mes) de los Excel de
 * Kelly ya cargados, leyéndolos de Dropbox, y la guarda en su carga
 * (import_batches). Aprobado por Jahnn el 25-sep-2026 para que la
 * verificación automática funcione completa desde hoy. Solo llena columnas
 * vacías; el respaldo de import_batches está en scripts/audit/respaldos/.
 *
 * Uso: npx tsx scripts/audit/foto-excel-kelly-2026-09-25.ts [--apply]
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { parseExcelFile } from "../../src/lib/excel-importer";
import { sheetMonthKey } from "../../src/lib/excel-month-pairing";

const K = "/Users/jahnnkarlo/Library/CloudStorage/Dropbox/1. Yayi's/01. Grupo Yayi's";
const ARCHIVOS: Record<string, string> = {
  "eb529275-0b8f-448a-97f3-6f236d9d108d": `${K}/00. Dirección/Reportes Ejecutivos/Reportes Kelly/Semana 35/INGRESOS & GASTOS - SUMMARY- ATELIER - 25.08.2026.xlsx`,
  "5d8061a4-9637-44d0-b6ba-8cdc9b53fcb3": `${K}/00. Dirección/Reportes Ejecutivos/Reportes Kelly/Semana 36/INGRESOS & GASTOS - SUMMARY- ATELIER - 01.09.2026.xlsx`,
  "392c10e7-711d-4d56-b91e-bf4159e7c124": `${K}/00. Dirección/Reportes Ejecutivos/Reportes Kelly/Semana 39/INGRESOS_GASTOS_SUMMARY_ATELIER_24_09_2026_CATEGORIAS.xlsx`,
  "bb064713-d348-4ef9-8af0-5093987bc884": `${K}/02. Finanzas/Reportes Kelly/Semana 38/INGRESOS_GASTOS_SUMMARY_FONAVI_15_09_2026_PE_AUTOMATICO.xlsx`,
  "f265eedd-d9cb-4f89-ba43-4893135a4d44": `${K}/02. Finanzas/Reportes Kelly/Semana 38/INGRESOS_GASTOS_SUMMARY_FONAVI_15_09_2026_PE_AUTOMATICO.xlsx`,
  "caf28f03-2032-4a49-af77-d6f30011df63": `${K}/00. Dirección/Reportes Ejecutivos/Reportes Kelly/Semana 39/INGRESOS_GASTOS_SUMMARY_FONAVI_24_09_2026_CATEGORIAS (1).xlsx`,
  "56f69284-9382-4f59-b594-616a68b599f2": `${K}/02. Finanzas/Reportes Kelly/Semana 38/INGRESOS_GASTOS_SUMMARY_CENTRO_15_09_2026_PE_AUTOMATICO.xlsx`,
  "30a37e98-d24b-4486-9ad2-095098082bda": `${K}/02. Finanzas/Reportes Kelly/Semana 38/INGRESOS_GASTOS_SUMMARY_CENTRO_15_09_2026_PE_AUTOMATICO.xlsx`,
  "b8287c3d-8b80-4990-8925-90784069eaec": `${K}/00. Dirección/Reportes Ejecutivos/Reportes Kelly/Semana 39/INGRESOS_GASTOS_SUMMARY_CENTRO_24_09_2026_CATEGORIAS.xlsx`,
};

const sql = neon(process.env.DATABASE_URL!);
const aplicar = process.argv.includes("--apply");
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
for (const [id, ruta] of Object.entries(ARCHIVOS)) {
  const [b] = (await sql`SELECT business_id, sheet_name, movements_count, excel_ingresos FROM import_batches WHERE id = ${id}`) as { business_id: number; sheet_name: string; movements_count: number; excel_ingresos: string | null }[];
  const hoja = b.sheet_name.split(" + ")[0];
  const p = parseExcelFile(readFileSync(ruta), hoja);
  const mes = sheetMonthKey(hoja);
  let ing = 0, egr = 0;
  for (const m of p.movimientos) {
    if (mes && m.date?.slice(0, 7) !== mes) continue;
    if (m.type === "income") ing += m.amount; else egr += m.amount;
  }
  const foto = { ing: r2(ing), egr: r2(egr), banco: p.totales.saldoFinalBcp, efectivo: p.totales.saldoFinalEfectivo };
  const cuadraConteo = p.movimientos.length === b.movements_count;
  console.log(`${b.business_id} ${hoja}: ingresos ${foto.ing} · gastos ${foto.egr} · banco ${foto.banco} · efectivo ${foto.efectivo} · filas archivo ${p.movimientos.length} vs cargadas ${b.movements_count}${cuadraConteo ? "" : "  ⚠ distinto"}`);
  if (aplicar && b.excel_ingresos === null) {
    await sql`UPDATE import_batches SET excel_ingresos = ${foto.ing}, excel_egresos = ${foto.egr}, excel_saldo_banco = ${foto.banco}, excel_saldo_efectivo = ${foto.efectivo}
      WHERE id = ${id} AND excel_ingresos IS NULL`;
  }
}
if (!aplicar) console.log("(simulación: agrega --apply para guardar)");
}
void main();
