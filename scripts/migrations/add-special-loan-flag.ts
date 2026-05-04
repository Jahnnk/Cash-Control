/**
 * Mini-feature "Préstamos del socio":
 *
 * Cuando Jahnn presta dinero personal a Atelier para liquidez (caso aislado),
 * estos movimientos NO deben mezclarse con la operación normal del negocio:
 *   - NO suman a ingresos del mes ni a EBITDA
 *   - NO aparecen en reportes por categoría ni presupuesto
 *   - NO aparecen en la vista Grupo
 *   - SÍ aparecen en página dedicada /atelier/prestamos-socio
 *   - SÍ se ven en feed de movimientos del día (con badge especial)
 *   - SÍ aparecen en auditoría completa
 *
 * Esta migración añade flag `is_special_loan` en 3 tablas para poder
 * filtrarlos en queries operativos. También crea la categoría especial
 * "Préstamos del socio" en Atelier (business_id=1).
 *
 * Idempotente: ADD COLUMN IF NOT EXISTS y INSERT ... ON CONFLICT DO NOTHING.
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const ATELIER_ID = 1;
const LOAN_CATEGORY = "Préstamos del socio";

async function columnExists(table: string, col: string): Promise<boolean> {
  const r = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${col}
  `;
  return (r as unknown[]).length > 0;
}

async function main() {
  // 1. expense_categories.is_special_loan
  if (await columnExists("expense_categories", "is_special_loan")) {
    console.log("· expense_categories.is_special_loan ya existe");
  } else {
    console.log("→ ADD COLUMN expense_categories.is_special_loan");
    await sql.query(
      `ALTER TABLE expense_categories ADD COLUMN is_special_loan BOOLEAN DEFAULT false NOT NULL`
    );
  }

  // 2. expenses.is_special_loan (espejo de la categoría — denormalizado para filtros rápidos)
  if (await columnExists("expenses", "is_special_loan")) {
    console.log("· expenses.is_special_loan ya existe");
  } else {
    console.log("→ ADD COLUMN expenses.is_special_loan");
    await sql.query(
      `ALTER TABLE expenses ADD COLUMN is_special_loan BOOLEAN DEFAULT false NOT NULL`
    );
  }

  // 3. bank_income_items.is_special_loan (para devoluciones del socio)
  if (await columnExists("bank_income_items", "is_special_loan")) {
    console.log("· bank_income_items.is_special_loan ya existe");
  } else {
    console.log("→ ADD COLUMN bank_income_items.is_special_loan");
    await sql.query(
      `ALTER TABLE bank_income_items ADD COLUMN is_special_loan BOOLEAN DEFAULT false NOT NULL`
    );
  }

  // 4. Seed categoría "Préstamos del socio" en Atelier
  const existingCat = await sql`
    SELECT id, is_special_loan FROM expense_categories
    WHERE business_id = ${ATELIER_ID} AND name = ${LOAN_CATEGORY}
  `;

  if ((existingCat as unknown[]).length === 0) {
    console.log(`→ INSERT categoría "${LOAN_CATEGORY}" en Atelier`);
    await sql`
      INSERT INTO expense_categories (business_id, name, is_active, sort_order, exclude_from_ebitda, is_special_loan)
      VALUES (${ATELIER_ID}, ${LOAN_CATEGORY}, true, 999, true, true)
    `;
  } else {
    const cat = (existingCat as { id: string; is_special_loan: boolean }[])[0];
    if (!cat.is_special_loan) {
      console.log(`→ UPDATE categoría existente "${LOAN_CATEGORY}" — set is_special_loan=true, exclude_from_ebitda=true`);
      await sql`
        UPDATE expense_categories
        SET is_special_loan = true, exclude_from_ebitda = true
        WHERE id = ${cat.id}
      `;
    } else {
      console.log(`· categoría "${LOAN_CATEGORY}" ya existe con flags correctos`);
    }
  }

  // 5. Reconciliar gastos existentes con la categoría: si hay algún
  //    expense en Atelier con category="Préstamos del socio", marcarlo.
  const reconcileExp = await sql.query(
    `UPDATE expenses SET is_special_loan = true
     WHERE business_id = $1 AND category = $2 AND is_special_loan = false`,
    [ATELIER_ID, LOAN_CATEGORY]
  );
  console.log(`· reconcile expenses: ${(reconcileExp as { rowCount?: number }).rowCount ?? 0} filas`);

  console.log("\n✅ Migración completada.");
}

main().catch((e) => { console.error("\n❌ ERROR:", e.message); process.exit(1); });
