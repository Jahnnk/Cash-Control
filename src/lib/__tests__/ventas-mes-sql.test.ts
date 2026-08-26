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
  it("FONAVI usa el registro del admin, que coincide con el reporte real de Byte", () => {
    // El sistema decía S/13,523 (59% de lo real) porque a la carga le
    // faltó la columna POS. Byte reportaba S/22,857.77 del 1 al 18.
    const r = elegirFuenteVentas([
      f("byte", 13523, 18), f("cierre", 0, 0), f("registro", 29412, 24),
    ]);
    expect(r.fuente).toBe("registro");
    expect(r.total).toBe(29412);
    expect(r.descartadas).toEqual(["byte"]);
  });

  it("CENTRO igual: 18 días de Byte contra 23 del registro", () => {
    const r = elegirFuenteVentas([
      f("byte", 20496, 18), f("cierre", 0, 0), f("registro", 37305, 23),
    ]);
    expect(r.total).toBe(37305);
  });

  it("ATELIER: descarta las 31 filas en cero (una sola con S/117.52)", () => {
    const r = elegirFuenteVentas([
      f("byte", 118, 1), f("cierre", 9469, 5), f("registro", 31568, 19),
    ]);
    expect(r.fuente).toBe("registro");
    expect(r.total).toBe(31568);
    expect(r.descartadas).toEqual(["byte", "cierre"]);
  });
});

describe("julio 2026 y antes: no se mueve nada", () => {
  it("FONAVI sigue con el reporte de Byte, que cubre los 31 días", () => {
    // En julio las dos fuentes cuadran (97.5%), y Byte tiene más días.
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
  it("gana la que cubre más días, no la que suma más soles", () => {
    // Si ganara la más grande, una fuente con 2 días enormes taparía a
    // otra con el mes entero.
    const r = elegirFuenteVentas([f("byte", 100, 20), f("registro", 9000, 2)]);
    expect(r.fuente).toBe("byte");
  });

  it("en empate manda el orden de preferencia", () => {
    const r = elegirFuenteVentas([f("byte", 100, 10), f("registro", 900, 10)]);
    expect(r.fuente).toBe("byte");
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
      f("byte", 13523, 18, "2026-08-18"),
      f("cierre", 0, 0, null),
      f("registro", 29412, 24, "2026-08-24"),
    ]);
    expect(r.fuente).toBe("registro");
    expect(r.ultimoDia).toBe("2026-08-24");
  });

  it("cuando gana el reporte de Byte, la fecha es la suya", () => {
    const r = elegirFuenteVentas([
      f("byte", 34796, 31, "2026-07-31"),
      f("registro", 30350, 27, "2026-07-27"),
    ]);
    expect(r.ultimoDia).toBe("2026-07-31");
  });
});
