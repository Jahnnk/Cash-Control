/**
 * Tests de la lectura del saldo del banco en el Excel de Kelly.
 *
 * Lo que se clava acá: que la lectura se encuentre POR EL SALDO que la
 * acompaña y no por su posición. Jahnn lo pidió así — "no necesariamente
 * el importe del banco va a estar siempre en el mismo número de celda" —
 * y la realidad era peor: la columna trae varias lecturas viejas y la
 * buena no es ni la primera ni la última.
 */
import { describe, it, expect } from "vitest";
import { leerSaldoBancoExcel, normalizarEncabezado } from "./saldo-banco-excel";

/** Arma una hoja de mentira con los encabezados en la fila que se pida. */
function hoja(opts: {
  filaEncabezados?: number;
  /** [saldoCtaCte, bancoReal] por fila de movimiento; null = celda vacía. */
  movimientos: [number | null, number | null][];
  /** Filas de relleno DESPUÉS de los movimientos (sin tipo I/G). */
  relleno?: [number | null, number | null][];
  columnaAVacia?: boolean;
}): unknown[][] {
  const pad = opts.columnaAVacia ? [null] : [];
  const filas: unknown[][] = [];
  for (let i = 0; i < (opts.filaEncabezados ?? 3) - 1; i++) filas.push([]);
  // Fecha | Ing. / Gsto. | SALDO CTA. CTE. | Banco Crédito Cta. Cte
  filas.push([...pad, "Fecha", "Ing. / Gsto.", "SALDO CTA. CTE.", "Banco Crédito Cta. Cte"]);
  for (const [saldo, banco] of opts.movimientos) {
    filas.push([...pad, "01/08/26", "I", saldo, banco]);
  }
  for (const [saldo, banco] of opts.relleno ?? []) {
    filas.push([...pad, null, null, saldo, banco]);
  }
  return filas;
}

describe("normalizarEncabezado", () => {
  it("ignora tildes, mayúsculas y puntuación", () => {
    expect(normalizarEncabezado("Banco Crédito Cta. Cte")).toBe("banco credito cta cte");
    expect(normalizarEncabezado("  SALDO CTA. CTE.  ")).toBe("saldo cta cte");
    expect(normalizarEncabezado("Ing. / Gsto.")).toBe("ing gsto");
  });

  it("no se rompe con celdas vacías", () => {
    expect(normalizarEncabezado(null)).toBe("");
    expect(normalizarEncabezado(undefined)).toBe("");
  });
});

describe("leerSaldoBancoExcel", () => {
  it("toma la lectura que acompaña al saldo final del libro", () => {
    const r = leerSaldoBancoExcel(hoja({
      movimientos: [[100, null], [250, null], [900.5, 875.0]],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.saldo.valor).toBe(875.0);
      expect(r.saldo.saldoLibro).toBe(900.5);
      expect(r.saldo.diferencia).toBe(25.5);
    }
  });

  it("IGNORA las lecturas de más abajo, que son de meses anteriores", () => {
    // El caso de Fonavi: 6 lecturas, la buena es la primera que coincide
    // con el saldo final. Tomar "la última" daba 9,020.80 en vez de
    // 15,594.02.
    const r = leerSaldoBancoExcel(hoja({
      movimientos: [[100, null], [15518.53, 15594.02]],
      relleno: [[15518.53, 19267.45], [15518.53, 9020.80]],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.saldo.valor).toBe(15594.02);
      expect(r.saldo.lecturasEncontradas).toBe(3);   // avisa que había residuos
    }
  });

  it("IGNORA una lectura anterior si su saldo no es el final", () => {
    // El caso de Centro: la primera lectura (fila 52) era un corte del
    // 4-ago con otro saldo. Tomar "la primera" también fallaba.
    const r = leerSaldoBancoExcel(hoja({
      movimientos: [[4810.06, 3452.83], [12739.6, 12772.91]],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.saldo.valor).toBe(12772.91);
  });

  it("da igual en qué FILA esté la lectura", () => {
    const arriba = leerSaldoBancoExcel(hoja({ movimientos: [[500, 480]] }));
    const abajo = leerSaldoBancoExcel(hoja({
      movimientos: [[100, null], [200, null], [300, null], [500, 480]],
    }));
    expect(arriba.ok && abajo.ok).toBe(true);
    if (arriba.ok && abajo.ok) expect(arriba.saldo.valor).toBe(abajo.saldo.valor);
  });

  it("da igual en qué COLUMNA esté: se busca por encabezado", () => {
    // Con la columna A vacía todo se corre un lugar. Es el bug real del
    // parser de Control de VTAS (Centro) documentado en AGENTS.md.
    const r = leerSaldoBancoExcel(hoja({ movimientos: [[500, 480]], columnaAVacia: true }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.saldo.valor).toBe(480);
  });

  it("da igual en qué fila estén los encabezados", () => {
    const r = leerSaldoBancoExcel(hoja({ filaEncabezados: 7, movimientos: [[500, 480]] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.saldo.valor).toBe(480);
  });

  it("avisa cuando Kelly no anotó ningún saldo, en vez de inventar uno", () => {
    const r = leerSaldoBancoExcel(hoja({ movimientos: [[100, null], [500, null]] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("no anotó el saldo");
  });

  it("avisa cuando todas las lecturas son viejas, en vez de agarrar cualquiera", () => {
    // Prefiere no dar dato antes que dar uno equivocado: un saldo de banco
    // mal leído es peor que ninguno.
    const r = leerSaldoBancoExcel(hoja({
      movimientos: [[100, null], [900, null]],
      relleno: [[123.45, 5000], [678.9, 6000]],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("meses anteriores");
  });

  it("avisa si falta la columna del banco", () => {
    const filas: unknown[][] = [[], [], ["Fecha", "Ing. / Gsto.", "SALDO CTA. CTE."], ["01/08/26", "I", 500]];
    const r = leerSaldoBancoExcel(filas);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("Banco Crédito Cta. Cte");
  });

  it("avisa si no encuentra los encabezados", () => {
    const r = leerSaldoBancoExcel([["cualquier", "cosa"], [1, 2]]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("encabezados");
  });
});
