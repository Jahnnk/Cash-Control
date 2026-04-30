// Migración aislada para feature gastos compartidos.
// 100% aditiva: CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS.
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Creando tablas y columnas para feature gastos compartidos…");

  await sql`
    CREATE TABLE IF NOT EXISTS shared_expense_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID NOT NULL REFERENCES expense_categories(id),
      atelier_percentage NUMERIC(5,2) NOT NULL,
      fonavi_percentage  NUMERIC(5,2) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT pct_sums_100 CHECK (ROUND(atelier_percentage + fonavi_percentage, 2) = 100.00),
      CONSTRAINT pct_positive CHECK (atelier_percentage >= 0 AND fonavi_percentage >= 0)
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS shared_expense_rules_active_cat
      ON shared_expense_rules(category_id) WHERE active = true
  `;

  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_shared        BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS shared_rule_id   UUID REFERENCES shared_expense_rules(id)`;
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS atelier_amount   NUMERIC(10,2)`;
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS fonavi_amount    NUMERIC(10,2)`;

  await sql`
    CREATE TABLE IF NOT EXISTS fonavi_receivables (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      amount_due       NUMERIC(10,2) NOT NULL,
      amount_collected NUMERIC(10,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at  TIMESTAMP NOT NULL DEFAULT now(),
      collected_at TIMESTAMP,
      CONSTRAINT receivable_status CHECK (status IN ('pending','partial','collected'))
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS fonavi_receivables_status_idx ON fonavi_receivables(status)`;
  await sql`CREATE INDEX IF NOT EXISTS fonavi_receivables_expense_idx ON fonavi_receivables(expense_id)`;

  await sql`ALTER TABLE bank_income_items ADD COLUMN IF NOT EXISTS is_fonavi_reimbursement BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE bank_income_items ADD COLUMN IF NOT EXISTS receivable_id UUID REFERENCES fonavi_receivables(id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS fonavi_reimbursement_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      income_item_id UUID NOT NULL REFERENCES bank_income_items(id) ON DELETE CASCADE,
      receivable_id  UUID NOT NULL REFERENCES fonavi_receivables(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS allocations_income_idx ON fonavi_reimbursement_allocations(income_item_id)`;
  await sql`CREATE INDEX IF NOT EXISTS allocations_receivable_idx ON fonavi_reimbursement_allocations(receivable_id)`;

  // Verificación
  const cols = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name IN ('is_shared','shared_rule_id','atelier_amount','fonavi_amount')
  `) as { column_name: string }[];
  console.log(`✅ Columnas en expenses: ${cols.map(c => c.column_name).join(", ")}`);

  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('shared_expense_rules','fonavi_receivables','fonavi_reimbursement_allocations')
  `) as { table_name: string }[];
  console.log(`✅ Tablas nuevas: ${tables.map(t => t.table_name).join(", ")}`);

  const counts = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM shared_expense_rules) as rules,
      (SELECT COUNT(*)::int FROM fonavi_receivables) as receivables,
      (SELECT COUNT(*)::int FROM fonavi_reimbursement_allocations) as allocations
  `) as { rules: number; receivables: number; allocations: number }[];
  console.log(`✅ Filas iniciales: rules=${counts[0].rules}, receivables=${counts[0].receivables}, allocations=${counts[0].allocations}`);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
