/**
 * Tests de regresión para src/lib/control-vtas-parser.ts.
 *
 * Cubre el bug del shift de columnas detectado en Centro Abril 2026:
 * el parser asumía idx 0 = Fecha (validado contra Fonavi con
 * !ref=B1:L211) y producía 0 días silenciosamente para Centro
 * (!ref=A1:L211). Ahora detecta dinámicamente la columna "Fecha"
 * leyendo el header.
 *
 * Uso: npx tsx scripts/audit/test-control-vtas-parser.ts
 */
import * as fs from "fs";
import * as XLSX from "xlsx";
import { parseControlVtas } from "../../src/lib/control-vtas-parser";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.error(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const FONAVI_FILE = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/2. Fonavi/1. Finanzas/INGRESOS & GASTOS - SUMMARY- FONAVI - 08.05.2026-V2.xlsx";
const CENTRO_FILE = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/3. Centro/1. Finanzas/INGRESOS & GASTOS - CENTRO- Abril.xlsx";

console.log("\n═══ Regresión 1: Fonavi Control de VTAS-ABR26 ═══");
{
  if (!fs.existsSync(FONAVI_FILE)) {
    console.log("⏭  Archivo no disponible, skip");
  } else {
    const buf = fs.readFileSync(FONAVI_FILE);
    const r = parseControlVtas(buf, "Control de VTAS-ABR26");
    const total = r.ventasDiarias.reduce((s, d) => s + d.total, 0);
    assert("Fonavi: 0 errores",
      r.errores.length === 0, JSON.stringify(r.errores));
    assert("Fonavi: 30 días parseados",
      r.ventasDiarias.length === 30, `got ${r.ventasDiarias.length}`);
    assert("Fonavi: total S/36,986.40 (validado en Prompt 16)",
      Math.abs(total - 36986.40) < 0.01, `got S/${total.toFixed(2)}`);
    assert("Fonavi: rango 2026-04-01 → 2026-04-30",
      r.rangoFechas.start === "2026-04-01" && r.rangoFechas.end === "2026-04-30");
  }
}

console.log("\n═══ Regresión 2: Centro Control de VTAS-Abr26 (bug original) ═══");
{
  if (!fs.existsSync(CENTRO_FILE)) {
    console.log("⏭  Archivo no disponible, skip");
  } else {
    const buf = fs.readFileSync(CENTRO_FILE);
    const r = parseControlVtas(buf, "Control de VTAS-Abr26");
    const total = r.ventasDiarias.reduce((s, d) => s + d.total, 0);
    assert("Centro: 0 errores",
      r.errores.length === 0, JSON.stringify(r.errores));
    assert("Centro: 30 días parseados (antes producía 0 silenciosamente)",
      r.ventasDiarias.length === 30, `got ${r.ventasDiarias.length}`);
    assert("Centro: total ≈ S/36,689.76 (ventas brutas reales)",
      Math.abs(total - 36689.76) < 0.50, `got S/${total.toFixed(2)}`);
    assert("Centro: rango 2026-04-01 → 2026-04-30",
      r.rangoFechas.start === "2026-04-01" && r.rangoFechas.end === "2026-04-30");
  }
}

console.log("\n═══ Test 3: Header sin columna 'Fecha' → error explícito ═══");
{
  // Sintetizamos un Excel sin "Fecha" en el header.
  const aoa: unknown[][] = [
    ["X", "Y", "Z", "Q", "Cuentas"], // header sin "Fecha"
    [null, null, null, null, null],
    ["—", "—", "Efectivo", 100, "Efectivo"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Control de VTAS-Abr26");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const r = parseControlVtas(buf, "Control de VTAS-Abr26");
  assert("Sin 'Fecha' en header: emite error explícito (no silencioso)",
    r.errores.length > 0, JSON.stringify(r.errores));
  assert("Sin 'Fecha': 0 días emitidos",
    r.ventasDiarias.length === 0);
  assert("Sin 'Fecha': error menciona la hoja y headers leídos",
    !!r.errores[0] && r.errores[0].includes("Headers leídos"),
    r.errores[0]);
}

console.log("\n═══ Test 4: Header 'fecha' lowercase también funciona ═══");
{
  const aoa: unknown[][] = [
    ["fecha", "Día", "QuipuPOS", null, "Cuentas", null, "Comparativo", null, "Nota", null, null],
    ["2026-04-01", "Miércoles", null, null, null, null, null, null, null, null, null],
    [null, null, "Efectivo", 100, "Efectivo", 100, 0, null, "OK", null, null],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Control de VTAS-Abr26");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const r = parseControlVtas(buf, "Control de VTAS-Abr26");
  assert("Header 'fecha' lowercase: 0 errores",
    r.errores.length === 0, JSON.stringify(r.errores));
  assert("Header 'fecha' lowercase: 1 día parseado",
    r.ventasDiarias.length === 1, `got ${r.ventasDiarias.length}`);
}

console.log(`\n${"═".repeat(50)}`);
console.log(passed === passed + failed ? `✅ ${passed}/${passed + failed} tests pasaron` :
  `${passed} pasaron, ${failed} fallaron de ${passed + failed} totales`);
console.log("═".repeat(50));
process.exit(failed > 0 ? 1 : 0);
