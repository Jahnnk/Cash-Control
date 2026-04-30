// Migración aditiva: agrega columna concept a shared_expense_rules.
// Llena las filas existentes con el nombre de la categoría como concept default.
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Migración: shared_expense_rules.concept …");

  // Pre: ¿ya existe la columna?
  const exists = (await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_expense_rules' AND column_name = 'concept'
  `) as { "?column?": number }[];

  if (exists.length === 0) {
    console.log("  Agregando columna concept (nullable temporal)…");
    await sql`ALTER TABLE shared_expense_rules ADD COLUMN concept TEXT`;
  } else {
    console.log("  Columna concept ya existe.");
  }

  // Llenar concept en filas existentes con el nombre de la categoría
  const updated = (await sql`
    UPDATE shared_expense_rules r
    SET concept = ec.name
    FROM expense_categories ec
    WHERE r.category_id = ec.id AND r.concept IS NULL
    RETURNING r.id
  `) as { id: string }[];
  console.log(`  Filas pobladas con concept default: ${updated.length}`);

  // Hacer NOT NULL si no lo es ya
  const notNull = (await sql`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'shared_expense_rules' AND column_name = 'concept'
  `) as { is_nullable: string }[];
  if (notNull[0]?.is_nullable === "YES") {
    await sql`ALTER TABLE shared_expense_rules ALTER COLUMN concept SET NOT NULL`;
    console.log("  Columna marcada NOT NULL.");
  }

  // Reemplazar índice único: de (category_id) a (category_id, concept)
  await sql`DROP INDEX IF EXISTS shared_expense_rules_active_cat`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS shared_expense_rules_active_cat_concept
    ON shared_expense_rules(category_id, concept) WHERE active = true
  `;
  console.log("  Índice único compuesto (category_id, concept) creado.");

  // Verificación final
  const rules = (await sql`
    SELECT r.id, ec.name as category, r.concept, r.atelier_percentage::float as ap, r.fonavi_percentage::float as fp, r.active
    FROM shared_expense_rules r
    JOIN expense_categories ec ON ec.id = r.category_id
    ORDER BY r.active DESC, ec.name, r.concept
  `) as { id: string; category: string; concept: string; ap: number; fp: number; active: boolean }[];

  console.log(`\n✅ Reglas existentes (${rules.length}):`);
  for (const r of rules) {
    console.log(`  [${r.active ? "ACT" : "off"}] ${r.category} · ${r.concept} (${r.ap}/${r.fp})`);
  }
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
