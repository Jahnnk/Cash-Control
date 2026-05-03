/**
 * CAMBIO 7.5 — agrega columnas de trazabilidad para gastos compartidos
 * auto-mirror en `expenses`:
 *
 *   linked_atelier_expense_id  → uuid, nullable, FK a expenses(id)
 *      (en el lado Fonavi: apunta al gasto padre en Atelier)
 *
 *   linked_receivable_id       → uuid, nullable, FK a fonavi_receivables(id)
 *      (en el lado Fonavi: apunta a la cuenta por cobrar correspondiente)
 *
 * Ambas columnas son NULL en gastos normales. Solo se llenan en los
 * gastos-espejo creados automáticamente por createExpense() de Atelier
 * cuando is_shared=true.
 *
 * Ningún registro existente se ve afectado (las columnas nacen NULL).
 *
 * Idempotente: ADD COLUMN IF NOT EXISTS y ADD CONSTRAINT con catch.
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function columnExists(table: string, col: string): Promise<boolean> {
  const r = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${col}
  `;
  return (r as unknown[]).length > 0;
}

async function constraintExists(name: string): Promise<boolean> {
  const r = await sql`
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_name = ${name}
  `;
  return (r as unknown[]).length > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const r = await sql`SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name}`;
  return (r as unknown[]).length > 0;
}

async function main() {
  // 1. ADD COLUMN linked_atelier_expense_id
  if (await columnExists("expenses", "linked_atelier_expense_id")) {
    console.log("· linked_atelier_expense_id ya existe");
  } else {
    console.log("→ ADD COLUMN linked_atelier_expense_id UUID");
    await sql.query(`ALTER TABLE expenses ADD COLUMN linked_atelier_expense_id UUID`);
  }

  // 2. ADD COLUMN linked_receivable_id
  if (await columnExists("expenses", "linked_receivable_id")) {
    console.log("· linked_receivable_id ya existe");
  } else {
    console.log("→ ADD COLUMN linked_receivable_id UUID");
    await sql.query(`ALTER TABLE expenses ADD COLUMN linked_receivable_id UUID`);
  }

  // 3. FK a expenses(id)
  const fkAtelier = "expenses_linked_atelier_expense_fk";
  if (await constraintExists(fkAtelier)) {
    console.log(`· FK ${fkAtelier} ya existe`);
  } else {
    console.log(`→ ADD CONSTRAINT FK ${fkAtelier}`);
    await sql.query(`
      ALTER TABLE expenses
      ADD CONSTRAINT ${fkAtelier}
      FOREIGN KEY (linked_atelier_expense_id) REFERENCES expenses(id) ON DELETE SET NULL
    `);
  }

  // 4. FK a fonavi_receivables(id)
  const fkRec = "expenses_linked_receivable_fk";
  if (await constraintExists(fkRec)) {
    console.log(`· FK ${fkRec} ya existe`);
  } else {
    console.log(`→ ADD CONSTRAINT FK ${fkRec}`);
    await sql.query(`
      ALTER TABLE expenses
      ADD CONSTRAINT ${fkRec}
      FOREIGN KEY (linked_receivable_id) REFERENCES fonavi_receivables(id) ON DELETE SET NULL
    `);
  }

  // 5. Índices para lookups del flujo de reembolso
  const idx1 = "idx_expenses_linked_receivable";
  if (await indexExists(idx1)) {
    console.log(`· index ${idx1} ya existe`);
  } else {
    console.log(`→ CREATE INDEX ${idx1}`);
    await sql.query(`CREATE INDEX ${idx1} ON expenses(linked_receivable_id) WHERE linked_receivable_id IS NOT NULL`);
  }

  console.log("\n✅ Migración completada. 0 filas afectadas (todas nacen NULL).");
}

main().catch((e) => { console.error("\n❌ ERROR:", e.message); process.exit(1); });
