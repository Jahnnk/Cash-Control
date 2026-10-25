/**
 * Reglas firmes sobre lo ya guardado, abril–octubre 2026 (25-oct-2026, OK de Jahnn).
 *
 * Jahnn revisó la lista de gastos donde la categoría guardada (la del Grupo del Excel) no coincide con una regla
 * firme (lib/reglas-gasto.ts → REGLAS_FIRMES) y la aprobó: servicio contable → CONTABILIDAD Y ASESORÍAS, Canva →
 * OFICINA Y SISTEMAS, agua mineral / infusiones / humitas → INSUMOS, packaging, mandil, cuchilla de licuadora,
 * «delivery …», devoluciones a clientas, reparaciones → MANTENIMIENTO. 23 gastos, S/1,898.93.
 * No toca lo que Jahnn ya decidió (tipo_pe), ni las categorías del sistema, ni los fletes.
 *
 * Respaldo local antes de tocar. Uso: npx tsx scripts/audit/2026-10-25-reglas-firmes.ts [--apply]
 */
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { writeFileSync, mkdirSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { reglaFirme } from "../../src/lib/reglas-gasto";

const sql = neon(process.env.DATABASE_URL!);
const SISTEMA = new Set(["TRANSFERENCIA INTERNA", "PRESTAMOS SOCIO", "REVISAR TIPO"]);
const ESPERADOS = 23;

(async () => {
  const filas = (await sql`
    SELECT * FROM expenses
    WHERE archived = false AND business_id IN (1,2,3) AND date BETWEEN '2026-04-01' AND '2026-10-31'
      AND is_internal_transfer = false AND is_special_loan = false AND payment_method <> 'pendiente_atelier' AND tipo_pe IS NULL
    ORDER BY date
  `) as Record<string, unknown>[];
  const cambios = filas.flatMap((f) => {
    if (SISTEMA.has(f.category as string)) return [];
    const r = reglaFirme(String(f.concept ?? "").replace(/[()[\]]/g, " "));
    return r && r.categoria !== f.category ? [{ fila: f, a: r.categoria }] : [];
  });
  for (const c of cambios) console.log(`${c.fila.business_id} · ${String(c.fila.date).slice(0, 10)} · S/${c.fila.amount} · ${c.fila.category} → ${c.a} · ${c.fila.concept}`);
  if (cambios.length !== ESPERADOS) throw new Error(`Se esperaban ${ESPERADOS} gastos y hay ${cambios.length}: revisar antes de aplicar.`);
  mkdirSync("scripts/audit/respaldos", { recursive: true });
  writeFileSync("scripts/audit/respaldos/reglas-firmes_2026-10-25.json", JSON.stringify(cambios.map((c) => c.fila), null, 1));
  if (!process.argv.includes("--apply")) return console.log(`(simulación: ${cambios.length} gastos, no se cambió nada)`);
  const q = cambios.map((c) => sql`UPDATE expenses SET category = ${c.a} WHERE id = ${c.fila.id as string} AND category = ${c.fila.category as string} AND tipo_pe IS NULL RETURNING id`);
  const res = await sql.transaction(q);
  console.log("Actualizados:", res.flat().length);
})();
