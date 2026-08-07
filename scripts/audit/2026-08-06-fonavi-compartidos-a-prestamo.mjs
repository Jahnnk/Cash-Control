/**
 * Los gastos compartidos condonados (alquiler+trifásico abril, Compras
 * Metro 05-may) tienen su parte de Fonavi ya "cobrada" según
 * fonavi_receivables. Pero Jahnn cubrió el 100% de esos gastos de su
 * bolsillo (condonado — no se devuelve). Si Fonavi TAMBIÉN pagó su
 * parte a Atelier, esa plata es de Jahnn, no de Atelier — confirmado
 * por él el 06-ago-2026 para los 3 casos.
 *
 * Efecto: los ingresos de Fonavi pasan de "ingreso normal de Atelier" a
 * "préstamo del socio" (ya devuelto — Jahnn confirma que ya retiró esa
 * plata para sí). Total puesto por el socio NO cambia (S/12,322.60);
 * solo se reclasifica de "condonado" a "prestado y devuelto".
 *
 * Uso: node scripts/audit/2026-08-06-fonavi-compartidos-a-prestamo.mjs [--apply]
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const LOAN_CATEGORY = "Préstamos del socio";

const NOTA_ALQUILER = "Reembolso Fonavi — su parte del alquiler de abril (es de Jahnn, no ingreso de Atelier: él ya había cubierto el 100% del gasto — auditoría 06-ago-2026)";
const NOTA_METRO = "Compras Metro — reembolso de Fonavi (es de Jahnn, no ingreso de Atelier: él ya había cubierto el 100% del gasto — auditoría 06-ago-2026)";

console.log("═══ ANTES ═══");
const condAntes = (await sql`SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
  WHERE business_id=1 AND payment_method='socio' AND archived=false
    AND notes NOT LIKE 'Pagado por el socio (préstamo directo del%'`)[0].t;
const prestAntes = (await sql`SELECT COALESCE(SUM(amount),0)::float AS t FROM bank_income_items
  WHERE business_id=1 AND is_special_loan=true`)[0].t;
console.log(`  condonado: ${r2(condAntes)} | prestado: ${r2(prestAntes)} | total: ${r2(condAntes+prestAntes)}`);

if (!APPLY) {
  console.log("\n[simulación] Cambios que se harían:");
  console.log("  1. UPDATE ingreso 899.91 (alquiler) → is_special_loan=true, loan_via_bank=false");
  console.log("  2. INSERT ingreso NUEVO 408.85 (trifásico) → is_special_loan=true, loan_via_bank=false, 08-jun");
  console.log("  3. UPDATE ingreso 46.80 (Compras Metro) → is_special_loan=true, loan_via_bank=true (sigue en el banco)");
  console.log("  4. INSERT devolución 1,308.76 (alquiler+trifásico, efectivo) — Jahnn ya la retiró");
  console.log("  5. INSERT devolución 46.80 (efectivo) — Jahnn ya la retiró");
  console.log("  6. loans.ts: condonado usará atelier_amount en compartidos (ya en el código)");
  console.log("\nAñade --apply para ejecutar.");
  process.exit(0);
}

// 1. Alquiler: reclasificar el ingreso existente
await sql`UPDATE bank_income_items SET is_special_loan=true, loan_via_bank=false, note=${NOTA_ALQUILER}
  WHERE id='811176f6-9ca0-4824-9bac-b54bb1954df0'`;

// 2. Trifásico: faltaba registrar — se agrega directo como préstamo
const [nuevo408] = await sql`INSERT INTO bank_income_items
  (business_id, date, amount, client_id, note, payment_method, is_special_loan, loan_via_bank)
  VALUES (1, '2026-06-08', 408.85, NULL, 'Reembolso Fonavi — trifásico (recibido junto con los 899.91 de alquiler; no se había registrado) — es de Jahnn, no ingreso de Atelier', 'efectivo', true, false)
  RETURNING id`;

// 3. Compras Metro: reclasificar el ingreso existente (vía banco)
await sql`UPDATE bank_income_items SET is_special_loan=true, loan_via_bank=true, note=${NOTA_METRO}
  WHERE id='0df066a7-9d80-4231-a400-17a3d01f323d'`;

// 4. Devolución combinada: alquiler + trifásico (899.91 + 408.85), efectivo — ya retirada por Jahnn
const [dev1] = await sql`INSERT INTO expenses
  (business_id, date, category, concept, amount, payment_method, notes, is_special_loan, loan_via_bank)
  VALUES (1, '2026-06-08', ${LOAN_CATEGORY}, 'Devolución — parte de Fonavi en alquiler y trifásico de abril (retirada en efectivo por Jahnn)', 1308.76, 'efectivo', 'Corresponde a los reembolsos de Fonavi del 08-jun (899.91 + 408.85) — auditoría 06-ago-2026', true, false)
  RETURNING id`;

// 5. Devolución: Compras Metro (46.80) — ya retirada por Jahnn
const [dev2] = await sql`INSERT INTO expenses
  (business_id, date, category, concept, amount, payment_method, notes, is_special_loan, loan_via_bank)
  VALUES (1, '2026-05-05', ${LOAN_CATEGORY}, 'Devolución — parte de Fonavi en Compras Metro (retirada por Jahnn)', 46.80, 'efectivo', 'Corresponde al reembolso de Fonavi del 05-may (transferencia) — retirado luego en efectivo. Auditoría 06-ago-2026', true, false)
  RETURNING id`;

console.log("\n✓ nuevo ingreso trifásico:", nuevo408.id);
console.log("✓ nueva devolución alquiler+trifásico:", dev1.id);
console.log("✓ nueva devolución Compras Metro:", dev2.id);

console.log("\n═══ DESPUÉS ═══");
const condDespues = (await sql`SELECT COALESCE(SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount,amount) ELSE amount END),0)::float AS t
  FROM expenses WHERE business_id=1 AND payment_method='socio' AND archived=false
    AND notes NOT LIKE 'Pagado por el socio (préstamo directo del%'`)[0].t;
const prestDespues = (await sql`SELECT COALESCE(SUM(amount),0)::float AS t FROM bank_income_items
  WHERE business_id=1 AND is_special_loan=true`)[0].t;
const devDespues = (await sql`SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses
  WHERE business_id=1 AND is_special_loan=true AND archived=false`)[0].t;
console.log(`  condonado: ${r2(condDespues)} | prestado: ${r2(prestDespues)} | devuelto: ${r2(devDespues)}`);
console.log(`  TOTAL PUESTO: ${r2(condDespues + prestDespues)}  (antes: ${r2(condAntes+prestAntes)})`);
console.log(`  PENDIENTE: ${r2(prestDespues - devDespues)}`);
