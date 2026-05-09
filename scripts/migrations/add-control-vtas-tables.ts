/**
 * Migración para Control de VTAS:
 *   - byte_sales_daily: ventas Byte por día (Efectivo/Yape/POS desde Cuentas)
 *   - tips_pending: propinas pendientes de pagar
 *   - rounding_alerts: alertas de diferencias QuipuPOS vs Cuentas no-propina
 *
 * Idempotente. Additiva. Backup: snapshot Neon "pre-reset-fonavi-centro-01-abril".
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

async function tableExists(name: string): Promise<boolean> {
  const r = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=${name}
  `;
  return (r as unknown[]).length > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const r = await sql`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=${name}`;
  return (r as unknown[]).length > 0;
}

async function main() {
  if (!(await tableExists("byte_sales_daily"))) {
    console.log("→ CREATE TABLE byte_sales_daily");
    await sql.query(`
      CREATE TABLE byte_sales_daily (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id INTEGER NOT NULL REFERENCES businesses(id),
        date DATE NOT NULL,
        efectivo NUMERIC(12,2) NOT NULL DEFAULT 0,
        yape_plin NUMERIC(12,2) NOT NULL DEFAULT 0,
        pos NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) GENERATED ALWAYS AS (efectivo + yape_plin + pos) STORED,
        imported_from_excel BOOLEAN NOT NULL DEFAULT false,
        import_batch_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (business_id, date)
      )
    `);
  } else console.log("· byte_sales_daily ya existe");

  if (!(await tableExists("tips_pending"))) {
    console.log("→ CREATE TABLE tips_pending");
    await sql.query(`
      CREATE TABLE tips_pending (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id INTEGER NOT NULL REFERENCES businesses(id),
        date DATE NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        source TEXT NOT NULL DEFAULT 'excel',
        source_concept TEXT,
        note_text TEXT,
        collaborator_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        paid_at DATE,
        paid_in_payroll_id UUID,
        imported_from_excel BOOLEAN NOT NULL DEFAULT false,
        import_batch_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  } else console.log("· tips_pending ya existe");

  if (!(await tableExists("rounding_alerts"))) {
    console.log("→ CREATE TABLE rounding_alerts");
    await sql.query(`
      CREATE TABLE rounding_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id INTEGER NOT NULL REFERENCES businesses(id),
        date DATE NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('yape_plin','pos')),
        amount_quipupos NUMERIC(12,2),
        amount_cuentas NUMERIC(12,2),
        difference NUMERIC(12,2) NOT NULL,
        note_text TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        resolved_note TEXT,
        resolved_at TIMESTAMPTZ,
        imported_from_excel BOOLEAN NOT NULL DEFAULT false,
        import_batch_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  } else console.log("· rounding_alerts ya existe");

  for (const [name, ddl] of [
    ["idx_byte_sales_business_date", `CREATE INDEX idx_byte_sales_business_date ON byte_sales_daily(business_id, date)`],
    ["idx_tips_business_status", `CREATE INDEX idx_tips_business_status ON tips_pending(business_id, status)`],
    ["idx_tips_business_date", `CREATE INDEX idx_tips_business_date ON tips_pending(business_id, date)`],
    ["idx_rounding_business_status", `CREATE INDEX idx_rounding_business_status ON rounding_alerts(business_id, status)`],
    ["idx_rounding_business_date", `CREATE INDEX idx_rounding_business_date ON rounding_alerts(business_id, date)`],
  ] as const) {
    if (await indexExists(name)) {
      console.log(`· index ${name} ya existe`);
    } else {
      console.log(`→ ${ddl}`);
      await sql.query(ddl);
    }
  }

  console.log("\n✅ Migración OK.");
}

main().catch((e) => { console.error("❌ ERROR:", e.message); process.exit(1); });
