/**
 * Guardia: un parámetro NUNCA puede aparecer SOLO dentro de un
 * IS NULL / IS NOT NULL.
 *
 * INCIDENTE 12-ago-2026: `cerrarHighlight` armaba
 *   reflect_en = CASE WHEN ${ayudo} IS NOT NULL OR ... THEN now() END
 * Postgres no puede inferir el tipo de un parámetro que solo se usa en
 * un IS NOT NULL, y respondía:
 *   "could not determine data type of parameter $5"
 * Los administradores veían "No pude guardar. Intenta de nuevo." al
 * cerrar su Highlight — con el trabajo ya hecho y el Reflect escrito.
 *
 * Ni tsc, ni build, ni lint lo detectan: es un error del motor de base
 * de datos, en tiempo de ejecución.
 *
 * Sí es seguro (y se permite): `columna IS NOT NULL` y
 * `${param}::tipo IS NULL` (el cast explícito le da el tipo a Postgres,
 * como hace export-report.ts con `${businessId}::int IS NULL`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) out.push(...archivosTs(ruta));
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(ruta);
  }
  return out;
}

const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("SQL: parámetros sin tipo en IS NULL / IS NOT NULL", () => {
  it("ningún ${param} desnudo dentro de un IS (NOT) NULL", () => {
    const culpables: string[] = [];
    for (const f of archivosTs(join(process.cwd(), "src"))) {
      const src = sinComentarios(readFileSync(f, "utf8"));
      // ${...} seguido de IS NULL / IS NOT NULL, SIN un cast ::tipo.
      const re = /\$\{[^}]+\}\s*(?!::)\s*IS\s+(NOT\s+)?NULL/gi;
      const hits = src.match(re);
      if (hits) {
        culpables.push(`${f.replace(process.cwd() + "/", "")} → ${hits.join(" | ")}`);
      }
    }
    expect(
      culpables,
      "Parámetro sin tipo dentro de IS NULL/IS NOT NULL (Postgres no puede " +
        "inferirlo). Resuélvelo en JavaScript antes de la consulta, o pon un " +
        `cast explícito (\${x}::text IS NULL):\n${culpables.join("\n")}`,
    ).toEqual([]);
  });
});
