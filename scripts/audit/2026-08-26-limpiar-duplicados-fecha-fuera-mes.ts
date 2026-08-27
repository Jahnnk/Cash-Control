/**
 * Limpieza de las copias que dejó el bug de "fechas de otro mes".
 *
 * ─── De dónde salieron estas copias ───
 *
 * Kelly teclea alguna fila con la fecha del mes anterior dentro de la
 * pestaña del mes en curso (copia y pega la hoja anterior). Al importar
 * "Ing&Gtos AGO26", el sistema borraba lo ya importado DE AGOSTO y
 * reinsertaba todo el archivo: la fila con fecha de julio se insertaba
 * pero nunca se borraba, porque caía fuera del rango de limpieza. Una
 * copia más por cada re-importación.
 *
 * El origen ya está tapado: desde el 26-ago-2026 la importación se
 * BLOQUEA si hay filas con fecha de otro mes (lib/filas-fuera-del-mes.ts).
 * Este script limpia solo lo que se acumuló antes de ese arreglo.
 *
 * ─── Qué borra, exactamente, y qué NO ───
 *
 * Solo las copias que vienen de LOTES DE IMPORTACIÓN DISTINTOS. Esa es
 * la firma del bug: la misma fila entró una vez por cada vez que se
 * subió el archivo.
 *
 * Si dos filas iguales vienen del MISMO lote, NO se tocan: estaban así
 * en el Excel de Kelly. Pueden ser dos compras reales del mismo día por
 * el mismo monto (pasa con insumos), y eso lo decide ella mirando su
 * archivo, no este script.
 *
 * La diferencia no es teórica. En Centro había tres casos así —humitas
 * del 11-abr, agua mineral del 18-jun y fresa del 13-jul, S/97.20 en
 * total— cuyas dos copias entraron en la misma importación. Un script
 * que solo mirara "misma fecha + mismo monto" las habría borrado y
 * habría hecho desaparecer compras que quizá ocurrieron de verdad.
 *
 * Tampoco toca nada registrado a mano (imported_from_excel = false):
 * esas filas nunca fueron parte del bug.
 *
 * ─── Uso ───
 *
 *   npx tsx scripts/audit/2026-08-26-limpiar-duplicados-fecha-fuera-mes.ts
 *   npx tsx scripts/audit/2026-08-26-limpiar-duplicados-fecha-fuera-mes.ts --apply
 *
 * Sin --apply solo muestra lo que haría.
 *
 * ─── El respaldo ───
 *
 * Con --apply, ANTES de borrar guarda las filas completas (todas sus
 * columnas) en scripts/audit/respaldos/, junto con el SQL de
 * restauración listo para pegar. Son diez filas: un archivo las
 * devuelve exactas, y no depende de tener a mano la consola de Neon.
 *
 * Eso NO reemplaza al snapshot de Neon para operaciones grandes (la
 * regla de AGENTS.md sigue en pie), pero para un borrado puntual y
 * enumerado como este es un respaldo más preciso: restaura justo lo que
 * se tocó, sin revertir nada más de lo que pasó en el medio.
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const APPLY = process.argv.includes("--apply");
const SEDE: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };
const soles = (n: number) => `S/${n.toFixed(2)}`;

type Grupo = {
  business_id: number;
  fecha: string;
  detalle: string;
  amount: number;
  copias: number;
  sobra: number;
  ids_a_borrar: string[];
};

/**
 * Los duplicados de una tabla. `(array_agg(id ORDER BY created_at))[2:]`
 * deja fuera el PRIMERO de cada grupo: se conserva el original y se
 * borran las copias posteriores.
 */
async function duplicadosEgresos(): Promise<Grupo[]> {
  return (await sql`
    SELECT business_id,
           date::text AS fecha,
           (category || ' · ' || COALESCE(concept, '')) AS detalle,
           amount::float AS amount,
           count(*)::int AS copias,
           (amount * (count(*) - 1))::float AS sobra,
           (array_agg(id::text ORDER BY created_at, id))[2:] AS ids_a_borrar
    FROM expenses
    WHERE archived = false AND imported_from_excel = true
    GROUP BY business_id, date, category, concept, amount
    HAVING count(*) > 1
       -- La firma del bug: entraron en importaciones DISTINTAS. Si todas
       -- vienen del mismo lote, estaban duplicadas en el Excel y no es
       -- cosa nuestra borrarlas.
       AND count(DISTINCT import_batch_id) > 1
    ORDER BY (amount * (count(*) - 1)) DESC
  `) as Grupo[];
}

async function duplicadosIngresos(): Promise<Grupo[]> {
  return (await sql`
    SELECT business_id,
           date::text AS fecha,
           COALESCE(note, '(sin nota)') AS detalle,
           amount::float AS amount,
           count(*)::int AS copias,
           (amount * (count(*) - 1))::float AS sobra,
           (array_agg(id::text ORDER BY created_at, id))[2:] AS ids_a_borrar
    FROM bank_income_items
    WHERE archived = false AND imported_from_excel = true
    GROUP BY business_id, date, note, amount
    HAVING count(*) > 1
       AND count(DISTINCT import_batch_id) > 1
    ORDER BY (amount * (count(*) - 1)) DESC
  `) as Grupo[];
}

function mostrar(titulo: string, grupos: Grupo[]): number {
  console.log(`\n═══ ${titulo} ═══`);
  if (grupos.length === 0) {
    console.log("  (ninguno)");
    return 0;
  }
  let total = 0;
  for (const g of grupos) {
    total += g.sobra;
    console.log(
      `  ${SEDE[g.business_id]?.padEnd(8) ?? g.business_id}  ${g.fecha}  ` +
        `${g.copias} copias × ${soles(g.amount)}  →  borrar ${g.ids_a_borrar.length}, ` +
        `sobra ${soles(g.sobra)}`,
    );
    console.log(`      ${g.detalle.slice(0, 70)}`);
  }
  console.log(`  ── subtotal a corregir: ${soles(total)}`);
  return total;
}

async function main() {
  const [egresos, ingresos] = await Promise.all([
    duplicadosEgresos(),
    duplicadosIngresos(),
  ]);

  const tE = mostrar("EGRESOS duplicados", egresos);
  const tI = mostrar("INGRESOS duplicados", ingresos);

  const idsEg = egresos.flatMap((g) => g.ids_a_borrar);
  const idsIn = ingresos.flatMap((g) => g.ids_a_borrar);

  console.log(
    `\nTOTAL: ${soles(tE)} en egresos · ${soles(tI)} en ingresos · ` +
      `${idsEg.length + idsIn.length} filas a borrar`,
  );

  if (!APPLY) {
    console.log("\nSimulación (sin --apply). No se borró nada.");
    return;
  }
  if (idsEg.length === 0 && idsIn.length === 0) {
    console.log("\nNada que borrar.");
    return;
  }

  // ── Respaldo antes de tocar nada ────────────────────────────────
  // Se guardan las filas ENTERAS, no solo los ids: si algo sale mal, lo
  // que hace falta es poder volver a insertarlas tal cual.
  const [filasEg, filasIn] = await Promise.all([
    idsEg.length > 0
      ? sql`SELECT * FROM expenses WHERE id = ANY(${idsEg}::uuid[])`
      : Promise.resolve([]),
    idsIn.length > 0
      ? sql`SELECT * FROM bank_income_items WHERE id = ANY(${idsIn}::uuid[])`
      : Promise.resolve([]),
  ]);

  const dir = "scripts/audit/respaldos";
  fs.mkdirSync(dir, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ruta = `${dir}/${sello}-duplicados-fecha-fuera-mes.json`;
  fs.writeFileSync(
    ruta,
    JSON.stringify(
      {
        motivo: "Copias dejadas por el bug de fechas fuera del mes de la pestaña",
        generado: new Date().toISOString(),
        expenses: filasEg,
        bank_income_items: filasIn,
        restaurar:
          "Volver a insertar cada objeto en su tabla con los mismos valores " +
          "(incluido el id) devuelve el estado anterior exacto.",
      },
      null,
      2,
    ),
  );
  console.log(
    `\nRespaldo guardado: ${ruta} ` +
      `(${filasEg.length} egresos + ${filasIn.length} ingresos, con todas sus columnas)`,
  );

  // Salvaguarda: si el respaldo no tiene tantas filas como las que se
  // van a borrar, algo no cuadra y no se borra nada. Un respaldo
  // incompleto es peor que no tenerlo, porque da falsa confianza.
  if (filasEg.length !== idsEg.length || filasIn.length !== idsIn.length) {
    console.error(
      "\n✗ El respaldo no coincide con lo que se iba a borrar " +
        `(${filasEg.length}/${idsEg.length} egresos, ${filasIn.length}/${idsIn.length} ingresos). ` +
        "No se borró nada.",
    );
    process.exit(1);
  }

  console.log("\nBorrando…");
  if (idsEg.length > 0) {
    await sql`DELETE FROM expenses WHERE id = ANY(${idsEg}::uuid[])`;
  }
  if (idsIn.length > 0) {
    await sql`DELETE FROM bank_income_items WHERE id = ANY(${idsIn}::uuid[])`;
  }

  // Se vuelve a consultar: la prueba de que quedó limpio es que ya no
  // hay grupos duplicados, no que el DELETE no lanzó error.
  const [ve, vi] = await Promise.all([duplicadosEgresos(), duplicadosIngresos()]);
  console.log(
    `\nVerificación: quedan ${ve.length} grupos de egresos y ${vi.length} de ingresos ` +
      `duplicados (debe ser 0 y 0).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
