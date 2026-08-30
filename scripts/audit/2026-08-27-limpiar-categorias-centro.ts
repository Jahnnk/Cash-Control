/**
 * Limpieza del catálogo de categorías de gasto de Centro.
 *
 * Aprobado por Jahnn el 27-ago-2026 sobre el análisis completo. Cuatro
 * cosas, en este orden (importa: no se puede borrar una categoría que
 * todavía tiene gastos apuntándole):
 *
 *   1. UNIFICAR  · las variantes mal escritas y las absorciones
 *      aprobadas, tanto en los gastos como en el catálogo.
 *   2. RECLASIFICAR · UTILIDADES y REMODELACIÓN salen del resultado
 *      operativo; SS BANCARIOS queda como variable.
 *   3. BORRAR    · las categorías que quedaron sin ningún gasto.
 *   4. VERIFICAR · que la suma total de gastos NO cambió.
 *
 * El paso 4 es el que importa: esto renombra y borra, pero no puede
 * mover un solo sol. Si el total cambia, algo se hizo mal.
 *
 * ─── El origen ya está tapado ───
 *
 * lib/categoria-alias.ts corrige las variantes AL IMPORTAR, así que el
 * Excel de Kelly ya no vuelve a crearlas aunque ella las escriba igual.
 * Este script limpia lo que se acumuló antes de ese arreglo.
 *
 * ─── Uso ───
 *
 *   npx tsx scripts/audit/2026-08-27-limpiar-categorias-centro.ts
 *   npx tsx scripts/audit/2026-08-27-limpiar-categorias-centro.ts --apply
 *
 * Sin --apply solo muestra lo que haría. Con --apply guarda antes un
 * respaldo completo del catálogo y de las categorías de cada gasto.
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import { categoriaCanonica } from "../../src/lib/categoria-alias";

const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const APPLY = process.argv.includes("--apply");
const CENTRO = 3;
const soles = (n: number) => `S/${Number(n).toFixed(2)}`;

/**
 * Clasificación aprobada. Solo se listan las que CAMBIAN o las que hay
 * que asegurar; el resto del catálogo se queda como está.
 *
 *   fijo     = no cambia aunque se venda más o menos
 *   variable = sube y baja con la venta
 *   fuera    = no es gasto del negocio (no entra al punto de equilibrio)
 */
const CLASIFICACION: Record<string, "fijo" | "variable" | "fuera"> = {
  // Fijos — la planilla es la que motivó todo esto.
  PLANILLA: "fijo",
  ALQUILER: "fijo",
  SERVICIOS: "fijo",
  CONTABILIDAD: "fijo",
  MARKETING: "fijo",          // decisión de Jahnn: es presupuesto mensual
  MANTENIMIENTO: "fijo",
  EQUIPOS: "fijo",
  VAJILLA: "fijo",
  OFICINA: "fijo",
  PERSONAL: "fijo",
  "SS GENERALES": "fijo",
  AUSPICIOS: "fijo",
  DECORACIÓN: "fijo",
  CONSULTORÍA: "fijo",

  // Variables
  "PRODUCTOS ATELIER": "variable",
  INSUMOS: "variable",
  PACKAGING: "variable",
  DELIVERY: "variable",
  "CAJA CHICA": "variable",
  LIMPIEZA: "variable",
  IMPUESTOS: "variable",
  "SS BANCARIOS": "variable",  // estaba contradictoria entre variantes
  OTROS: "variable",

  // Fuera del resultado operativo
  AHORRO: "fuera",
  UTILIDADES: "fuera",         // adelanto de utilidades a los socios
  "PRESTAMO ATELIER": "fuera",
  REMODELACIÓN: "fuera",       // es inversión en el local, no un costo
};

async function totalGastos(): Promise<number> {
  const r = (await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS t FROM expenses
    WHERE business_id = ${CENTRO} AND archived = false
  `) as { t: number }[];
  return Math.round(r[0].t * 100) / 100;
}

async function main() {
  const totalAntes = await totalGastos();

  // ── 1. Qué categorías cambian de nombre ──────────────────────────
  const usadas = (await sql`
    SELECT category, COUNT(*)::int AS movs, SUM(amount)::float AS total
    FROM expenses WHERE business_id = ${CENTRO} AND archived = false
    GROUP BY category ORDER BY SUM(amount) DESC
  `) as { category: string; movs: number; total: number }[];

  const renombres = usadas
    .map((u) => ({ ...u, destino: categoriaCanonica(u.category) }))
    .filter((u) => u.destino !== u.category);

  console.log("═══ 1 · UNIFICAR ═══\n");
  if (renombres.length === 0) console.log("  (nada que unificar)");
  for (const r of renombres) {
    console.log(
      `  ${r.category.padEnd(20)} → ${r.destino.padEnd(20)} ` +
        `${String(r.movs).padStart(4)} movs · ${soles(r.total)}`,
    );
  }

  // ── 2. Qué categorías cambian de clasificación ───────────────────
  const cats = (await sql`
    SELECT name, cost_group, exclude_from_ebitda
    FROM expense_categories WHERE business_id = ${CENTRO}
  `) as { name: string; cost_group: string | null; exclude_from_ebitda: boolean }[];

  const reclasificar: { name: string; de: string; a: string }[] = [];
  for (const [name, destino] of Object.entries(CLASIFICACION)) {
    const actual = cats.find((c) => c.name === name);
    if (!actual) continue;
    const hoy = actual.exclude_from_ebitda ? "fuera" : (actual.cost_group ?? "sin clasificar");
    if (hoy !== destino) reclasificar.push({ name, de: hoy, a: destino });
  }

  console.log("\n═══ 2 · RECLASIFICAR ═══\n");
  if (reclasificar.length === 0) console.log("  (nada que reclasificar)");
  for (const r of reclasificar) console.log(`  ${r.name.padEnd(22)} ${r.de} → ${r.a}`);

  if (!APPLY) {
    console.log("\n═══ 3 · BORRAR ═══\n  (se calcula después de unificar; correr con --apply)");
    console.log("\nSimulación. No se cambió nada.");
    return;
  }

  // ── Respaldo ─────────────────────────────────────────────────────
  const catsFull = await sql`SELECT * FROM expense_categories WHERE business_id = ${CENTRO}`;
  const gastos = await sql`
    SELECT id::text, date::text, category, amount::float
    FROM expenses WHERE business_id = ${CENTRO} AND archived = false
  `;
  fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
  const ruta = `scripts/audit/respaldos/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-categorias-centro.json`;
  fs.writeFileSync(
    ruta,
    JSON.stringify(
      {
        motivo:
          "Limpieza del catálogo de categorías de Centro aprobada por Jahnn (27-ago-2026): " +
          "unificar variantes mal escritas, reclasificar y borrar las vacías. Estado ANTES.",
        generado: new Date().toISOString(),
        totalGastosAntes: totalAntes,
        expense_categories: catsFull,
        expenses_categoria: gastos,
      },
      null,
      2,
    ),
  );
  console.log(`\nRespaldo: ${ruta}`);

  // ── Aplicar 1: renombres ─────────────────────────────────────────
  for (const r of renombres) {
    await sql`
      UPDATE expenses SET category = ${r.destino}
      WHERE business_id = ${CENTRO} AND category = ${r.category} AND archived = false
    `;
    // La categoría destino tiene que existir en el catálogo.
    await sql`
      INSERT INTO expense_categories (business_id, name)
      VALUES (${CENTRO}, ${r.destino})
      ON CONFLICT DO NOTHING
    `;
  }

  // ── Aplicar 2: clasificación ─────────────────────────────────────
  for (const [name, destino] of Object.entries(CLASIFICACION)) {
    await sql`
      UPDATE expense_categories
      SET cost_group = ${destino === "fuera" ? null : destino},
          exclude_from_ebitda = ${destino === "fuera"}
      WHERE business_id = ${CENTRO} AND name = ${name}
    `;
  }

  // ── Aplicar 3: borrar las que quedaron sin gastos ────────────────
  const borradas = (await sql`
    DELETE FROM expense_categories c
    WHERE c.business_id = ${CENTRO}
      AND NOT EXISTS (
        SELECT 1 FROM expenses e
        WHERE e.business_id = ${CENTRO} AND e.category = c.name AND e.archived = false
      )
    RETURNING name
  `) as { name: string }[];

  console.log("\n═══ 3 · BORRAR ═══\n");
  console.log(`  ${borradas.length} categorías sin gastos: ${borradas.map((b) => b.name).join(", ")}`);

  // ── 4. Verificar que no se movió un solo sol ─────────────────────
  const totalDespues = await totalGastos();
  const quedan = (await sql`
    SELECT COUNT(*)::int AS n FROM expense_categories WHERE business_id = ${CENTRO}
  `) as { n: number }[];

  console.log("\n═══ 4 · VERIFICACIÓN ═══\n");
  console.log(`  Gasto total antes:   ${soles(totalAntes)}`);
  console.log(`  Gasto total después: ${soles(totalDespues)}`);
  if (Math.abs(totalAntes - totalDespues) > 0.01) {
    console.error("\n  ✗ EL TOTAL CAMBIÓ. Restaurar desde el respaldo.");
    process.exit(1);
  }
  console.log(`  ✓ Idéntico — solo se renombró y se borró catálogo vacío.`);
  console.log(`  Categorías: 64 → ${quedan[0].n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
