// Backup completo de la BD Neon en formato SQL.
// Solo lecturas (SELECT + information_schema). No modifica nada.
// Uso: npx tsx scripts/backup.ts

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL no está definida en .env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

type ColumnInfo = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
};

function buildCreateTable(table: string, cols: ColumnInfo[]): string {
  const lines = cols.map((c) => {
    let type = c.data_type;
    if (type === "character varying" && c.character_maximum_length) {
      type = `varchar(${c.character_maximum_length})`;
    } else if (type === "numeric" && c.numeric_precision !== null) {
      type = `numeric(${c.numeric_precision},${c.numeric_scale ?? 0})`;
    } else if (type === "timestamp without time zone") {
      type = "timestamp";
    } else if (type === "timestamp with time zone") {
      type = "timestamptz";
    }
    let line = `  ${quoteIdent(c.column_name)} ${type}`;
    if (c.column_default !== null) line += ` DEFAULT ${c.column_default}`;
    if (c.is_nullable === "NO") line += " NOT NULL";
    return line;
  });
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (\n${lines.join(",\n")}\n);`;
}

async function main() {
  console.log("Conectando a Neon…");

  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `) as { table_name: string }[];

  console.log(`Tablas encontradas: ${tables.length}`);

  const ts = timestamp();
  const backupDir = join(process.cwd(), "backups");
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  const filename = `backup-antes-edit-delete-${ts}.sql`;
  const filepath = join(backupDir, filename);

  const out: string[] = [];
  out.push(`-- ============================================================`);
  out.push(`-- Yayi's Cash Control — Backup completo`);
  out.push(`-- Generado: ${new Date().toISOString()}`);
  out.push(`-- Tablas: ${tables.length}`);
  out.push(`-- `);
  out.push(`-- COMO RESTAURAR:`);
  out.push(`--   1. Crear schema (Drizzle):  npm run db:setup`);
  out.push(`--      (las definiciones autoritativas viven en src/db/schema.ts)`);
  out.push(`--   2. Cargar data:             psql <DATABASE_URL> -f este_archivo.sql`);
  out.push(`--      (los CREATE TABLE de abajo son una segunda red de seguridad)`);
  out.push(`-- ============================================================`);
  out.push("");
  out.push("BEGIN;");
  out.push("");

  const counts: Record<string, number> = {};

  for (const { table_name } of tables) {
    console.log(`  → ${table_name}`);

    const cols = (await sql`
      SELECT column_name, data_type, is_nullable, column_default,
             character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table_name}
      ORDER BY ordinal_position
    `) as ColumnInfo[];

    out.push(`-- ----------------------------------------------------------`);
    out.push(`-- Tabla: ${table_name}`);
    out.push(`-- ----------------------------------------------------------`);
    out.push(buildCreateTable(table_name, cols));
    out.push("");

    const rows = (await sql.query(`SELECT * FROM ${quoteIdent(table_name)}`)) as Record<string, unknown>[];
    counts[table_name] = rows.length;

    if (rows.length === 0) {
      out.push(`-- (sin registros)`);
      out.push("");
      continue;
    }

    const colNames = cols.map((c) => c.column_name);
    const colList = colNames.map(quoteIdent).join(", ");

    for (const row of rows) {
      const values = colNames.map((c) => literal(row[c])).join(", ");
      out.push(`INSERT INTO ${quoteIdent(table_name)} (${colList}) VALUES (${values});`);
    }
    out.push("");
  }

  out.push("COMMIT;");
  out.push("");

  writeFileSync(filepath, out.join("\n"), "utf8");

  const stats = statSync(filepath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const lines = out.length;

  console.log("");
  console.log("============================================================");
  console.log(`✅ Backup creado: backups/${filename}`);
  console.log(`✅ Tamaño: ${sizeMB} MB (${stats.size.toLocaleString()} bytes)`);
  console.log(`✅ Líneas: ${lines.toLocaleString()}`);
  console.log(`✅ Registros por tabla:`);
  for (const [t, n] of Object.entries(counts).sort()) {
    console.log(`     - ${t}: ${n.toLocaleString()}`);
  }
  console.log("============================================================");
}

main().catch((err) => {
  console.error("ERROR durante backup:", err);
  process.exit(1);
});
