/**
 * Tests de la elección de fuente de ventas.
 *
 * Los casos son los REALES de 2026, que es lo que hace útil este
 * archivo: la regla tiene que corregir agosto (donde el reporte de Byte
 * entró sin la venta con tarjeta) sin mover julio ni los meses
 * anteriores, donde ese reporte es el más completo.
 */
import { describe, it, expect } from "vitest";
import { elegirFuenteVentas, type FuenteVenta } from "../ventas-mes-sql";

const f = (
  fuente: FuenteVenta["fuente"], total: number, dias: number, ultimoDia: string | null = null,
): FuenteVenta => ({ fuente, total, dias, ultimoDia });

describe("agosto 2026: el reporte de Byte entró incompleto", () => {
  it("FONAVI: con los MISMOS días cargados, gana la que reporta más", () => {
    // El caso que rompía la regla anterior: tras re-subir el Excel, las
    // dos fuentes tenían 25 días, así que ninguna se descartaba por
    // cobertura y el orden de preferencia se quedaba con la incompleta.
    // Sobre esos mismos 25 días, Byte daba el 61.9% del registro porque
    // la carga entró sin la columna POS.
    const r = elegirFuenteVentas([
      f("byte", 18790, 25), f("cierre", 0, 0), f("registro", 30371, 25),
    ]);
    expect(r.fuente).toBe("registro");
    expect(r.total).toBe(30371);
    expect(r.descartadas).toEqual(["byte"]);
  });

  it("CENTRO: 24 días contra 25 siguen siendo comparables, gana la mayor", () => {
    const r = elegirFuenteVentas([
      f("byte", 29484, 24), f("cierre", 0, 0), f("registro", 38955, 25),
    ]);
    expect(r.total).toBe(38955);
  });

  it("ATELIER: 2 días no compiten con 20 — se descartan por cobertura", () => {
    const r = elegirFuenteVentas([
      f("byte", 134, 2), f("cierre", 9469, 5), f("registro", 32593, 20),
    ]);
    expect(r.fuente).toBe("registro");
    expect(r.total).toBe(32593);
    expect(r.descartadas).toEqual(["byte", "cierre"]);
  });
});

describe("julio 2026 y antes: no se mueve nada", () => {
  it("FONAVI sigue con el reporte de Byte: más días Y más monto", () => {
    // En julio las dos fuentes cuadran (97.5%) y Byte cubre los 31 días.
    const r = elegirFuenteVentas([
      f("byte", 34796, 31), f("cierre", 0, 0), f("registro", 30350, 27),
    ]);
    expect(r.fuente).toBe("byte");
    expect(r.total).toBe(34796);
  });

  it("ATELIER en julio sigue con el cierre diario", () => {
    const r = elegirFuenteVentas([
      f("byte", 0, 0), f("cierre", 36321, 31), f("registro", 18757, 16),
    ]);
    expect(r.total).toBe(36321);
  });

  it("junio: solo hay una fuente y esa se usa", () => {
    expect(elegirFuenteVentas([
      f("byte", 36432, 30), f("cierre", 0, 0), f("registro", 0, 0),
    ]).total).toBe(36432);
  });
});

describe("la regla en sí", () => {
  it("una fuente con pocos días NO gana por reportar mucho", () => {
    // El monto solo decide entre fuentes con cobertura parecida: si no,
    // dos días enormes taparían a un mes entero bien cargado.
    const r = elegirFuenteVentas([f("byte", 100, 20), f("registro", 9000, 2)]);
    expect(r.fuente).toBe("byte");
  });

  it("con la misma cobertura, gana la de mayor total", () => {
    // Las tres miden la misma venta, así que con los mismos días la que
    // reporta menos es la que perdió un componente.
    const r = elegirFuenteVentas([f("byte", 100, 10), f("registro", 900, 10)]);
    expect(r.fuente).toBe("registro");
  });

  it("en empate EXACTO de días y monto manda el orden de preferencia", () => {
    const r = elegirFuenteVentas([f("byte", 500, 10), f("registro", 500, 10)]);
    expect(r.fuente).toBe("byte");
  });

  it("el umbral de cobertura comparable es el 90% de los días de la mejor", () => {
    // 18 de 20 = 90% → compite (y gana por monto).
    expect(elegirFuenteVentas([f("byte", 100, 20), f("registro", 900, 18)]).fuente).toBe("registro");
    // 17 de 20 = 85% → no compite.
    expect(elegirFuenteVentas([f("byte", 100, 20), f("registro", 900, 17)]).fuente).toBe("byte");
  });

  it("sin ningún dato devuelve cero y lo dice, no inventa una fuente", () => {
    const r = elegirFuenteVentas([f("byte", 0, 0), f("cierre", 0, 0), f("registro", 0, 0)]);
    expect(r.total).toBe(0);
    expect(r.fuente).toBeNull();
    expect(r.ultimoDia).toBeNull();
  });
});

describe("hasta qué día llega el número elegido", () => {
  it("devuelve el último día de la fuente que ganó, no de otra", () => {
    const r = elegirFuenteVentas([
      f("byte", 18790, 25, "2026-08-25"),
      f("cierre", 0, 0, null),
      f("registro", 30371, 25, "2026-08-25"),
    ]);
    expect(r.fuente).toBe("registro");
    expect(r.ultimoDia).toBe("2026-08-25");
  });

  it("cuando gana el reporte de Byte, la fecha es la suya", () => {
    const r = elegirFuenteVentas([
      f("byte", 34796, 31, "2026-07-31"),
      f("registro", 30350, 27, "2026-07-27"),
    ]);
    expect(r.ultimoDia).toBe("2026-07-31");
  });
});
