/**
 * Smoke read-only: reproduce el cálculo de la tarjeta "Punto de
 * equilibrio del mes" por sede (mismas queries del action + motor puro).
 * Uso: npx tsx scripts/_smoke-breakeven.ts [YYYY-MM]
 */
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { buildFixedVariable } from "../src/lib/fixed-variable";
import { computeBreakeven, type BreakevenReference } from "../src/lib/breakeven";

const env = readFileSync(".env.local", "utf8");
const dbUrl = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!dbUrl) throw new Error("Sin DATABASE_URL");
const sql = neon(dbUrl);

const SEDES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

async function monthData(bId: number, month: string) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = `${month}-01`;
  const end = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const sales = (await sql`
    SELECT COALESCE(
      NULLIF((SELECT SUM(total)::float FROM byte_sales_daily WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}), 0),
      NULLIF((SELECT SUM(byte_total)::float FROM daily_records WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end} AND archived = false), 0),
      NULLIF((SELECT SUM(revenue)::float FROM upselling_daily WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}), 0),
      0) AS total
  `) as { total: number }[];
  const rows = (await sql`
    SELECT category, (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS amount
    FROM expenses
    WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end}
      AND is_special_loan = false AND is_internal_transfer = false AND archived = false
      AND payment_method <> 'pendiente_atelier'
  `) as { category: string; amount: number }[];
  const cats = (await sql`
    SELECT name, exclude_from_ebitda, cost_group FROM expense_categories WHERE business_id = ${bId}
  `) as { name: string; exclude_from_ebitda: boolean; cost_group: string | null }[];
  const fv = buildFixedVariable(
    rows.map((r) => ({ category: r.category, amount: Number(r.amount) })),
    cats.map((c) => ({ name: c.name, excludeFromEbitda: c.exclude_from_ebitda, costGroup: c.cost_group })),
  );
  return {
    ventas: sales[0]?.total ?? 0,
    fijos: fv.fijo.total,
    variables: fv.variable.total,
    sinClasificar: fv.sinClasificar.total,
  };
}

/** Misma regla del action: hasta 3 meses cerrados con fijos y ventas. */
async function buildReference(bId: number, month: string): Promise<BreakevenReference | null> {
  const [y, m] = month.split("-").map(Number);
  const candidates: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    candidates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const rows = await Promise.all(candidates.map(async (c) => ({ month: c, ...(await monthData(bId, c)) })));
  const usable = rows.filter((r) => r.fijos > 0 && r.ventas > 0).slice(0, 3);
  if (usable.length === 0) return null;
  const sumVar = usable.reduce((s, r) => s + r.variables, 0);
  const sumVen = usable.reduce((s, r) => s + r.ventas, 0);
  return {
    fijos: usable.reduce((s, r) => s + r.fijos, 0) / usable.length,
    varRatio: sumVen > 0 ? sumVar / sumVen : 0,
    monthsUsed: usable.map((r) => r.month).sort(),
  };
}

async function main() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const month = process.argv[2] ?? today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = month === today.slice(0, 7);
  const daysElapsed = isCurrent ? Number(today.slice(8, 10)) : daysInMonth;

  console.log(`\nPunto de equilibrio · ${month} (día ${daysElapsed}/${daysInMonth})${isCurrent ? " · MES EN CURSO (referencia histórica)" : ""}\n`);

  for (const bId of [1, 2, 3]) {
    const data = await monthData(bId, month);
    const reference = isCurrent ? await buildReference(bId, month) : null;
    const r = computeBreakeven({ ...data, daysElapsed, daysInMonth, reference: reference ?? undefined });
    console.log(`── ${SEDES[bId]} ──`);
    console.log(`   ventas S/${r.ventas.toFixed(2)} · fijos S/${r.fijos.toFixed(2)}${r.referenceMonths ? ` (ref ${r.referenceMonths.join(",")})` : ""} · variables ${r.varRatio !== null ? Math.round(r.varRatio * 100) + "%" : "—"} · sin clasificar S/${r.sinClasificar.toFixed(2)}`);
    console.log(`   punto de equilibrio: ${r.breakEven !== null ? "S/" + r.breakEven.toFixed(2) : "—"} · avance ${r.avancePct ?? "—"}% · estado ${r.estado}${r.diaEstimadoCruce ? ` · cruce día ${r.diaEstimadoCruce}` : ""}${r.ventasProyectadas !== null ? ` · proyección S/${r.ventasProyectadas.toFixed(2)}` : ""}`);
    for (const w of r.warnings) console.log(`   ⚠ ${w}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
