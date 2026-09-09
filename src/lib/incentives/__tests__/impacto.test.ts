/**
 * ¿El bono se paga solo? Los casos son los REALES de agosto 2026.
 *
 * Kelly dudó de la metodología en la reunión del 8-sep-2026 y tenía
 * razón en dudar: el bono de Centro fue el 21% de la utilidad operativa
 * del mes. Estos tests fijan la respuesta con los números auditados, y
 * sobre todo fijan los casos donde el programa NO se justifica — que son
 * los que le dan valor a la lámina.
 */
import { describe, it, expect } from "vitest";
import { evaluarImpacto, ticketDe, type MesUpselling, type SupuestoMargen } from "../impacto";

/** Los cuatro supuestos de margen auditados para Centro. */
const SUPUESTOS: SupuestoMargen[] = [
  { etiqueta: "Recetas del catálogo", margen: 0.676 },
  { etiqueta: "El del programa", margen: 0.598 },
  { etiqueta: "Contable jul+ago", margen: 0.509 },
  { etiqueta: "Contable solo agosto", margen: 0.454 },
];

// Centro, datos reales (presencial, sin delivery ni consumo del personal).
const JULIO: MesUpselling = { month: "2026-07", personas: 1442, venta: 36758.64, items: 3307 };
const AGOSTO: MesUpselling = { month: "2026-08", personas: 1626, venta: 46307.91, items: 4058 };

const centro = (over: Partial<Parameters<typeof evaluarImpacto>[0]> = {}) =>
  evaluarImpacto({
    sede: "Centro", base: JULIO, actual: AGOSTO,
    diasBase: 27, diasActual: 31, bonoPagado: 891, supuestos: SUPUESTOS, ...over,
  });

describe("Centro, agosto 2026: el caso que Kelly cuestionó", () => {
  it("el ticket subió de S/25.49 a S/28.48", () => {
    expect(ticketDe(JULIO)).toBeCloseTo(25.49, 2);
    expect(ticketDe(AGOSTO)).toBeCloseTo(28.48, 2);
  });

  it("la venta nueva son ~S/4,859, no la venta total del mes", () => {
    // El error que hay que evitar: mirar los S/46,786 del mes y creer
    // que el bono se paga de ahí. Se paga del salto, no del total.
    // El motor redondea el ticket a 2 decimales ANTES de multiplicar: el
    // número que se muestra en la lámina es el mismo con el que se calcula.
    expect(centro().ventaExtra).toBeCloseTo(4861.74, 2);
  });

  it("el tráfico NO subió: el ticket no se infló atendiendo a menos gente", () => {
    const r = centro();
    expect(r.personasDiaBase).toBeCloseTo(53.4, 1);
    expect(r.personasDiaActual).toBeCloseTo(52.5, 1);
    expect(r.personasDiaActual!).toBeLessThan(r.personasDiaBase!);
  });

  it("tres cuartos del alza vienen de vender MÁS UNIDADES, no de precio", () => {
    const r = centro();
    expect(r.itemsPorPersonaBase).toBeCloseTo(2.29, 2);
    expect(r.itemsPorPersonaActual).toBeCloseTo(2.5, 2);
    expect(r.aporteVolumenPct).toBeGreaterThan(70);
    expect(r.aporteVolumenPct).toBeLessThan(80);
  });

  it("se paga solo incluso con el peor supuesto de margen", () => {
    const r = centro();
    expect(r.veredicto).toBe("se_paga_solo");
    const peor = r.escenarios[r.escenarios.length - 1];
    expect(peor.utilidadExtra).toBeCloseTo(2207.23, 2);
    expect(peor.veces).toBeGreaterThanOrEqual(2.4);
  });

  it("el titular cita el PEOR escenario, no el mejor", () => {
    // Si citara el mejor, la lámina sería propaganda.
    expect(centro().titular).toContain("2,207");
  });
});

describe("los casos donde el programa NO se justifica", () => {
  it("si el ticket sube pero atendiendo a MENOS gente, se ve", () => {
    // 30% menos tráfico con el mismo gasto por cabeza: el ticket luce
    // igual, pero la sede vendió mucho menos.
    const menos: MesUpselling = { month: "2026-08", personas: 1000, venta: 28480, items: 2500 };
    const r = centro({ actual: menos });
    expect(r.personasDiaActual!).toBeLessThan(r.personasDiaBase!);
    expect(r.ventaExtra).toBeCloseTo(2990, -1);   // menos venta nueva que con tráfico normal
  });

  it("si el alza fue solo de PRECIO, el aporte de volumen se cae", () => {
    // Mismos ítems por persona, ticket más alto = subieron los precios.
    const soloPrecio: MesUpselling = { month: "2026-08", personas: 1626, venta: 46307.91, items: 3727 };
    const r = centro({ actual: soloPrecio });
    expect(r.aporteVolumenPct).toBeLessThan(5);
  });

  it("con un bono grande frente a la venta nueva, dice NO SE PAGA", () => {
    const r = centro({ bonoPagado: 3000 });
    expect(r.veredicto).toBe("no_se_paga");
    expect(r.titular).toContain("revisar la política");
  });

  it("entre 1× y 2× el bono queda AJUSTADO, ni bien ni mal", () => {
    const r = centro({ bonoPagado: 1500 });
    expect(r.veredicto).toBe("ajustado");
    expect(r.titular).toContain("al límite");
  });

  it("si el ticket BAJÓ, la venta nueva es negativa y se dice", () => {
    const peor: MesUpselling = { month: "2026-08", personas: 1626, venta: 38000, items: 3500 };
    const r = centro({ actual: peor });
    expect(r.ventaExtra).toBeLessThan(0);
    expect(r.veredicto).toBe("no_se_paga");
  });
});

describe("no inventa cuando faltan datos", () => {
  it("sin personas del mes base no calcula nada", () => {
    const r = centro({ base: { month: "2026-07", personas: 0, venta: 0, items: null } });
    expect(r.veredicto).toBe("sin_datos");
    expect(r.escenarios).toEqual([]);
  });

  it("sin ítems, el aporte de volumen queda en null y no en cero", () => {
    // Cero diría "nada vino de volumen", que es una afirmación. null
    // dice "no sé", que es la verdad.
    const r = centro({ base: { ...JULIO, items: null } });
    expect(r.aporteVolumenPct).toBeNull();
    expect(r.veredicto).toBe("se_paga_solo");
  });
});

describe("Fonavi: no llegó al nivel, pero el ticket igual subió", () => {
  it("sin bono pagado, igual mide la venta nueva", () => {
    const r = evaluarImpacto({
      sede: "Fonavi",
      base: { month: "2026-07", personas: 1279, venta: 28281.05, items: 2967 },
      actual: { month: "2026-08", personas: 1482, venta: 34966.18, items: 3803 },
      diasBase: 27, diasActual: 31, bonoPagado: 0,
      supuestos: [{ etiqueta: "El del programa", margen: 0.533 }],
    });
    expect(r.ventaExtra).toBeCloseTo(2193.36, 2);
    // En Fonavi el precio por ítem BAJÓ: el volumen explica más del 100%.
    expect(r.aporteVolumenPct).toBeGreaterThan(100);
  });
});

describe("el mes SIN bono no es un mes fallido", () => {
  // El bug que casi llega a la reunión: con bono 0 la división daba
  // 0× y el veredicto salía "no_se_paga" — exactamente lo contrario de
  // la verdad. Fonavi en agosto no llegó a la meta, no costó un sol, y
  // su ticket igual subió S/1.48.
  const sinBono = () =>
    evaluarImpacto({
      sede: "Fonavi",
      base: { month: "2026-07", personas: 1279, venta: 28281.05, items: 2967 },
      actual: { month: "2026-08", personas: 1482, venta: 34966.18, items: 3803 },
      diasBase: 27, diasActual: 31, bonoPagado: 0,
      supuestos: [{ etiqueta: "El del programa", margen: 0.533 }],
    });

  it("dice SIN BONO, no 'no se paga'", () => {
    expect(sinBono().veredicto).toBe("sin_bono");
  });

  it("el titular cuenta la mejora, no un fracaso", () => {
    const t = sinBono().titular;
    expect(t).toContain("no se pagó bono");
    expect(t).toContain("sin costar un sol");
    expect(t).not.toContain("revisar la política");
  });

  it("si además el ticket bajó, no se inventa una buena noticia", () => {
    const r = evaluarImpacto({
      sede: "Fonavi",
      base: { month: "2026-07", personas: 1279, venta: 28281.05, items: 2967 },
      actual: { month: "2026-08", personas: 1482, venta: 30000, items: 3200 },
      diasBase: 27, diasActual: 31, bonoPagado: 0,
      supuestos: [{ etiqueta: "El del programa", margen: 0.533 }],
    });
    expect(r.ventaExtra).toBeLessThan(0);
    expect(r.veredicto).toBe("sin_bono");
    expect(r.titular).toContain("tampoco mejoró");
  });
});
