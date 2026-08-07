import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);

const ids = ['811176f6-9ca0-4824-9bac-b54bb1954df0', '0df066a7-9d80-4231-a400-17a3d01f323d'];
const rows = await sql`SELECT * FROM bank_income_items WHERE id = ANY(${ids})`;
writeFileSync("scripts/audit/respaldos/2026-08-06-ingresos-fonavi-compartidos.json", JSON.stringify(rows, null, 2));

let revert = "-- Reversión: devuelve los 2 ingresos existentes a su estado antes de la corrección\nBEGIN;\n\n";
for (const r of rows) {
  revert += `UPDATE bank_income_items SET is_special_loan=${r.is_special_loan}, loan_via_bank=${r.loan_via_bank}, note=${JSON.stringify(r.note)} WHERE id='${r.id}';\n`;
}
revert += "\n-- Además, borrar las filas NUEVAS creadas por 2026-08-06-fonavi-compartidos-a-prestamo.mjs\n-- (sus ids se imprimen al ejecutar ese script con --apply)\n\nCOMMIT;\n";
writeFileSync("scripts/audit/respaldos/2026-08-06-REVERTIR-ingresos-fonavi-compartidos.sql", revert);
console.log("✓ respaldo guardado:", rows.length, "filas");
rows.forEach(r => console.log(" ", r.id, r.amount, r.date, r.is_special_loan));
