/**
 * Unificación del catálogo de gastos de las TRES sedes.
 *
 * Continuación de 2026-08-27-limpiar-categorias-centro.ts, que dejó Centro
 * limpio. Este aplica el mismo criterio a Atelier y Fonavi, y de paso deja
 * a las tres hablando el mismo idioma.
 *
 * ─── Por qué ───
 *
 * Dos problemas distintos, que se veían como uno:
 *
 *   1. Plata que no entraba al punto de equilibrio. S/34,549 en Atelier y
 *      S/11,568 en Fonavi en categorías escritas PERFECTO (INSUMOS,
 *      ALQUILER, PLANILLA) a las que nadie les puso nunca fijo/variable.
 *      El sistema las dejaba caer de la fórmula en silencio.
 *   2. Las tres sedes se contradecían. MANTENIMIENTO era fijo en Centro y
 *      variable en Fonavi; OFICINA fijo en Atelier y variable en Fonavi.
 *      Comparar sedes con criterios distintos no compara nada.
 *
 * Jahnn aprobó (30-ago-2026) unificar bajo la lista de Centro, que ahora
 * vive en src/lib/catalogo-categorias.ts.
 *
 * ─── Qué hace, en orden ───
 *
 *   1. UNIFICAR    · renombra cada gasto al nombre canónico usando el
 *                    MISMO resolvedor que corre al importar.
 *   2. CLASIFICAR  · le pone a cada categoría del catálogo su grupo.
 *                    Acá SÍ se pisa la clasificación anterior: ese es el
 *                    punto de unificar.
 *   3. PENDIENTES  · lista las que el resolvedor no reconoció. NO las
 *                    toca: son decisión de dirección.
 *   4. BORRAR      · las categorías que quedaron sin ningún gasto.
 *   5. VERIFICAR   · que la suma total de gastos NO cambió, por sede.
 *
 * El paso 5 es el que importa: esto renombra y reclasifica, pero no puede
 * mover un solo sol. Si el total cambia, algo se hizo mal.
 *
 * ─── Uso ───
 *
 *   npx tsx scripts/audit/2026-08-30-unificar-categorias-tres-sedes.ts
 *   npx tsx scripts/audit/2026-08-30-unificar-categorias-tres-sedes.ts --apply
 *
 * Sin --apply solo muestra lo que haría. Con --apply guarda antes un
 * respaldo completo del catálogo y de la categoría de cada gasto.
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import { resolverCategoria } from "../../src/lib/categoria-resolver";
import {
  CATALOGO,
  grupoAColumnas,
  grupoDelCatalogo,
} from "../../src/lib/catalogo-categorias";

const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const APPLY = process.argv.includes("--apply");
const SEDES: { id: number; nombre: string }[] = [
  { id: 1, nombre: "ATELIER" },
  { id: 2, nombre: "FONAVI" },
  { id: 3, nombre: "CENTRO" },
];
const soles = (n: number) => `S/${Number(n).toFixed(2)}`;

type Fila = { category: string; movs: number; total: number };

async function totalGastos(bId: number): Promise<number> {
  const r = (await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS t FROM expenses
    WHERE business_id = ${bId} AND archived = false
  `) as { t: number }[];
  return Math.round(r[0].t * 100) / 100;
}

async function main() {
  const totalesAntes = new Map<number, number>();
  for (const s of SEDES) totalesAntes.set(s.id, await totalGastos(s.id));

  // ── Respaldo, antes de tocar nada ────────────────────────────────
  if (APPLY) {
    const catsFull = await sql`SELECT * FROM expense_categories WHERE business_id IN (1,2,3)`;
    const gastos = await sql`
      SELECT id::text, business_id, date::text, category, amount::float
      FROM expenses WHERE business_id IN (1,2,3) AND archived = false
    `;
    fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
    const ruta = `scripts/audit/respaldos/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-categorias-tres-sedes.json`;
    fs.writeFileSync(
      ruta,
      JSON.stringify(
        {
          motivo:
            "Unificación del catálogo de gastos de las tres sedes bajo la lista " +
            "aprobada por Jahnn (30-ago-2026). Estado ANTES.",
          generado: new Date().toISOString(),
          totalesAntes: Object.fromEntries(totalesAntes),
          expense_categories: catsFull,
          expenses_categoria: gastos,
        },
        null,
        2,
      ),
    );
    console.log(`Respaldo: ${ruta}\n`);
  }

  const pendientesGlobal: { sede: string; nombre: string; movs: number; total: number; motivo: string }[] = [];

  for (const sede of SEDES) {
    console.log(`\n${"═".repeat(64)}\n  ${sede.nombre}\n${"═".repeat(64)}`);

    const usadas = (await sql`
      SELECT category, COUNT(*)::int AS movs, SUM(amount)::float AS total
      FROM expenses WHERE business_id = ${sede.id} AND archived = false
      GROUP BY category ORDER BY SUM(amount) DESC
    `) as Fila[];

    // ── 1 · UNIFICAR ────────────────────────────────────────────────
    const renombres = usadas
      .map((u) => ({ ...u, r: resolverCategoria(u.category) }))
      .filter((u) => u.r.canonica !== u.category);

    console.log(`\n── 1 · UNIFICAR (${renombres.length}) ──`);
    if (renombres.length === 0) console.log("   (nada que unificar)");
    for (const x of renombres) {
      console.log(
        `   ${x.category.padEnd(26)} → ${x.r.canonica.padEnd(22)} ` +
          `${String(x.movs).padStart(3)} movs · ${soles(x.total).padStart(12)}  [${x.r.confianza}]`,
      );
    }

    if (APPLY) {
      for (const x of renombres) {
        await sql`
          INSERT INTO expense_categories (business_id, name)
          VALUES (${sede.id}, ${x.r.canonica}) ON CONFLICT DO NOTHING
        `;
        await sql`
          UPDATE expenses SET category = ${x.r.canonica}
          WHERE business_id = ${sede.id} AND category = ${x.category} AND archived = false
        `;
      }
    }

    // ── 2 · CLASIFICAR ──────────────────────────────────────────────
    const cats = (await sql`
      SELECT name, cost_group, exclude_from_ebitda
      FROM expense_categories WHERE business_id = ${sede.id}
    `) as { name: string; cost_group: string | null; exclude_from_ebitda: boolean }[];

    const cambios: { name: string; de: string; a: string }[] = [];
    for (const c of cats) {
      const grupo = grupoDelCatalogo(c.name);
      if (!grupo) continue; // no está en el catálogo → no se toca
      const hoy = c.cost_group === "financiamiento"
        ? "financiamiento"
        : c.exclude_from_ebitda
          ? "fuera"
          : (c.cost_group ?? "sin clasificar");
      if (hoy !== grupo) cambios.push({ name: c.name, de: hoy, a: grupo });
    }

    console.log(`\n── 2 · CLASIFICAR (${cambios.length}) ──`);
    if (cambios.length === 0) console.log("   (ya estaban todas en su grupo)");
    for (const c of cambios) {
      console.log(`   ${c.name.padEnd(26)} ${c.de} → ${c.a}`);
    }

    if (APPLY) {
      for (const c of CATALOGO) {
        const cols = grupoAColumnas(c.grupo);
        await sql`
          UPDATE expense_categories
          SET cost_group = ${cols.costGroup}, exclude_from_ebitda = ${cols.excludeFromEbitda}
          WHERE business_id = ${sede.id} AND name = ${c.nombre}
        `;
      }
    }

    // ── 3 · PENDIENTES ──────────────────────────────────────────────
    //
    // La foto de CÓMO QUEDA se arma en memoria aplicando los renombres,
    // no re-consultando la base: en simulación los renombres todavía no
    // se escribieron, y sin esto el dry-run reportaría como "pendiente"
    // todo lo que en realidad sí se va a resolver. Resolver es idempotente
    // (hay test), así que da lo mismo antes o después de --apply.
    const acumulado = new Map<string, { movs: number; total: number }>();
    for (const u of usadas) {
      const canon = resolverCategoria(u.category).canonica;
      const prev = acumulado.get(canon) ?? { movs: 0, total: 0 };
      acumulado.set(canon, { movs: prev.movs + u.movs, total: prev.total + u.total });
    }
    const usadasDespues: Fila[] = [...acumulado.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total);

    const pendientes = usadasDespues
      .filter((u) => !grupoDelCatalogo(u.category))
      .map((u) => ({ ...u, r: resolverCategoria(u.category) }));

    console.log(`\n── 3 · PENDIENTES DE DECISIÓN (${pendientes.length}) ──`);
    if (pendientes.length === 0) console.log("   (ninguna: todo el gasto quedó clasificado)");
    for (const x of pendientes) {
      console.log(`   ${x.category.padEnd(36)} ${String(x.movs).padStart(3)} movs · ${soles(x.total).padStart(12)}`);
      pendientesGlobal.push({
        sede: sede.nombre, nombre: x.category, movs: x.movs, total: x.total, motivo: x.r.motivo,
      });
    }

    // ── 4 · BORRAR las vacías ───────────────────────────────────────
    if (APPLY) {
      const borradas = (await sql`
        DELETE FROM expense_categories c
        WHERE c.business_id = ${sede.id}
          AND NOT EXISTS (
            SELECT 1 FROM expenses e
            WHERE e.business_id = ${sede.id} AND e.category = c.name AND e.archived = false
          )
        RETURNING name
      `) as { name: string }[];
      console.log(`\n── 4 · BORRADAS SIN GASTO (${borradas.length}) ──`);
      if (borradas.length) console.log(`   ${borradas.map((b) => b.name).join(", ")}`);
    } else {
      const vacias = cats.filter((c) => !usadasDespues.some((u) => u.category === c.name));
      console.log(`\n── 4 · SE BORRARÍAN SIN GASTO (${vacias.length}) ──`);
      if (vacias.length) console.log(`   ${vacias.map((b) => b.name).join(", ")}`);
    }

    // ── 5 · VERIFICAR ───────────────────────────────────────────────
    const despues = await totalGastos(sede.id);
    const antes = totalesAntes.get(sede.id)!;
    console.log(`\n── 5 · VERIFICACIÓN ──`);
    console.log(`   Antes:   ${soles(antes)}`);
    console.log(`   Después: ${soles(despues)}`);
    if (Math.abs(antes - despues) > 0.01) {
      console.error(`\n   ✗ EL TOTAL DE ${sede.nombre} CAMBIÓ. Restaurar desde el respaldo.`);
      process.exit(1);
    }
    console.log(`   ✓ Idéntico.`);
  }

  // ── Resumen de lo que sigue necesitando a Jahnn ───────────────────
  if (pendientesGlobal.length) {
    console.log(`\n\n${"═".repeat(64)}\n  FALTA TU DECISIÓN (${pendientesGlobal.length})\n${"═".repeat(64)}\n`);
    const total = pendientesGlobal.reduce((s, p) => s + p.total, 0);
    for (const p of pendientesGlobal.sort((a, b) => b.total - a.total)) {
      console.log(`   ${p.sede.padEnd(8)} ${p.nombre.padEnd(36)} ${soles(p.total).padStart(12)}`);
    }
    console.log(`\n   Total sin clasificar: ${soles(total)}`);
    console.log(`   Estas NO se tocaron: el sistema no las adivina.`);
  }

  if (!APPLY) console.log("\n\nSimulación. No se cambió nada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
