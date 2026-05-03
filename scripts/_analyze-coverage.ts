import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

/**
 * Simula el cálculo de cobertura para los últimos 30 días con data y
 * reporta el % de días donde habría caído en el rango "relevante" (<90).
 *
 * Cobertura(día) = saldo_BCP_real(día) / promedio_diario_gasto_mtd(día)
 * Donde promedio_diario_gasto_mtd = sum(expenses del mes hasta el día) / dia_del_mes
 */
async function analyze() {
  // Últimos 30 días con saldo registrado
  const days = await sql`
    WITH dates AS (
      SELECT generate_series(
        (CURRENT_DATE - INTERVAL '30 days')::date,
        CURRENT_DATE::date,
        '1 day'::interval
      )::date AS d
    ),
    balance_per_day AS (
      SELECT
        d.d AS date,
        (SELECT bank_balance_real FROM daily_records
         WHERE bank_balance_real IS NOT NULL AND date <= d.d
         ORDER BY date DESC LIMIT 1) AS balance,
        EXTRACT(DAY FROM d.d)::int AS day_of_month,
        DATE_TRUNC('month', d.d)::date AS month_start
      FROM dates d
    ),
    expenses_mtd AS (
      SELECT
        b.date,
        b.balance,
        b.day_of_month,
        COALESCE(SUM(
          CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END
        ), 0) AS spent
      FROM balance_per_day b
      LEFT JOIN expenses e ON e.date >= b.month_start AND e.date <= b.date
      GROUP BY b.date, b.balance, b.day_of_month
    )
    SELECT
      date,
      balance,
      day_of_month,
      spent,
      CASE
        WHEN spent > 0 AND balance IS NOT NULL
          THEN FLOOR(balance / (spent / day_of_month))
        ELSE NULL
      END AS days_covered
    FROM expenses_mtd
    ORDER BY date
  `;

  let total = 0;
  let null_data = 0;
  let above90 = 0;
  let between30_90 = 0;
  let between15_30 = 0;
  let below15 = 0;

  console.log("\nDía         | Saldo       | Avg/día    | Cobertura (días)");
  console.log("------------|-------------|------------|------------------");
  for (const row of days as Array<{ date: string; balance: string | null; day_of_month: number; spent: string; days_covered: string | null }>) {
    total++;
    const dc = row.days_covered ? parseInt(row.days_covered) : null;
    const balance = row.balance ? parseFloat(row.balance) : null;
    const spent = parseFloat(row.spent);
    const avgPerDay = spent > 0 ? spent / row.day_of_month : 0;
    const dcStr = dc === null ? "—" : String(dc);
    const balStr = balance === null ? "—" : balance.toFixed(2);
    const avgStr = avgPerDay === 0 ? "—" : avgPerDay.toFixed(2);
    console.log(`${row.date}  | ${balStr.padStart(11)} | ${avgStr.padStart(10)} | ${dcStr.padStart(16)}`);

    if (dc === null) null_data++;
    else if (dc > 90) above90++;
    else if (dc >= 30) between30_90++;
    else if (dc >= 15) between15_30++;
    else below15++;
  }

  console.log("\n=== RESUMEN ===");
  console.log(`Total días analizados: ${total}`);
  console.log(`Sin datos suficientes: ${null_data} (${((null_data / total) * 100).toFixed(1)}%)`);
  console.log(`Cobertura > 90 días (oculta): ${above90} (${((above90 / total) * 100).toFixed(1)}%)`);
  console.log(`Cobertura 30-90 días (verde): ${between30_90} (${((between30_90 / total) * 100).toFixed(1)}%)`);
  console.log(`Cobertura 15-30 días (amarilla): ${between15_30} (${((between15_30 / total) * 100).toFixed(1)}%)`);
  console.log(`Cobertura < 15 días (roja): ${below15} (${((below15 / total) * 100).toFixed(1)}%)`);

  const relevant = between30_90 + between15_30 + below15;
  const relevantPct = (relevant / total) * 100;
  console.log(`\n>>> RELEVANTE (≤ 90 días): ${relevant} de ${total} (${relevantPct.toFixed(1)}%)`);
  console.log(`>>> Decisión: ${relevantPct >= 5 ? "MANTENER en Dashboard" : "REMOVER del Dashboard"}`);
}

analyze().catch((err) => { console.error(err); process.exit(1); });
