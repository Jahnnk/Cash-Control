/**
 * El Deck y la pantalla de Productos preguntan lo MISMO.
 *
 * Caso real (08-sep-2026): Jahnn marcó el huevo revuelto, el huevo
 * sancochado y la humita como acompañamientos, la pantalla de Productos
 * los sacó del análisis… y en el Deck de la reunión seguían apareciendo
 * en "qué mantener, promocionar o reemplazar".
 *
 * La causa no fue la lógica —que estaba bien en los dos lados— sino que
 * la consulta estaba escrita dos veces y solo una pedía la columna
 * `es_acompanamiento`. El cast `as FilaVenta[]` no avisó nada: para
 * TypeScript el SQL es texto, así que la columna faltante llegaba como
 * `undefined` y todo el catálogo quedaba marcado como NO acompañamiento.
 *
 * Estos tests cuidan las dos mitades del arreglo: que la consulta pida
 * la marca, y que nadie vuelva a escribir una copia al lado.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { consultarVentasDelMes } from "../facts-sql";

/** Un cliente falso que no consulta nada: solo guarda lo que le piden. */
function sqlEspia() {
  let texto = "";
  const valores: unknown[] = [];
  const tag = (strings: TemplateStringsArray, ...vals: unknown[]) => {
    texto = strings.join("?");
    valores.push(...vals);
    return Promise.resolve([] as Record<string, unknown>[]);
  };
  return { tag, sql: () => texto, valores };
}

const leer = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("la consulta de ventas del mes", () => {
  it("pide la marca de acompañamiento", async () => {
    const espia = sqlEspia();
    await consultarVentasDelMes(espia.tag, 3, "2026-08");
    expect(espia.sql()).toContain("es_acompanamiento");
  });

  it("trata el producto sin marca como NO acompañamiento", async () => {
    // COALESCE, no el valor crudo: un producto que nunca se tocó tiene
    // NULL en esa columna, y NULL no es "sí".
    const espia = sqlEspia();
    await consultarVentasDelMes(espia.tag, 3, "2026-08");
    expect(espia.sql()).toContain("COALESCE(p.es_acompanamiento, false)");
  });

  it("filtra por la sede y el mes que le pasan", async () => {
    const espia = sqlEspia();
    await consultarVentasDelMes(espia.tag, 2, "2026-07");
    expect(espia.valores).toEqual([2, "2026-07"]);
  });
});

describe("nadie vuelve a escribir su propia copia", () => {
  // La consulta se reconoce por el LATERAL del costo, que es su parte
  // delicada (snapshot ≤ mes de la venta). Si aparece fuera de
  // facts-sql.ts es que alguien la copió, y una copia es la que se
  // quedó atrás la vez pasada. Se busca el FROM, no el nombre de la
  // tabla suelto: los comentarios sí pueden nombrarla.
  const HUELLA = "FROM product_cost_snapshots";

  for (const archivo of [
    "src/app/actions/board-portfolio.ts",
    "src/app/actions/portfolio-story.ts",
  ]) {
    it(`${archivo} llama a la consulta única, no la reescribe`, () => {
      const src = leer(archivo);
      expect(src).toContain("consultarVentasDelMes");
      expect(src).not.toContain(HUELLA);
    });
  }
});
