/**
 * Tests de la elección de fuente de ventas.
 *
 * Los casos son los REALES de agosto-2026, que es lo que hace útil este
 * archivo: la regla tiene que arreglar Atelier sin mover un solo sol de
 * Fonavi ni de Centro.
 */
import { describe, it, expect } from "vitest";
import { elegirFuenteVentas, FACTOR_DESCARTE, type FuenteVenta } from "../ventas-mes-sql";

const f = (
  fuente: FuenteVenta["fuente"], total: number, dias: number,
): FuenteVenta => ({ fuente, total, dias });

describe("casos reales de agosto 2026", () => {
  it("ATELIER: descarta las 31 filas en cero y usa el registro del admin", () => {
    // El bug: S/118 de una sola fila ganaba sobre 19 días registrados.
    const r = elegirFuenteVentas([
      f("byte", 118, 1), f("cierre", 9469, 5), f("registro", 31568, 19),
    ]);
    expect(r.fuente).toBe("registro");
    expect(r.total).toBe(31568);
    expect(r.descartadas).toEqual(["byte", "cierre"]);
  });

  it("FONAVI: no se toca — el reporte de Byte solo está menos actualizado", () => {
    // 18 vs 24 días: atrasado, no roto. Y miden cosas distintas (el
    // registro del admin incluye delivery y consumo del personal).
    const r = elegirFuenteVentas([
      f("byte", 13523, 18), f("cierre", 0, 0), f("registro", 29412, 24),
    ]);
    expect(r.fuente).toBe("byte");
    expect(r.total).toBe(13523);
    expect(r.descartadas).toEqual([]);
  });

  it("CENTRO: tampoco se toca", () => {
    const r = elegirFuenteVentas([
      f("byte", 20496, 18), f("cierre", 0, 0), f("registro", 37305, 23),
    ]);
    expect(r.total).toBe(20496);
  });

  it("ATELIER en junio y julio sigue igual que hoy: cae al cierre diario", () => {
    expect(elegirFuenteVentas([
      f("byte", 0, 0), f("cierre", 41045, 26), f("registro", 0, 0),
    ]).total).toBe(41045);
    expect(elegirFuenteVentas([
      f("byte", 0, 0), f("cierre", 36321, 31), f("registro", 18757, 16),
    ]).total).toBe(36321);
  });
});

describe("la regla en sí", () => {
  it("el orden manda cuando ninguna está rota: no gana la más grande", () => {
    // Si ganara la más grande, mezclaríamos métricas distintas e
    // inflaríamos la venta. La preferencia es del reporte de Byte.
    const r = elegirFuenteVentas([f("byte", 100, 10), f("registro", 900, 10)]);
    expect(r.fuente).toBe("byte");
  });

  it("el umbral es exactamente el doble de días", () => {
    // 10 vs 20 → descarta. 10 vs 19 → no.
    expect(elegirFuenteVentas([f("byte", 1, 10), f("registro", 2, 10 * FACTOR_DESCARTE)]).fuente)
      .toBe("registro");
    expect(elegirFuenteVentas([f("byte", 1, 10), f("registro", 2, 10 * FACTOR_DESCARTE - 1)]).fuente)
      .toBe("byte");
  });

  it("sin ningún dato devuelve cero y lo dice, no inventa una fuente", () => {
    const r = elegirFuenteVentas([f("byte", 0, 0), f("cierre", 0, 0), f("registro", 0, 0)]);
    expect(r.total).toBe(0);
    expect(r.fuente).toBeNull();
  });

  it("con una sola fuente con datos, esa gana", () => {
    expect(elegirFuenteVentas([f("byte", 0, 0), f("registro", 500, 3)]).fuente).toBe("registro");
  });
});

describe("hasta qué día llega el número elegido", () => {
  it("devuelve el último día de la fuente que ganó, no de otra", () => {
    const r = elegirFuenteVentas([
      { fuente: "byte", total: 13523, dias: 18, ultimoDia: "2026-08-18" },
      { fuente: "cierre", total: 0, dias: 0, ultimoDia: null },
      { fuente: "registro", total: 29412, dias: 24, ultimoDia: "2026-08-24" },
    ]);
    expect(r.fuente).toBe("byte");
    expect(r.ultimoDia).toBe("2026-08-18");   // el de byte, no el del admin
  });

  it("al descartar una fuente rota, toma el día de la que sí se usó", () => {
    const r = elegirFuenteVentas([
      { fuente: "byte", total: 118, dias: 1, ultimoDia: "2026-08-03" },
      { fuente: "cierre", total: 9469, dias: 5, ultimoDia: "2026-08-10" },
      { fuente: "registro", total: 31568, dias: 19, ultimoDia: "2026-08-24" },
    ]);
    expect(r.ultimoDia).toBe("2026-08-24");
  });
});
