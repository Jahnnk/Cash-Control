/**
 * Ola 5 — Paso 2: agrega business_id INTEGER NOT NULL FK a las 6
 * tablas multi-tenant. Asigna business_id=1 (Atelier) a TODA la
 * data existente.
 *
 * Patrón por tabla:
 *   1. ADD COLUMN business_id INTEGER (nullable)
 *   2. UPDATE SET business_id = 1 WHERE business_id IS NULL
 *   3. Verificar count NULL = 0
 *   4. ALTER COLUMN ... SET NOT NULL
 *   5. ADD CONSTRAINT FK businesses(id)
 *   6. CREATE INDEX idx_<table>_business_id
 *   7. (si aplica) drop UNIQUE viejo, crear UNIQUE compuesto con business_id
 *
 * Idempotente: si la columna ya existe se salta la creación; los
 * UPDATEs son seguros (no-op cuando ya están seteados).
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

type TableMigration = {
  table: string;
  /** Constraints UNIQUE existentes a reemplazar por compuesto con business_id. */
  uniquesToReplace?: Array<{
    /** Columnas del UNIQUE actual (sin business_id). */
    cols: string[];
    /** Nombre del constraint actual a hacer DROP. */
    oldConstraintName: string;
    /** Nombre del nuevo constraint compuesto. */
    newConstraintName: string;
  }>;
};

const TABLES: TableMigration[] = [
  {
    table: "daily_records",
    uniquesToReplace: [
      {
        cols: ["date"],
        oldConstraintName: "daily_records_date_unique",
        newConstraintName: "daily_records_business_date_unique",
      },
    ],
  },
  { table: "expenses" },
  { table: "bank_income_items" },
  {
    table: "expense_categories",
    uniquesToReplace: [
      {
        cols: ["name"],
        oldConstraintName: "expense_categories_name_unique",
        newConstraintName: "expense_categories_business_name_unique",
      },
    ],
  },
  {
    table: "budgets",
    uniquesToReplace: [
      {
        cols: ["category_name"],
        oldConstraintName: "budgets_category_name_unique",
        newConstraintName: "budgets_business_category_unique",
      },
    ],
  },
  { table: "audit_log" },
];

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

async function findUniqueConstraint(table: string, cols: string[]): Promise<string | null> {
  // Busca un UNIQUE en table que tenga exactamente las columnas dadas.
  const r = await sql`
    SELECT tc.constraint_name, ARRAY_AGG(kcu.column_name ORDER BY kcu.ordinal_position) AS cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu USING (constraint_name)
    WHERE tc.table_schema = 'public'
      AND tc.table_name = ${table}
      AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
  `;
  for (const row of r as Array<{ constraint_name: string; cols: string[] }>) {
    if (row.cols.length === cols.length && row.cols.every((c, i) => c === cols[i])) {
      return row.constraint_name;
    }
  }
  return null;
}

async function indexExists(name: string): Promise<boolean> {
  const r = await sql`SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name}`;
  return (r as unknown[]).length > 0;
}

async function migrateTable(m: TableMigration) {
  const { table } = m;
  console.log(`\n═══ ${table} ═══`);

  // 1. ADD COLUMN si no existe
  if (await columnExists(table, "business_id")) {
    console.log(`  · business_id ya existe, salto ADD COLUMN`);
  } else {
    console.log(`  → ADD COLUMN business_id INTEGER`);
    await sql.query(`ALTER TABLE ${table} ADD COLUMN business_id INTEGER`);
  }

  // 2. UPDATE filas con NULL → 1 (Atelier)
  const nullsBefore = await sql.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE business_id IS NULL`);
  const cntBefore = (nullsBefore as Array<{ n: number }>)[0].n;
  if (cntBefore > 0) {
    console.log(`  → UPDATE ${cntBefore} filas con business_id NULL → 1`);
    await sql.query(`UPDATE ${table} SET business_id = 1 WHERE business_id IS NULL`);
  } else {
    console.log(`  · 0 filas con NULL, salto UPDATE`);
  }

  // 3. Verificación: 0 NULL
  const nullsAfter = await sql.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE business_id IS NULL`);
  const cntAfter = (nullsAfter as Array<{ n: number }>)[0].n;
  if (cntAfter !== 0) {
    throw new Error(`${table}: ${cntAfter} filas siguen con business_id NULL después del UPDATE. ABORTANDO.`);
  }

  // 4. SET NOT NULL (idempotente)
  console.log(`  → SET NOT NULL`);
  await sql.query(`ALTER TABLE ${table} ALTER COLUMN business_id SET NOT NULL`);

  // 5. FK constraint
  const fkName = `${table}_business_id_fk`;
  if (await constraintExists(fkName)) {
    console.log(`  · FK ${fkName} ya existe`);
  } else {
    console.log(`  → ADD CONSTRAINT FK ${fkName}`);
    await sql.query(`
      ALTER TABLE ${table}
      ADD CONSTRAINT ${fkName}
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    `);
  }

  // 6. Index para queries por business_id
  const idxName = `idx_${table}_business_id`;
  if (await indexExists(idxName)) {
    console.log(`  · index ${idxName} ya existe`);
  } else {
    console.log(`  → CREATE INDEX ${idxName}`);
    await sql.query(`CREATE INDEX ${idxName} ON ${table}(business_id)`);
  }

  // 7. UNIQUEs compuestos: drop viejo + crear nuevo
  if (m.uniquesToReplace) {
    for (const u of m.uniquesToReplace) {
      // Detectar el nombre real del UNIQUE viejo (Drizzle suele crearlo con sufijo _unique)
      const detected = await findUniqueConstraint(table, u.cols);
      if (detected) {
        console.log(`  → DROP CONSTRAINT ${detected} (UNIQUE sobre ${u.cols.join(", ")})`);
        await sql.query(`ALTER TABLE ${table} DROP CONSTRAINT "${detected}"`);
      } else {
        console.log(`  · UNIQUE simple ${u.cols.join(", ")} no encontrado (ya removido?)`);
      }

      if (await constraintExists(u.newConstraintName)) {
        console.log(`  · UNIQUE compuesto ${u.newConstraintName} ya existe`);
      } else {
        const newCols = ["business_id", ...u.cols];
        console.log(`  → ADD CONSTRAINT ${u.newConstraintName} UNIQUE(${newCols.join(", ")})`);
        await sql.query(`
          ALTER TABLE ${table}
          ADD CONSTRAINT ${u.newConstraintName}
          UNIQUE (${newCols.join(", ")})
        `);
      }
    }
  }
}

async function main() {
  console.log("Ola 5 — Paso 2: agregar business_id a 6 tablas multi-tenant\n");

  for (const m of TABLES) {
    await migrateTable(m);
  }

  console.log("\n═══ Verificación final ═══");
  for (const m of TABLES) {
    const r = await sql.query(`
      SELECT business_id, COUNT(*)::int AS n
      FROM ${m.table}
      GROUP BY business_id
      ORDER BY business_id
    `);
    const rows = r as Array<{ business_id: number; n: number }>;
    const total = rows.reduce((s, x) => s + x.n, 0);
    const breakdown = rows.map((x) => `business_id=${x.business_id}: ${x.n}`).join(", ");
    console.log(`  ${m.table.padEnd(20)} total=${total}  →  ${breakdown || "(sin filas)"}`);
  }

  console.log("\n✅ Migración Paso 2 completada sin errores.");
}

main().catch((e) => { console.error("\n❌ ERROR:", e.message); process.exit(1); });
