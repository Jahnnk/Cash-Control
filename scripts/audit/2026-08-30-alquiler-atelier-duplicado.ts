/**
 * Borra la fila duplicada del alquiler de Atelier de agosto 2026.
 *
 * El pago quedó cargado dos veces:
 *
 *   3-ago  S/2,700  [manual]  "Alquiler del mes"  compartido 1800/900
 *   4-ago  S/2,700  [excel]   "ALQUILER AGOSTO 2026 (HUGO DÍAS)"
 *
 * Es el mismo pago. Atelier terminó con S/4,500 de alquiler en agosto
 * cuando le corresponden S/1,800.
 *
 * Sobrevive el registro MANUAL, no el del Excel, porque el manual guarda
 * el reparto entre sedes (S/1,800 Atelier / S/900 Fonavi) y la fila del
 * Excel no. Aprobado por Jahnn el 30-ago-2026.
 *
 * El origen ya está tapado: lib/duplicados-compartidos.ts reconoce estas
 * filas al importar y no las inserta. Este script limpia lo que entró
 * antes de ese arreglo — si el Excel de agosto se vuelve a importar, la
 * fila ya no vuelve.
 *
 *   npx tsx scripts/audit/2026-08-30-alquiler-atelier-duplicado.ts
 *   npx tsx scripts/audit/2026-08-30-alquiler-atelier-duplicado.ts --apply
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

const url =
  process.env.DATABASE_URL ??
  fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=["']?([^"'\n]+)/)?.[1];
if (!url) throw new Error("Falta DATABASE_URL");
const sql = neon(url);

const APPLY = process.argv.includes("--apply");
const ATELIER = 1;
const soles = (n: number) => `S/${Number(n).toFixed(2)}`;

async function alquilerDeAgosto() {
  return (await sql`
    SELECT id::text, date::text AS fecha, amount::float AS monto, concept AS concepto,
           imported_from_excel AS excel, is_shared AS compartido,
           atelier_amount::float AS parte_atelier
    FROM expenses
    WHERE business_id = ${ATELIER} AND archived = false
      AND upper(category) = 'ALQUILER'
      AND date BETWEEN '2026-08-01' AND '2026-08-31'
    ORDER BY date
  `) as {
    id: string; fecha: string; monto: number; concepto: string | null;
    excel: boolean; compartido: boolean; parte_atelier: number | null;
  }[];
}

/** Lo que el punto de equilibrio ve: la parte propia de Atelier. */
const costoReal = (f: Awaited<ReturnType<typeof alquilerDeAgosto>>[number]) =>
  f.compartido ? (f.parte_atelier ?? f.monto) : f.monto;

async function main() {
  const antes = await alquilerDeAgosto();

  console.log("═══ ALQUILER DE ATELIER · AGOSTO 2026 ═══\n");
  for (const f of antes) {
    console.log(
      `  ${f.fecha}  ${soles(f.monto).padStart(11)}  ${f.excel ? "[excel] " : "[manual]"}  ` +
        `${f.compartido ? `compartido → Atelier ${soles(f.parte_atelier ?? f.monto)}` : "".padEnd(34)}  · ${f.concepto}`,
    );
  }
  const totalAntes = antes.reduce((s, f) => s + costoReal(f), 0);
  console.log(`\n  Costo de alquiler que ve Atelier: ${soles(totalAntes)}`);
  console.log(`  Lo que corresponde:               ${soles(1800)}`);

  // La víctima: la fila del Excel. El manual se queda porque tiene el reparto.
  const aBorrar = antes.filter((f) => f.excel);

  if (aBorrar.length !== 1) {
    console.error(
      `\n✗ Se esperaba exactamente 1 fila del Excel y hay ${aBorrar.length}. ` +
        `No se toca nada — revisar a mano.`,
    );
    process.exit(1);
  }
  const victima = aBorrar[0];

  const quedan = antes.filter((f) => f.compartido);
  if (quedan.length !== 1) {
    console.error(
      `\n✗ Se esperaba exactamente 1 gasto compartido que sobreviva y hay ${quedan.length}. ` +
        `No se toca nada — borrar sin que quede el registro con el reparto perdería el alquiler entero.`,
    );
    process.exit(1);
  }

  console.log(`\n  A borrar: ${victima.fecha} ${soles(victima.monto)} · ${victima.concepto}`);
  console.log(`  Sobrevive: ${quedan[0].fecha} ${soles(quedan[0].monto)} · ${quedan[0].concepto} (tiene el reparto)`);

  if (!APPLY) {
    console.log("\nSimulación. No se cambió nada.");
    return;
  }

  fs.mkdirSync("scripts/audit/respaldos", { recursive: true });
  const ruta = `scripts/audit/respaldos/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-alquiler-atelier-duplicado.json`;
  const completa = await sql`SELECT * FROM expenses WHERE id = ${victima.id}`;
  fs.writeFileSync(
    ruta,
    JSON.stringify(
      {
        motivo:
          "Fila del Excel que duplicaba el alquiler compartido de Atelier de agosto 2026. " +
          "Aprobado por Jahnn el 30-ago-2026. Estado ANTES.",
        generado: new Date().toISOString(),
        fila: completa,
      },
      null,
      2,
    ),
  );
  console.log(`\n  Respaldo: ${ruta}`);

  await sql`DELETE FROM expenses WHERE id = ${victima.id}`;

  const despues = await alquilerDeAgosto();
  const totalDespues = despues.reduce((s, f) => s + costoReal(f), 0);
  console.log("\n═══ VERIFICACIÓN ═══\n");
  for (const f of despues) {
    console.log(`  ${f.fecha}  ${soles(f.monto)}  ${f.excel ? "[excel]" : "[manual]"} · ${f.concepto}`);
  }
  console.log(`\n  Costo de alquiler que ve Atelier: ${soles(totalDespues)}`);
  if (Math.abs(totalDespues - 1800) > 0.01) {
    console.error("  ✗ No quedó en S/1,800. Revisar con el respaldo a mano.");
    process.exit(1);
  }
  console.log("  ✓ Correcto.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
