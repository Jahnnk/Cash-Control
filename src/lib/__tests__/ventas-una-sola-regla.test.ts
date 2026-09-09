/**
 * TODOS los lectores de ventas usan la MISMA regla.
 *
 * El 9-sep-2026 el Reporte Ejecutivo de agosto decía que el grupo había
 * vendido S/84,758 y gastado S/127,784: EBITDA −S/43,026, margen −50.8%,
 * "salud 32/100, estado crítico". Kelly lo leyó y concluyó que el
 * sistema no servía.
 *
 * La causa: `salesInRange` decía "si byte_sales_daily tiene AL MENOS UNA
 * fila del rango, usa esa fuente y ninguna otra". A Atelier le habían
 * entrado 2 filas de agosto por S/133.52 de una carga fallida, mientras
 * su administrador tenía 25 días registrados por S/41,057. El sistema
 * dio por bueno que Atelier vendió S/133 en el mes.
 *
 * S/38,246.91 (Fonavi byte) + S/46,378.25 (Centro byte) + S/133.52
 * (Atelier byte) = S/84,758.68 exacto.
 *
 * La regla correcta vivía en `ventas-mes-sql.ts` desde agosto, pero solo
 * la usaba el punto de equilibrio. Este test existe para que no vuelva a
 * haber dos lectores con dos verdades.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { elegirFuenteVentas, type FuenteVenta } from "../ventas-mes-sql";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("el caso real de agosto 2026", () => {
  const f = (fuente: FuenteVenta["fuente"], total: number, dias: number): FuenteVenta =>
    ({ fuente, total, dias, ultimoDia: null });

  it("Atelier: 2 días rotos NO le ganan a 25 días del administrador", () => {
    const r = elegirFuenteVentas([f("byte", 133.52, 2), f("cierre", 9468.51, 5), f("registro", 41056.86, 25)]);
    expect(r.fuente).toBe("registro");
    expect(r.total).toBeCloseTo(41056.86, 2);
    expect(r.descartadas).toContain("byte");
  });

  it("Fonavi y Centro no se mueven: sus dos fuentes cubren el mes entero", () => {
    const fonavi = elegirFuenteVentas([f("byte", 38246.91, 31), f("cierre", 0, 0), f("registro", 38979.45, 31)]);
    const centro = elegirFuenteVentas([f("byte", 46378.25, 31), f("cierre", 0, 0), f("registro", 46786.14, 31)]);
    // Con los mismos días, gana la mayor: la que reporta menos perdió algo.
    expect(fonavi.total).toBeCloseTo(38979.45, 2);
    expect(centro.total).toBeCloseTo(46786.14, 2);
  });

  it("el grupo pasa de S/84,758 a S/126,822", () => {
    const suma =
      elegirFuenteVentas([f("byte", 133.52, 2), f("cierre", 9468.51, 5), f("registro", 41056.86, 25)]).total +
      elegirFuenteVentas([f("byte", 38246.91, 31), f("cierre", 0, 0), f("registro", 38979.45, 31)]).total +
      elegirFuenteVentas([f("byte", 46378.25, 31), f("cierre", 0, 0), f("registro", 46786.14, 31)]).total;
    expect(suma).toBeCloseTo(126822.45, 2);
    // El número que Kelly vio, para que quede en el expediente.
    expect(suma).not.toBeCloseTo(84758.68, 2);
  });
});

describe("nadie vuelve a escribir su propia cadena de fuentes", () => {
  // La huella del bug: preguntar si byte_sales_daily tiene filas para
  // decidir con esa fuente sola. Si vuelve a aparecer en un lector de
  // ventas, volvimos al punto de partida.
  it("command-center pasa por elegirFuenteVentas", () => {
    const src = leer("src/app/actions/command-center.ts");
    expect(src).toContain("elegirFuenteVentas");
  });

  it("command-center ya no decide por 'si hay filas de byte'", () => {
    const src = leer("src/app/actions/command-center.ts");
    // El patrón viejo: contar filas de byte_sales_daily y ramificar.
    const cuenta = /COUNT\(\*\)::int AS n FROM byte_sales_daily/i.test(src);
    expect(cuenta).toBe(false);
  });

  it("el reporte ejecutivo NO suma ventas por su cuenta", () => {
    // Reutiliza salesInRange. Puede CONTAR filas de byte_sales_daily
    // (es una bandera de capacidad, no una cifra), pero en el momento en
    // que las SUME tendrá su propia verdad — y ahí empieza el problema.
    const src = leer("src/app/actions/report-facts.ts");
    expect(src).toContain("salesInRange");
    expect(/SUM\([^)]*efectivo/i.test(src)).toBe(false);
  });
});
