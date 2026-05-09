/**
 * Cleanup + re-import del archivo SUMMARY-V2 para Fonavi.
 *
 * MOTIVACIÓN
 * ----------
 * Los datos actuales de Fonavi en byte_sales_daily / tips_pending /
 * rounding_alerts están corruptos por el bug del parser corregido en
 * commit f0f47ff:
 *   - 21 días huérfanos de marzo (no debían existir, hoja era ABR26)
 *   - 30 días de abril con día 30 sobrescrito por totales del mes
 *   - Total abril en DB: S/72,439.10 (debería ser S/36,986.40)
 *
 * QUÉ HACE
 * --------
 *   1. (DRY-RUN por defecto) Borra del rango 2026-03-01..2026-05-31
 *      todos los registros con imported_from_excel=true para Fonavi
 *      en las 3 tablas.
 *   2. Re-parsea ambas hojas (ABR26 + MAY26) del SUMMARY-V2.
 *   3. Re-inserta los datos limpios apuntando a un import_batch
 *      nuevo con sheet_name=`<cleanup-script>`.
 *
 * PRESERVA:
 *   - tips_pending con status='assigned' o 'paid' (Kelly ya asignó)
 *   - rounding_alerts con status='reviewed'
 *
 * USO
 * ---
 *   npx tsx scripts/audit/cleanup-and-reimport-fonavi.ts          # dry-run
 *   npx tsx scripts/audit/cleanup-and-reimport-fonavi.ts --apply  # ejecuta
 */
import * as fs from "fs";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { parseControlVtas, listControlVtasSheets } from "../../src/lib/control-vtas-parser";

dotenv.config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const FILE = "/Users/jahnnkarlo/Library/CloudStorage/OneDrive-Personal/2. Fonavi/1. Finanzas/INGRESOS & GASTOS - SUMMARY- FONAVI - 08.05.2026-V2.xlsx";
const BUSINESS_ID = 2; // Fonavi
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\n🔧 Cleanup + Reimport Fonavi`);
  console.log(`   Modo: ${APPLY ? "🔴 APPLY (ejecuta mutaciones)" : "🟢 DRY-RUN (sin mutar)"}`);
  console.log(`   Archivo: ${FILE.split("/").pop()}\n`);

  // ─── 1. Estado actual ───────────────────────────────────────────
  console.log(`══ Estado ANTES ══`);
  const before = await sql`
    SELECT 'byte_sales_daily' AS tabla,
           COUNT(*)::int AS n, COALESCE(SUM(total),0)::float AS sum
    FROM byte_sales_daily WHERE business_id = ${BUSINESS_ID}
    UNION ALL
    SELECT 'tips_pending (imported, pending)', COUNT(*)::int,
           COALESCE(SUM(amount),0)::float
    FROM tips_pending
    WHERE business_id = ${BUSINESS_ID}
      AND imported_from_excel = true AND status = 'pending'
    UNION ALL
    SELECT 'tips_pending (assigned/paid - PRESERVED)', COUNT(*)::int,
           COALESCE(SUM(amount),0)::float
    FROM tips_pending
    WHERE business_id = ${BUSINESS_ID} AND status IN ('assigned', 'paid')
    UNION ALL
    SELECT 'rounding_alerts (imported, pending)', COUNT(*)::int, 0
    FROM rounding_alerts
    WHERE business_id = ${BUSINESS_ID}
      AND imported_from_excel = true AND status = 'pending'
    UNION ALL
    SELECT 'rounding_alerts (reviewed - PRESERVED)', COUNT(*)::int, 0
    FROM rounding_alerts
    WHERE business_id = ${BUSINESS_ID} AND status = 'reviewed'
  `;
  console.table(before);

  // ─── 2. Parsear archivo con el parser corregido ─────────────────
  console.log(`\n══ Parseando archivo ══`);
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Archivo no existe: ${FILE}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(FILE);
  const sheets = listControlVtasSheets(buf);
  console.log(`Hojas encontradas: ${JSON.stringify(sheets)}`);

  const parsedAll: Array<{
    sheet: string;
    days: number;
    total: number;
    propinas: number;
    alertas: number;
    ventas: ReturnType<typeof parseControlVtas>["ventasDiarias"];
    propinasArr: ReturnType<typeof parseControlVtas>["propinas"];
    alertasArr: ReturnType<typeof parseControlVtas>["alertasRedondeo"];
  }> = [];

  for (const s of sheets) {
    const r = parseControlVtas(buf, s);
    if (r.errores.length) {
      console.error(`❌ Errores en "${s}":`, r.errores);
      process.exit(1);
    }
    const total = r.ventasDiarias.reduce((a, d) => a + d.total, 0);
    parsedAll.push({
      sheet: s, days: r.ventasDiarias.length, total,
      propinas: r.propinas.length, alertas: r.alertasRedondeo.length,
      ventas: r.ventasDiarias, propinasArr: r.propinas, alertasArr: r.alertasRedondeo,
    });
    console.log(`  "${s}": ${r.ventasDiarias.length} días, S/${total.toFixed(2)}, ${r.propinas.length} propinas, ${r.alertasRedondeo.length} alertas`);
  }

  // ─── 3. Mostrar diff esperado ───────────────────────────────────
  const totalAbril = parsedAll.find(p => p.sheet.includes("ABR"))?.total ?? 0;
  console.log(`\n══ Diff esperado ══`);
  console.log(`  byte_sales_daily Fonavi abril 2026:`);
  console.log(`    ANTES: S/72,439.10 (corrupto)`);
  console.log(`    DESPUÉS: S/${totalAbril.toFixed(2)} (correcto)`);

  if (!APPLY) {
    console.log(`\n🟢 DRY-RUN — sin mutaciones. Re-correr con --apply para ejecutar.\n`);
    return;
  }

  // ─── 4. EJECUTAR mutaciones ─────────────────────────────────────
  console.log(`\n🔴 APPLY — ejecutando mutaciones...`);

  // Crear batch nuevo
  const batchRows = await sql`
    INSERT INTO import_batches
      (business_id, file_name, sheet_name, date_range_start, date_range_end)
    VALUES
      (${BUSINESS_ID},
       'INGRESOS & GASTOS - SUMMARY- FONAVI - 08.05.2026-V2.xlsx',
       'CLEANUP-SCRIPT (ABR26+MAY26)',
       '2026-04-01', '2026-05-31')
    RETURNING id::text
  `;
  const batchId = batchRows[0].id as string;
  console.log(`✓ Batch creado: ${batchId}`);

  // Borrar imported (preserva assigned/paid/reviewed)
  const delBsd = await sql`
    DELETE FROM byte_sales_daily
    WHERE business_id = ${BUSINESS_ID} AND imported_from_excel = true
    RETURNING id
  `;
  console.log(`✓ Borradas byte_sales_daily: ${delBsd.length}`);

  const delTips = await sql`
    DELETE FROM tips_pending
    WHERE business_id = ${BUSINESS_ID}
      AND imported_from_excel = true AND status = 'pending'
    RETURNING id
  `;
  console.log(`✓ Borradas tips_pending pending: ${delTips.length}`);

  const delAlerts = await sql`
    DELETE FROM rounding_alerts
    WHERE business_id = ${BUSINESS_ID}
      AND imported_from_excel = true AND status = 'pending'
    RETURNING id
  `;
  console.log(`✓ Borradas rounding_alerts pending: ${delAlerts.length}`);

  // Re-insertar
  let insBsd = 0, insTips = 0, insAlerts = 0;
  for (const p of parsedAll) {
    for (const v of p.ventas) {
      await sql`
        INSERT INTO byte_sales_daily
          (business_id, date, efectivo, yape_plin, pos,
           imported_from_excel, import_batch_id)
        VALUES
          (${BUSINESS_ID}, ${v.date}, ${v.efectivo.toFixed(2)},
           ${v.yape_plin.toFixed(2)}, ${v.pos.toFixed(2)},
           true, ${batchId}::uuid)
        ON CONFLICT (business_id, date) DO UPDATE SET
          efectivo = EXCLUDED.efectivo,
          yape_plin = EXCLUDED.yape_plin,
          pos = EXCLUDED.pos,
          imported_from_excel = true,
          import_batch_id = EXCLUDED.import_batch_id,
          updated_at = now()
      `;
      insBsd++;
    }
    for (const t of p.propinasArr) {
      await sql`
        INSERT INTO tips_pending
          (business_id, date, amount, source, source_concept, note_text,
           imported_from_excel, import_batch_id)
        VALUES
          (${BUSINESS_ID}, ${t.date}, ${t.amount.toFixed(2)}, 'excel',
           ${t.source_concept}, ${t.note_text}, true, ${batchId}::uuid)
      `;
      insTips++;
    }
    for (const a of p.alertasArr) {
      await sql`
        INSERT INTO rounding_alerts
          (business_id, date, payment_method, amount_quipupos, amount_cuentas,
           difference, note_text, imported_from_excel, import_batch_id)
        VALUES
          (${BUSINESS_ID}, ${a.date}, ${a.payment_method},
           ${a.amount_quipupos.toFixed(2)}, ${a.amount_cuentas.toFixed(2)},
           ${a.difference.toFixed(2)}, ${a.note_text},
           true, ${batchId}::uuid)
      `;
      insAlerts++;
    }
  }
  console.log(`✓ Insertadas byte_sales_daily: ${insBsd}`);
  console.log(`✓ Insertadas tips_pending: ${insTips}`);
  console.log(`✓ Insertadas rounding_alerts: ${insAlerts}`);

  // Estado después
  console.log(`\n══ Estado DESPUÉS ══`);
  const after = await sql`
    SELECT TO_CHAR(date, 'YYYY-MM') AS mes, COUNT(*)::int AS dias,
           COALESCE(SUM(total),0)::float AS total
    FROM byte_sales_daily
    WHERE business_id = ${BUSINESS_ID}
    GROUP BY 1 ORDER BY 1
  `;
  console.table(after);

  console.log(`\n✅ Cleanup + reimport completado.\n`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
