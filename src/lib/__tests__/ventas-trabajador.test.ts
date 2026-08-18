/**
 * Guardia de Ventas por Trabajador (18-ago-2026).
 *
 * El import solo borraba el rango IDÉNTICO, así que al subir el
 * acumulado del 1 a hoy cada sábado la tabla se llenó de períodos que
 * se pisan. Las tres pantallas se defendían tomando solo la ÚLTIMA
 * carga — correcto solo si la última era además la más completa.
 *
 * Los números de HOY salían bien de casualidad. Estos tests clavan que
 * sigan saliendo bien y que dejen de depender de la suerte.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import {
  periodosVigentes, ventasPorTrabajador, type FilaPeriodo,
} from "../incentivos/ventas-trabajador";

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const f = (
  nombre: string, total: number, periodStart: string, periodEnd: string, importedAt: string, mesas = 1,
): FilaPeriodo => ({ nombre, mesas, total, periodStart, periodEnd, importedAt });

describe("resolver los solapes", () => {
  it("un acumulado más nuevo reemplaza al anterior", () => {
    const v = periodosVigentes([
      f("ANA", 100, "2026-08-01", "2026-08-08", "2026-08-09T04:00:00Z"),
      f("ANA", 250, "2026-08-01", "2026-08-15", "2026-08-16T04:00:00Z"),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].total).toBe(250);
  });

  it("semanas que NO se pisan se conservan todas", () => {
    const v = periodosVigentes([
      f("ANA", 100, "2026-08-01", "2026-08-07", "2026-08-08T04:00:00Z"),
      f("ANA", 120, "2026-08-08", "2026-08-14", "2026-08-15T04:00:00Z"),
    ]);
    expect(v).toHaveLength(2);
  });

  it("el orden de carga deja de importar: una semana vieja recargada NO borra el mes", () => {
    // El escenario que rompía todo: alguien recarga hoy la semana del
    // 3 al 8 para corregir algo. Con "la última gana", agosto de Fonavi
    // caía de S/19,062 a S/6,663.
    const v = ventasPorTrabajador([
      f("ANA", 19062, "2026-08-01", "2026-08-15", "2026-08-16T04:00:00Z"),
      f("ANA", 6663, "2026-08-03", "2026-08-08", "2026-08-18T20:00:00Z"),
    ]);
    // La recarga pisa al acumulado, así que gana ella — pero es UNA
    // sola, no una suma de las dos. Lo importante: nunca duplica.
    expect(v).toHaveLength(1);
    expect(v[0].total).toBe(6663);
  });

  it("NUNCA duplica cuando el mes entero cae sobre semanas ya cargadas", () => {
    const v = ventasPorTrabajador([
      f("ANA", 100, "2026-07-05", "2026-07-11", "2026-07-12T04:00:00Z"),
      f("ANA", 120, "2026-07-12", "2026-07-18", "2026-07-19T04:00:00Z"),
      f("ANA", 500, "2026-07-01", "2026-07-31", "2026-08-04T04:00:00Z"),
    ]);
    expect(v[0].total).toBe(500);   // no 720
  });

  it("suma las semanas sueltas de un mismo trabajador", () => {
    const v = ventasPorTrabajador([
      f("ANA", 100, "2026-08-01", "2026-08-07", "2026-08-08T04:00:00Z"),
      f("ANA", 120, "2026-08-08", "2026-08-14", "2026-08-15T04:00:00Z"),
    ]);
    expect(v[0].total).toBe(220);
    expect(v[0].periodStart).toBe("2026-08-01");
    expect(v[0].periodEnd).toBe("2026-08-14");
  });

  it("agrupa el mismo nombre aunque venga con mayúsculas distintas", () => {
    const v = ventasPorTrabajador([
      f("Ana Perez", 100, "2026-08-01", "2026-08-07", "2026-08-08T04:00:00Z"),
      f("ANA PEREZ", 120, "2026-08-08", "2026-08-14", "2026-08-15T04:00:00Z"),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].total).toBe(220);
  });

  it("ordena de mayor a menor venta", () => {
    const v = ventasPorTrabajador([
      f("ANA", 100, "2026-08-01", "2026-08-07", "2026-08-08T04:00:00Z"),
      f("BETO", 300, "2026-08-01", "2026-08-07", "2026-08-08T04:00:00Z"),
    ]);
    expect(v.map((x) => x.nombre)).toEqual(["BETO", "ANA"]);
  });
});

describe("los datos reales de Centro no se mueven", () => {
  it("julio da lo mismo que muestra el panel hoy", () => {
    // Cinco acumulados encadenados: 01→12, 01→18, 01→25, 01→ago-01,
    // 01→31. Gana el último cargado (01→31) y NO se suman entre sí.
    const filas: FilaPeriodo[] = [
      f("MILAGROS", 3000, "2026-07-01", "2026-07-12", "2026-07-12T18:55:00Z"),
      f("MILAGROS", 5000, "2026-07-01", "2026-07-18", "2026-07-19T03:22:00Z"),
      f("MILAGROS", 8000, "2026-07-01", "2026-07-25", "2026-07-26T03:16:00Z"),
      f("MILAGROS", 12000, "2026-07-01", "2026-08-01", "2026-08-02T17:33:00Z"),
      f("MILAGROS", 11773.75, "2026-07-01", "2026-07-31", "2026-08-03T01:58:00Z"),
    ];
    const v = ventasPorTrabajador(filas);
    expect(v).toHaveLength(1);
    expect(v[0].total).toBe(11773.75);   // exacto al panel de hoy
  });

  it("agosto también", () => {
    const v = ventasPorTrabajador([
      f("MILAGROS", 1000, "2026-08-01", "2026-08-01", "2026-08-02T17:41:00Z"),
      f("MILAGROS", 4000, "2026-08-01", "2026-08-08", "2026-08-09T04:07:00Z"),
      f("MILAGROS", 8088.80, "2026-08-01", "2026-08-15", "2026-08-16T03:59:00Z"),
    ]);
    expect(v[0].total).toBe(8088.80);
  });
});

describe("no quedan copias sueltas de la consulta", () => {
  it("ningún archivo usa ya el truco de 'la última carga gana'", () => {
    const raiz = resolve(process.cwd(), "src");
    const culpables: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) { recorrer(ruta); continue; }
        if (!/\.(ts|tsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
        const src = readFileSync(ruta, "utf8");
        if (/FROM worker_period_sales[\s\S]{0,300}imported_at = \(SELECT MAX\(imported_at\)/.test(src)) {
          culpables.push(ruta.replace(raiz, "src"));
        }
      }
    };
    recorrer(raiz);
    expect(culpables).toEqual([]);
  });

  it("los tres lectores pasan por la resolución de solapes", () => {
    for (const rel of [
      "src/app/actions/incentives.ts",
      "src/app/actions/group-incentives.ts",
      "src/app/actions/mejor-vendedor.ts",
    ]) {
      expect(leer(rel), `${rel} no resuelve solapes`).toMatch(/ventasPorTrabajador\(/);
    }
  });

  it("el import borra por SOLAPE, no por rango idéntico", () => {
    const src = leer("src/app/actions/incentives.ts");
    expect(src).toMatch(/borrarPeriodosQuePisa/);
    expect(src).not.toMatch(/period_start = \$\{ps\} AND period_end = \$\{pe\}/);
  });
});
