import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("Creating tables...");

  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      payment_pattern TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id),
      date DATE NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      discount NUMERIC(10,2) NOT NULL DEFAULT 0,
      net_amount NUMERIC(10,2) NOT NULL,
      notes TEXT,
      is_collected BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS collections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id),
      date DATE NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      sale_id UUID REFERENCES sales(id),
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL,
      category TEXT NOT NULL,
      concept TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'transferencia',
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS bank_balance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL UNIQUE,
      opening_balance NUMERIC(10,2),
      closing_balance NUMERIC(10,2),
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      timestamp TIMESTAMP NOT NULL DEFAULT now(),
      action TEXT NOT NULL,
      record_id UUID NOT NULL,
      record_type TEXT NOT NULL,
      before_data JSONB NOT NULL,
      after_data JSONB,
      user_note TEXT,
      date_affected DATE NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS audit_log_record_idx ON audit_log(record_id, record_type)`;
  await sql`CREATE INDEX IF NOT EXISTS audit_log_date_idx   ON audit_log(date_affected)`;
  await sql`CREATE INDEX IF NOT EXISTS audit_log_ts_idx     ON audit_log(timestamp DESC)`;

  // Feature: gastos compartidos con Fonavi
  await sql`
    CREATE TABLE IF NOT EXISTS shared_expense_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID NOT NULL REFERENCES expense_categories(id),
      concept TEXT NOT NULL DEFAULT '',
      atelier_percentage NUMERIC(5,2) NOT NULL,
      fonavi_percentage  NUMERIC(5,2) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT pct_sums_100 CHECK (ROUND(atelier_percentage + fonavi_percentage, 2) = 100.00),
      CONSTRAINT pct_positive CHECK (atelier_percentage >= 0 AND fonavi_percentage >= 0)
    )
  `;
  await sql`ALTER TABLE shared_expense_rules ADD COLUMN IF NOT EXISTS concept TEXT`;
  await sql`UPDATE shared_expense_rules r SET concept = ec.name FROM expense_categories ec WHERE r.category_id = ec.id AND r.concept IS NULL`;
  await sql`ALTER TABLE shared_expense_rules ALTER COLUMN concept SET NOT NULL`;
  await sql`DROP INDEX IF EXISTS shared_expense_rules_active_cat`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS shared_expense_rules_active_cat_concept ON shared_expense_rules(category_id, concept) WHERE active = true`;

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

  // EBITDA: flag por categoría para excluir del cálculo operativo
  await sql`ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS exclude_from_ebitda BOOLEAN NOT NULL DEFAULT false`;

  console.log("All tables created successfully!");
}

migrate().catch(console.error);
