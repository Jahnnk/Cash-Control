// Capa 3 — Walk-through día por día. Solo lectura.
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const SALDO_INICIAL_31_MAR = 4050.32;

function fmt(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return sign + "S/ " + abs.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  console.log("===== CAPA 3: Walk-through día por día =====\n");

  // 3.A — Lista de fechas con datos en daily_records
  const dates = (await sql`
    SELECT date::text as date,
           COALESCE(bank_balance_real::float, 0) as stored_balance,
           bank_balance_real IS NOT NULL as has_stored
    FROM daily_records
    ORDER BY date ASC
  `) as { date: string; stored_balance: number; has_stored: boolean }[];

  console.log(`Filas en daily_records: ${dates.length}\n`);

  console.log("| Fecha       | Ingresos    | Egresos no-ef | Calculado    | Guardado     | Diferencia    | Estado |");
  console.log("|-------------|-------------|---------------|--------------|--------------|---------------|--------|");

  let runningCalc = SALDO_INICIAL_31_MAR;
  const desfases: { date: string; calc: number; stored: number; delta: number }[] = [];
  let firstDesfaseDate: string | null = null;

  for (const d of dates) {
    const inc = (await sql`SELECT COALESCE(SUM(amount), 0)::float as t FROM bank_income_items WHERE date = ${d.date}`) as { t: number }[];
    const expBank = (await sql`SELECT COALESCE(SUM(amount), 0)::float as t FROM expenses WHERE date = ${d.date} AND payment_method != 'efectivo'`) as { t: number }[];

    const incTotal = inc[0].t;
    const expTotal = expBank[0].t;
    runningCalc = Math.round((runningCalc + incTotal - expTotal) * 100) / 100;
    const diff = d.has_stored ? Math.round((d.stored_balance - runningCalc) * 100) / 100 : NaN;

    let status = "✅ OK";
    if (!d.has_stored) {
      status = "— sin saldo";
    } else if (Math.abs(diff) >= 100) {
      status = "🔴 Crítico";
    } else if (Math.abs(diff) >= 0.01) {
      status = "⚠️ Desfase";
    }

    if (d.has_stored && Math.abs(diff) >= 0.01) {
      desfases.push({ date: d.date, calc: runningCalc, stored: d.stored_balance, delta: diff });
      if (firstDesfaseDate === null) firstDesfaseDate = d.date;
    }

    const dStr = d.date.padEnd(11);
    const incStr = fmt(incTotal).padStart(11);
    const expStr = fmt(expTotal).padStart(13);
    const calcStr = fmt(runningCalc).padStart(12);
    const storStr = (d.has_stored ? fmt(d.stored_balance) : "—").padStart(12);
    const diffStr = (d.has_stored ? fmt(diff) : "—").padStart(13);
    console.log(`| ${dStr} | ${incStr} | ${expStr} | ${calcStr} | ${storStr} | ${diffStr} | ${status} |`);
  }

  console.log("");
  console.log(`Días con desfase: ${desfases.length}`);
  console.log(`Primer día con desfase: ${firstDesfaseDate ?? "ninguno"}`);

  // 3.B — Análisis de progresión
  if (desfases.length > 0) {
    console.log("\n--- Progresión del desfase ---");
    let prevDelta = 0;
    for (const d of desfases) {
      const change = d.delta - prevDelta;
      const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "=";
      console.log(`  ${d.date}: delta=${fmt(d.delta)}  cambio=${fmt(change)} ${arrow}`);
      prevDelta = d.delta;
    }
  }

  // 3.C — Audit log: cruzar con días desfasados
  console.log("\n===== Audit log (excluyendo pruebas) =====");
  const audits = (await sql`
    SELECT
      timestamp::text as ts,
      action,
      record_type,
      date_affected::text as date_affected,
      (before_data->>'amount')::text as before_amount,
      (after_data->>'amount')::text as after_amount,
      (before_data->>'payment_method')::text as before_method,
      (after_data->>'payment_method')::text as after_method,
      user_note
    FROM audit_log
    WHERE user_note IS NULL OR user_note NOT LIKE '%prueba%'
    ORDER BY timestamp ASC
  `) as Record<string, unknown>[];

  console.log(`Entradas operativas (no de prueba): ${audits.length}`);
  for (const a of audits) {
    console.log(`  ${a.ts} | ${a.action} ${a.record_type} | fecha_afectada=${a.date_affected} | ${a.before_amount} → ${a.after_amount}`);
  }

  // 3.D — Detalle de egresos en efectivo
  console.log("\n===== Egresos en efectivo (S/298.00 total) =====");
  const cash = (await sql`
    SELECT date::text as date, amount::float as amount, category, concept, created_at::text as created_at
    FROM expenses
    WHERE payment_method = 'efectivo'
    ORDER BY date ASC
  `) as Record<string, unknown>[];
  for (const c of cash) {
    console.log(`  ${c.date} | ${fmt(c.amount as number)} | ${c.category} · ${c.concept}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
