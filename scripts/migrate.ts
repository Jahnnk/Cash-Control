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

  console.log("All tables created successfully!");
}

migrate().catch(console.error);
