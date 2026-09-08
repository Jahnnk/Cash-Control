/**
 * Marca la humita como acompañamiento en las dos cafeterías.
 *
 * Jahnn (08-sep-2026), sobre el Deck de la reunión: "siguen apareciendo
 * los complementos como huevo revuelto con tocino, huevo revuelto
 * clásico, humita, entre otros… al ser complementos de desayunos o
 * combos no deberían figurar".
 *
 * Los huevos ya estaban marcados y dejaron de figurar al arreglar la
 * consulta del Deck. La humita nunca se marcó: sale de cuadrante
 * "plow_horse" (vende mucho, deja poco margen) en Fonavi y en Centro, o
 * sea que estaba compitiendo de igual a igual con los platos de carta.
 *
 * ─── Por qué solo la humita ───
 *
 * De la lista aprobada, los otros seis nombres —EXTRA, EXTRA 1, EXTRA 2,
 * ADICIONAL, HUEVOS REVUELTOS YAYIS y PORCION PAN (1 UNIDAD)— NO tienen
 * ficha en el catálogo: son ventas sueltas de Byte sin producto
 * asociado. La marca vive en `products.es_acompanamiento`, así que no
 * hay dónde ponerla. Y no hace falta: sin ficha no tienen costo, y sin
 * costo el menu engineering ya los deja fuera (verificado sobre agosto
 * 2026: cuadrante nulo en las dos sedes). Crearles una ficha vacía solo
 * para marcarlos sería inventar catálogo para tapar algo que ya está
 * tapado.
 *
 * Se marcan las 4 fichas de humita —"Humita" y "Humita de casa", cada
 * una en Centro y en Fonavi— porque son la misma cosa con dos nombres.
 *
 *   npx tsx scripts/audit/2026-09-08-marcar-humita-acompanamiento.ts
 *   npx tsx scripts/audit/2026-09-08-marcar-humita-acompanamiento.ts --apply
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const APPLY = process.argv.includes("--apply");
const SEDES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

type Ficha = {
  id: string;
  name: string;
  business_id: number | null;
  acomp: boolean;
};

/**
 * Las fichas a marcar. Se buscan por nombre y NO por id fijo: el
 * catálogo se re-sincroniza desde el pricing engine y un id copiado a
 * mano envejece mal. El patrón es angosto a propósito — "humita" y
 * "humita de casa", con o sin el sufijo de sede.
 */
async function fichasDeHumita(): Promise<Ficha[]> {
  return (await sql`
    SELECT id::text, name, business_id,
           COALESCE(es_acompanamiento, false) AS acomp
    FROM products
    WHERE name ILIKE 'humita%'
    ORDER BY business_id, name
  `) as Ficha[];
}

async function main() {
  const antes = await fichasDeHumita();

  console.log("═══ FICHAS DE HUMITA EN EL CATÁLOGO ═══\n");
  if (antes.length === 0) {
    console.error("✗ No encontré ninguna ficha de humita. No se toca nada.");
    process.exit(1);
  }
  for (const f of antes) {
    console.log(
      `  ${f.acomp ? "✓ ya marcada" : "· sin marcar "}  ` +
        `${(SEDES[f.business_id ?? 0] ?? "—").padEnd(8)}  ${f.name}`,
    );
  }

  const pendientes = antes.filter((f) => !f.acomp);
  console.log(`\n  A marcar: ${pendientes.length} de ${antes.length}`);

  if (pendientes.length === 0) {
    console.log("  Nada que hacer.");
    return;
  }
  if (!APPLY) {
    console.log("\nSimulación. No se cambió nada.");
    return;
  }

  fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
  const ruta = `scripts/audit/respaldos/${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19)}-humita-acompanamiento.json`;
  fs.writeFileSync(
    ruta,
    JSON.stringify(
      {
        motivo:
          "Marcar la humita como acompañamiento para que salga del menu " +
          "engineering del Deck. Aprobado por Jahnn el 08-sep-2026. Estado ANTES.",
        generado: new Date().toISOString(),
        fichas: antes,
      },
      null,
      2,
    ),
  );
  console.log(`\n  Respaldo: ${ruta}`);

  const ids = pendientes.map((f) => f.id);
  await sql`
    UPDATE products SET es_acompanamiento = true
    WHERE id = ANY(${ids}::uuid[])
  `;

  console.log("\n═══ VERIFICACIÓN ═══\n");
  const despues = await fichasDeHumita();
  for (const f of despues) {
    console.log(
      `  ${f.acomp ? "✓" : "✗"}  ${(SEDES[f.business_id ?? 0] ?? "—").padEnd(8)}  ${f.name}`,
    );
  }
  const faltan = despues.filter((f) => !f.acomp);
  if (faltan.length > 0) {
    console.error(`\n  ✗ Quedaron ${faltan.length} sin marcar. Revisar con el respaldo.`);
    process.exit(1);
  }
  console.log("\n  ✓ Las 4 fichas quedaron marcadas como acompañamiento.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
