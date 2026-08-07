/**
 * Reclasifica los movimientos de abril y mayo que estaban registrados como
 * "efectivo" pero que en realidad pagó Jahnn de su bolsillo (decisión suya,
 * 06-ago-2026: son APORTE, no préstamo — Atelier no queda debiendo).
 *
 * El gasto sigue contando como costo operativo real. Lo único que cambia es
 * que deja de descontar de la caja de Atelier, que nunca tuvo ese dinero.
 *
 * Reversión: scripts/audit/respaldos/2026-08-06-REVERTIR-caja-efectivo.sql
 * Uso: node scripts/audit/2026-08-06-reclasificar-caja-atelier.mjs [--apply]
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");
const r2 = (n) => Math.round(Number(n)*100)/100;

const NOTA = "Pagado por Jahnn de su bolsillo — aporte del socio, no se devuelve (auditoría 06-ago-2026)";

// Egresos que pasan a método 'socio'
const A_SOCIO = [
  ["7093d556-e767-4960-8466-15806e585054", 2700,   "30-abr Alquiler abril"],
  ["4ff047ec-9b49-400f-b4ca-a5f5a6217081", 817.70, "30-abr Trifásico"],
];
// Los de mayo se resuelven por fecha+método para no depender de ids frágiles
const MAYO_DESDE = "2026-05-04", MAYO_HASTA = "2026-05-05";

// Ingresos de contrapartida que se retiran (nunca existieron)
const A_ARCHIVAR = [
  ["992aa5f0-bff2-4cb5-99e8-a155d39e4f10", 3517.70, "30-abr 'Aporte de Jahnn' (la muleta que cuadraba la caja)"],
];

const caja = async () => (await sql`SELECT (
  COALESCE((SELECT initial_cash_balance FROM businesses WHERE id=1),0)
  + COALESCE((SELECT SUM(amount) FROM bank_income_items WHERE business_id=1 AND payment_method='efectivo' AND archived=false),0)
  - COALESCE((SELECT SUM(amount) FROM expenses WHERE business_id=1 AND payment_method='efectivo' AND archived=false),0)
)::float AS c`)[0].c;

const egresosMayo = await sql`SELECT id, amount::float AS amount, concept FROM expenses
  WHERE business_id=1 AND payment_method='efectivo' AND archived=false
    AND date BETWEEN ${MAYO_DESDE} AND ${MAYO_HASTA}`;
const ingresosMayo = await sql`SELECT id, amount::float AS amount, COALESCE(note,'') AS note
  FROM bank_income_items WHERE business_id=1 AND payment_method='efectivo' AND archived=false
    AND date='2026-05-04'`;

console.log("═══ ANTES ═══");
console.log("  saldo caja efectivo:", r2(await caja()));
console.log("\n── Egresos que pasarán a 'socio' (siguen contando como costo) ──");
for (const [,m,d] of A_SOCIO) console.log(`   ${String(r2(m)).padStart(8)}  ${d}`);
for (const e of egresosMayo) console.log(`   ${String(r2(e.amount)).padStart(8)}  may ${e.concept?.slice(0,40)}`);
const totSocio = A_SOCIO.reduce((s,x)=>s+x[1],0) + egresosMayo.reduce((s,x)=>s+ +x.amount,0);
console.log(`   ${String(r2(totSocio)).padStart(8)}  TOTAL aportado por Jahnn`);
console.log("\n── Ingresos que se retiran (no existieron) ──");
for (const [,m,d] of A_ARCHIVAR) console.log(`   ${String(r2(m)).padStart(8)}  ${d}`);
for (const i of ingresosMayo) console.log(`   ${String(r2(i.amount)).padStart(8)}  04-may ${i.note.slice(0,40)}`);

if (!APPLY) { console.log("\n[simulación] Añade --apply para ejecutar."); process.exit(0); }

const qs = [];
for (const [id] of A_SOCIO) qs.push(sql`UPDATE expenses SET payment_method='socio', notes=${NOTA} WHERE id=${id}`);
for (const e of egresosMayo) qs.push(sql`UPDATE expenses SET payment_method='socio', notes=${NOTA} WHERE id=${e.id}`);
for (const [id] of A_ARCHIVAR) qs.push(sql`UPDATE bank_income_items SET archived=true,
  note = COALESCE(note,'') || ' | RETIRADO 06-ago-2026: compensaba gastos que ahora figuran como aporte del socio' WHERE id=${id}`);
for (const i of ingresosMayo) qs.push(sql`UPDATE bank_income_items SET archived=true,
  note = COALESCE(note,'') || ' | RETIRADO 06-ago-2026: Kelly verificó que este dinero no salió de Fonavi ni Centro' WHERE id=${i.id}`);
await sql.transaction(qs);

console.log("\n═══ DESPUÉS ═══");
console.log("  saldo caja efectivo:", r2(await caja()));
const q = await sql`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0)::float AS t FROM expenses
  WHERE business_id=1 AND payment_method='socio' AND archived=false`;
console.log("  gastos marcados 'socio':", q[0].n, "| total:", r2(q[0].t));
