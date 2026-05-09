/**
 * Inspecciona el archivo SUMMARY-V2 que importó Kelly para Fonavi.
 * Objetivo: entender por qué byte_sales_daily tiene 2x los valores
 * esperados (S/72,439.10 vs S/36,986.40 esperado para abril 2026).
 *
 * Hipótesis a validar:
 *  - ¿La hoja "Control de VTAS-ABR26" tiene filas duplicadas por día?
 *  - ¿La fila "Total" del Excel no fue filtrada por el parser
 *    (`if (conceptoCuentas === "Total") continue;`)?
 *  - ¿Hay alguna diferencia estructural vs el archivo Abril.xlsx
 *    contra el que validamos el parser?
 */
import * as XLSX from "xlsx";
import * as path from "path";

const FILE = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/2. Fonavi/1. Finanzas/INGRESOS & GASTOS - SUMMARY- FONAVI - 08.05.2026-V2.xlsx";

function main() {
  console.log(`Leyendo: ${path.basename(FILE)}\n`);
  const wb = XLSX.readFile(FILE, { cellDates: true });
  console.log(`Hojas en el libro:`);
  wb.SheetNames.forEach((n, i) => console.log(`  [${i}] "${n}"`));
  console.log("");

  // Buscar hojas Control de VTAS
  const cvSheets = wb.SheetNames.filter((n) => /Control de VTAS/i.test(n));
  console.log(`Hojas Control de VTAS encontradas: ${cvSheets.length}`);
  cvSheets.forEach((n) => console.log(`  - "${n}"`));
  console.log("");

  for (const sheetName of cvSheets) {
    console.log(`\n=== Hoja: "${sheetName}" ===`);
    const ws = wb.Sheets[sheetName];
    const range = ws["!ref"];
    console.log(`Range: ${range}`);

    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: true,
    });
    console.log(`Total filas (incluyendo encabezados): ${rows.length}`);

    // Imprimir primeras 5 filas para ver encabezados
    console.log(`\n-- Primeras 5 filas (encabezados) --`);
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const r = rows[i] ?? [];
      console.log(
        `[${i}]`,
        r.slice(0, 12).map((c) => {
          if (c === null || c === undefined) return "—";
          if (c instanceof Date) return c.toISOString().slice(0, 10);
          return String(c).slice(0, 30);
        }),
      );
    }

    // Imprimir últimas 5 filas (donde podría estar el Total)
    console.log(`\n-- Últimas 5 filas (¿Total?) --`);
    for (let i = Math.max(0, rows.length - 5); i < rows.length; i++) {
      const r = rows[i] ?? [];
      console.log(
        `[${i}]`,
        r.slice(0, 12).map((c) => {
          if (c === null || c === undefined) return "—";
          if (c instanceof Date) return c.toISOString().slice(0, 10);
          return String(c).slice(0, 30);
        }),
      );
    }

    // Contar filas con conceptoCuentas === "Total"
    let totalRowCount = 0;
    let totalRowIndices: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const conceptoCuentas = r[4];
      if (
        typeof conceptoCuentas === "string" &&
        conceptoCuentas.trim().toLowerCase() === "total"
      ) {
        totalRowCount++;
        totalRowIndices.push(i);
      }
    }
    console.log(
      `\nFilas con col E = "Total" (case-insensitive): ${totalRowCount} → índices ${JSON.stringify(totalRowIndices)}`,
    );

    // Contar filas que parecen "datos" (col D = monto numérico, col E = string no-Total)
    let dataRowCount = 0;
    let dateCount = 0;
    let datesSeen = new Set<string>();
    let suspiciousRows: { i: number; preview: unknown[] }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const fecha = r[0];
      const montoQuipupos = r[3];
      const montoCuentas = r[5];

      if (typeof montoQuipupos === "number" || typeof montoCuentas === "number") {
        dataRowCount++;
      }
      if (fecha instanceof Date) {
        dateCount++;
        datesSeen.add(fecha.toISOString().slice(0, 10));
      } else if (typeof fecha === "number") {
        // Posible fecha serial de Excel
        const parsed = XLSX.SSF.parse_date_code(fecha);
        if (parsed) {
          datesSeen.add(
            `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`,
          );
          dateCount++;
        }
      }

      // Filas sospechosas: tienen monto pero no fecha y no parecen ser continuación
      if (
        (typeof montoQuipupos === "number" && montoQuipupos > 1000) ||
        (typeof montoCuentas === "number" && montoCuentas > 1000)
      ) {
        if (suspiciousRows.length < 30) {
          suspiciousRows.push({ i, preview: r.slice(0, 9) });
        }
      }
    }

    console.log(`\nFilas con datos numéricos: ${dataRowCount}`);
    console.log(`Filas con fecha (Date u Excel serial): ${dateCount}`);
    console.log(`Fechas únicas: ${datesSeen.size}`);
    if (datesSeen.size > 0) {
      const sorted = [...datesSeen].sort();
      console.log(`Rango fechas: ${sorted[0]} → ${sorted[sorted.length - 1]}`);
    }

    // Mostrar todas las filas con monto > 1000 (las "grandes" que sumarían a totales)
    console.log(`\n-- Primeras filas con monto grande (>1000) --`);
    for (const sr of suspiciousRows.slice(0, 15)) {
      console.log(
        `[${sr.i}]`,
        sr.preview.map((c) => {
          if (c === null || c === undefined) return "—";
          if (c instanceof Date) return c.toISOString().slice(0, 10);
          return String(c).slice(0, 25);
        }),
      );
    }
  }
}

main();
