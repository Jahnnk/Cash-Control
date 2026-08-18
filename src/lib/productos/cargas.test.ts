/**
 * Tests del control de cargas del reporte de productos.
 *
 * Lo que se clava: que una carga puntual pero TRUNCADA no se pinte en
 * verde. Ese es el caso que se cuela — Centro subió agosto a tiempo,
 * con 10 productos de los ~110 que trae siempre, y todo parecía bien.
 */
import { describe, it, expect } from "vitest";
import {
  ultimoSabado, diasEntre, evaluarCarga, evaluarCargas, resumenPendientes,
  type CargaSede,
} from "./cargas";

// Martes 18 de agosto de 2026. El sábado anterior fue el 15.
const HOY = "2026-08-18";

const carga = (o: Partial<CargaSede> = {}): CargaSede => ({
  businessId: 2, sede: "Fonavi",
  ultimaCarga: "2026-08-15", ultimoMes: "2026-08",
  productosUltimaCarga: 118, productosHabitual: 115,
  ...o,
});

describe("ultimoSabado", () => {
  it("un martes devuelve el sábado anterior", () => {
    expect(ultimoSabado("2026-08-18")).toBe("2026-08-15");
  });

  it("un sábado se devuelve a sí mismo", () => {
    expect(ultimoSabado("2026-08-15")).toBe("2026-08-15");
  });

  it("un domingo devuelve el sábado de ayer", () => {
    expect(ultimoSabado("2026-08-16")).toBe("2026-08-15");
  });

  it("cruza bien el cambio de mes", () => {
    expect(ultimoSabado("2026-09-02")).toBe("2026-08-29");
  });
});

describe("diasEntre", () => {
  it("cuenta días enteros", () => {
    expect(diasEntre("2026-08-15", "2026-08-18")).toBe(3);
  });
  it("cruza meses", () => {
    expect(diasEntre("2026-07-03", "2026-08-18")).toBe(46);
  });
});

describe("al día vs atrasado", () => {
  it("subido el sábado pasado está al día", () => {
    const r = evaluarCarga(carga({ ultimaCarga: "2026-08-15" }), HOY);
    expect(r.estado).toBe("al-dia");
  });

  it("subido el domingo (después del sábado) también está al día", () => {
    const r = evaluarCarga(carga({ ultimaCarga: "2026-08-16" }), HOY);
    expect(r.estado).toBe("al-dia");
  });

  it("subido el sábado ANTERIOR ya está atrasado", () => {
    const r = evaluarCarga(carga({ ultimaCarga: "2026-08-08" }), HOY);
    expect(r.estado).toBe("atrasado");
    expect(r.detalle).toContain("1 sábado");
  });

  it("el caso real de Atelier: 46 días sin subir", () => {
    const r = evaluarCarga(
      carga({ sede: "Atelier", businessId: 1, ultimaCarga: "2026-07-03", ultimoMes: "2026-06" }),
      HOY,
    );
    expect(r.estado).toBe("atrasado");
    expect(r.diasSinSubir).toBe(46);
    expect(r.detalle).toContain("6 sábados");
  });

  it("una sede que nunca subió no se confunde con una atrasada", () => {
    const r = evaluarCarga(carga({ ultimaCarga: null, productosUltimaCarga: 0, productosHabitual: null }), HOY);
    expect(r.estado).toBe("nunca");
    expect(r.diasSinSubir).toBeNull();
  });
});

describe("cargas truncadas (el caso que se cuela)", () => {
  it("el caso real de Centro: 10 productos de ~110, puntual pero incompleta", () => {
    // Subió a tiempo, así que la puntualidad diría "al día". Lo que
    // importa es que los datos no sirven.
    const r = evaluarCarga(
      carga({ sede: "Centro", businessId: 3, ultimaCarga: "2026-08-16",
              productosUltimaCarga: 10, productosHabitual: 109 }),
      HOY,
    );
    expect(r.estado).toBe("incompleto");
    expect(r.detalle).toContain("10 productos");
    expect(r.detalle).toContain("Top 10");
  });

  it("un mes algo más flojo NO se marca como incompleto", () => {
    // 81 de ~115 es menos, pero no es una carga rota. El umbral es la
    // mitad justamente para no gritar por variación normal.
    const r = evaluarCarga(carga({ productosUltimaCarga: 81, productosHabitual: 115 }), HOY);
    expect(r.estado).toBe("al-dia");
  });

  it("sin historial no acusa de incompleta a la primera carga", () => {
    const r = evaluarCarga(carga({ productosUltimaCarga: 12, productosHabitual: null }), HOY);
    expect(r.estado).toBe("al-dia");
  });

  it("lo truncado pesa más que lo atrasado: avisa del dato, no de la fecha", () => {
    const r = evaluarCarga(
      carga({ ultimaCarga: "2026-07-03", productosUltimaCarga: 5, productosHabitual: 110 }),
      HOY,
    );
    expect(r.estado).toBe("incompleto");
  });
});

describe("resumen de las 3 sedes", () => {
  const REAL: CargaSede[] = [
    { businessId: 1, sede: "Atelier", ultimaCarga: "2026-07-03", ultimoMes: "2026-06", productosUltimaCarga: 80, productosHabitual: 80 },
    { businessId: 2, sede: "Fonavi", ultimaCarga: "2026-08-16", ultimoMes: "2026-08", productosUltimaCarga: 118, productosHabitual: 115 },
    { businessId: 3, sede: "Centro", ultimaCarga: "2026-08-16", ultimoMes: "2026-08", productosUltimaCarga: 10, productosHabitual: 109 },
  ];

  it("reproduce el estado real de hoy", () => {
    const r = evaluarCargas(REAL, HOY);
    expect(r.todoAlDia).toBe(false);
    expect(r.sedes.find((s) => s.sede === "Fonavi")!.estado).toBe("al-dia");
    expect(r.sedes.find((s) => s.sede === "Atelier")!.estado).toBe("atrasado");
    expect(r.sedes.find((s) => s.sede === "Centro")!.estado).toBe("incompleto");
  });

  it("ordena lo pendiente por antigüedad: primero lo más viejo", () => {
    const r = evaluarCargas(REAL, HOY);
    expect(r.pendientes[0].sede).toBe("Atelier");
  });

  it("arma la frase de resumen", () => {
    expect(resumenPendientes(evaluarCargas(REAL, HOY)))
      .toBe("Atelier (46 días) · Centro (carga incompleta)");
  });

  it("todoAlDia solo cuando de verdad no falta nada", () => {
    const r = evaluarCargas(
      REAL.map((c) => ({ ...c, ultimaCarga: "2026-08-15", productosUltimaCarga: 110, productosHabitual: 109 })),
      HOY,
    );
    expect(r.todoAlDia).toBe(true);
    expect(resumenPendientes(r)).toBe("");
  });
});
