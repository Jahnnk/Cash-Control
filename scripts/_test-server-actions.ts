// Pruebas integradas de las server actions de edición/eliminación.
// Mockea revalidatePath y ejecuta acciones contra BD real, revirtiendo siempre al estado original.
// Uso: npx tsx scripts/_test-server-actions.ts

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Mock de revalidatePath de Next (no aplicable fuera del runtime Next)
import Module from "module";
const originalResolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename;
const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load = function (request: string, ...rest: unknown[]) {
  if (request === "next/cache") {
    return { revalidatePath: () => {}, revalidateTag: () => {} };
  }
  return originalLoad.call(this, request, ...rest);
};
void originalResolve;

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const TEST_EXPENSE_ID = "0eb43ab3-7255-4d71-a1ac-2acbd5ec631c"; // ITF 23-abr S/0.05 transferencia
const TEST_DATE = "2026-04-23";

function fmt(o: unknown) { return JSON.stringify(o, null, 2); }

async function getDaily(date: string) {
  const r = await sql`SELECT date::text as date, bank_income::float, bank_expense::float, bank_balance_real::float FROM daily_records WHERE date = ${date}`;
  return r[0];
}

async function getExpense(id: string) {
  const r = await sql`SELECT id, date::text as date, amount::float, category, concept, payment_method, notes FROM expenses WHERE id = ${id}`;
  return r[0];
}

async function auditFor(id: string) {
  const r = await sql`SELECT action, record_type, before_data, after_data, date_affected::text as date_affected FROM audit_log WHERE record_id = ${id} ORDER BY timestamp DESC`;
  return r;
}

async function main() {
  console.log("===========================================");
  console.log("PRUEBAS SERVER ACTIONS — record-edits");
  console.log("===========================================\n");

  const { updateExpense, deleteExpense } = await import("../src/app/actions/record-edits");

  // ESTADO INICIAL
  const initialExpense = await getExpense(TEST_EXPENSE_ID);
  const initialDaily = await getDaily(TEST_DATE);
  console.log("Estado inicial:");
  console.log("  Expense:", fmt(initialExpense));
  console.log("  Daily:", fmt(initialDaily));
  console.log("");

  if (!initialExpense) {
    console.error("FATAL: registro de prueba no existe");
    process.exit(1);
  }

  const ORIGINAL_AMOUNT = initialExpense.amount as number;
  const ORIGINAL_CATEGORY = initialExpense.category as string;
  const ORIGINAL_CONCEPT = initialExpense.concept as string;
  const ORIGINAL_METHOD = initialExpense.payment_method as string;
  const ORIGINAL_NOTES = initialExpense.notes as string | null;
  const ORIGINAL_BANK_EXPENSE = initialDaily.bank_expense as number;
  const ORIGINAL_BANK_BALANCE = initialDaily.bank_balance_real as number;

  // ─────────────────────────────────────────────
  // P1: Edit de monto (0.05 → 100)
  // ─────────────────────────────────────────────
  console.log("P1 — Edit de monto (0.05 → 100)");
  const r1 = await updateExpense(TEST_EXPENSE_ID, {
    amount: 100,
    category: ORIGINAL_CATEGORY,
    concept: ORIGINAL_CONCEPT,
    paymentMethod: ORIGINAL_METHOD,
    notes: ORIGINAL_NOTES,
  });
  if (!r1.success) { console.error("  ❌ FALLÓ:", r1.error); process.exit(1); }
  const after1 = await getExpense(TEST_EXPENSE_ID);
  const daily1 = await getDaily(TEST_DATE);
  const expectedExpense = ORIGINAL_BANK_EXPENSE + (100 - ORIGINAL_AMOUNT);
  const expectedBalance = ORIGINAL_BANK_BALANCE - (100 - ORIGINAL_AMOUNT);
  const ok1a = after1.amount === 100;
  const ok1b = Math.abs((daily1.bank_expense as number) - expectedExpense) < 0.01;
  const ok1c = Math.abs((daily1.bank_balance_real as number) - expectedBalance) < 0.01;
  console.log(`  ${ok1a ? "✅" : "❌"} amount = 100 (got ${after1.amount})`);
  console.log(`  ${ok1b ? "✅" : "❌"} bank_expense = ${expectedExpense.toFixed(2)} (got ${daily1.bank_expense})`);
  console.log(`  ${ok1c ? "✅" : "❌"} bank_balance_real = ${expectedBalance.toFixed(2)} (got ${daily1.bank_balance_real})`);
  if (!(ok1a && ok1b && ok1c)) { console.error("REVIRTIENDO Y ABORTANDO..."); }

  // ─────────────────────────────────────────────
  // P2: Edit de categoría (sin cambio de monto)
  // ─────────────────────────────────────────────
  console.log("\nP2 — Edit de categoría (Ss Bancarios → Otros)");
  const r2 = await updateExpense(TEST_EXPENSE_ID, {
    amount: 100,
    category: "Otros",
    concept: ORIGINAL_CONCEPT,
    paymentMethod: ORIGINAL_METHOD,
    notes: ORIGINAL_NOTES,
  });
  if (!r2.success) { console.error("  ❌ FALLÓ:", r2.error); }
  const after2 = await getExpense(TEST_EXPENSE_ID);
  const daily2 = await getDaily(TEST_DATE);
  const ok2a = after2.category === "Otros";
  const ok2b = (daily2.bank_expense as number) === (daily1.bank_expense as number); // sin cambio
  console.log(`  ${ok2a ? "✅" : "❌"} category = "Otros" (got "${after2.category}")`);
  console.log(`  ${ok2b ? "✅" : "❌"} bank_expense sin cambio (${daily2.bank_expense})`);

  // ─────────────────────────────────────────────
  // P3: Edit de método (transferencia → efectivo)
  // ─────────────────────────────────────────────
  console.log("\nP3 — Edit método (transferencia → efectivo): saldo banco debe excluir el monto");
  const r3 = await updateExpense(TEST_EXPENSE_ID, {
    amount: 100,
    category: "Otros",
    concept: ORIGINAL_CONCEPT,
    paymentMethod: "efectivo",
    notes: ORIGINAL_NOTES,
  });
  if (!r3.success) { console.error("  ❌ FALLÓ:", r3.error); }
  const after3 = await getExpense(TEST_EXPENSE_ID);
  const daily3 = await getDaily(TEST_DATE);
  const expectedExpense3 = ORIGINAL_BANK_EXPENSE - ORIGINAL_AMOUNT; // se sale del cómputo banco
  const expectedBalance3 = ORIGINAL_BANK_BALANCE + ORIGINAL_AMOUNT; // sube porque ya no descuenta
  const ok3a = after3.payment_method === "efectivo";
  const ok3b = Math.abs((daily3.bank_expense as number) - expectedExpense3) < 0.01;
  const ok3c = Math.abs((daily3.bank_balance_real as number) - expectedBalance3) < 0.01;
  console.log(`  ${ok3a ? "✅" : "❌"} payment_method = efectivo`);
  console.log(`  ${ok3b ? "✅" : "❌"} bank_expense = ${expectedExpense3.toFixed(2)} (got ${daily3.bank_expense})`);
  console.log(`  ${ok3c ? "✅" : "❌"} bank_balance_real = ${expectedBalance3.toFixed(2)} (got ${daily3.bank_balance_real})`);

  // ─────────────────────────────────────────────
  // P7: Validación monto 0
  // ─────────────────────────────────────────────
  console.log("\nP7 — Validación monto 0 (debe fallar sin tocar BD)");
  const r7 = await updateExpense(TEST_EXPENSE_ID, {
    amount: 0,
    category: ORIGINAL_CATEGORY,
    concept: ORIGINAL_CONCEPT,
    paymentMethod: ORIGINAL_METHOD,
    notes: ORIGINAL_NOTES,
  });
  console.log(`  ${!r7.success ? "✅" : "❌"} rechaza con error: ${!r7.success ? r7.error : "(no falló)"}`);

  console.log("\nP7b — Validación categoría vacía");
  const r7b = await updateExpense(TEST_EXPENSE_ID, {
    amount: 100,
    category: "",
    concept: ORIGINAL_CONCEPT,
    paymentMethod: ORIGINAL_METHOD,
    notes: ORIGINAL_NOTES,
  });
  console.log(`  ${!r7b.success ? "✅" : "❌"} rechaza con error: ${!r7b.success ? r7b.error : "(no falló)"}`);

  console.log("\nP7c — Validación payment_method inválido");
  const r7c = await updateExpense(TEST_EXPENSE_ID, {
    amount: 100,
    category: ORIGINAL_CATEGORY,
    concept: ORIGINAL_CONCEPT,
    paymentMethod: "bitcoin",
    notes: ORIGINAL_NOTES,
  });
  console.log(`  ${!r7c.success ? "✅" : "❌"} rechaza: ${!r7c.success ? r7c.error : "(no falló)"}`);

  console.log("\nP7d — Validación id que no existe");
  const r7d = await deleteExpense("00000000-0000-0000-0000-000000000000");
  console.log(`  ${!r7d.success ? "✅" : "❌"} rechaza: ${!r7d.success ? r7d.error : "(no falló)"}`);

  // ─────────────────────────────────────────────
  // REVERSIÓN A ESTADO ORIGINAL
  // ─────────────────────────────────────────────
  console.log("\n─────────────────");
  console.log("REVIRTIENDO al estado original…");
  const rRevert = await updateExpense(TEST_EXPENSE_ID, {
    amount: ORIGINAL_AMOUNT,
    category: ORIGINAL_CATEGORY,
    concept: ORIGINAL_CONCEPT,
    paymentMethod: ORIGINAL_METHOD,
    notes: ORIGINAL_NOTES,
  });
  if (!rRevert.success) { console.error("❌ FALLÓ EL REVERT:", rRevert.error); process.exit(1); }
  const finalExpense = await getExpense(TEST_EXPENSE_ID);
  const finalDaily = await getDaily(TEST_DATE);
  const reverted =
    finalExpense.amount === ORIGINAL_AMOUNT &&
    finalExpense.category === ORIGINAL_CATEGORY &&
    finalExpense.payment_method === ORIGINAL_METHOD &&
    Math.abs((finalDaily.bank_expense as number) - ORIGINAL_BANK_EXPENSE) < 0.01 &&
    Math.abs((finalDaily.bank_balance_real as number) - ORIGINAL_BANK_BALANCE) < 0.01;
  console.log(`${reverted ? "✅" : "❌"} estado original restaurado`);
  console.log(`  Final expense:`, fmt(finalExpense));
  console.log(`  Final daily:  `, fmt(finalDaily));

  // ─────────────────────────────────────────────
  // AUDIT LOG
  // ─────────────────────────────────────────────
  console.log("\n─────────────────");
  console.log("AUDIT LOG generado por las pruebas:");
  const audits = await auditFor(TEST_EXPENSE_ID);
  console.log(`  Entradas: ${audits.length}`);
  for (const [i, a] of audits.entries()) {
    console.log(`  [${i + 1}] ${a.action} — before.amount=${(a.before_data as Record<string, unknown>).amount}, after.amount=${(a.after_data as Record<string, unknown> | null)?.amount ?? "(null)"}`);
  }

  console.log("\n===========================================");
  console.log("PRUEBAS TERMINADAS");
  console.log("===========================================");
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
