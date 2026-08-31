import { describe, it, expect } from "vitest";
import { evaluarReembolso, esReembolsoEntreSedes } from "../reembolsos-entre-sedes";

describe("plata que vuelve de otra sede", () => {
  it("reconoce a la empresa del grupo que paga", () => {
    const r = evaluarReembolso("REEMBOLSO POR % PAGO DE ALQUILER (EXPERIENCIAS GASTRONOMICAS YAYIS SRL)");
    expect(r.origen).toBe("grupo");
    expect(r.quien).toBe("EXPERIENCIAS GASTRONOMICAS");
  });

  it("mira QUIÉN paga, no de qué era la compra", () => {
    // El caso que enseñó la regla: acá "SODIMAC" es el motivo, no el que
    // devuelve. El que devuelve es la sede. Buscar "Sodimac" para decidir
    // sería exactamente el error contrario.
    expect(esReembolsoEntreSedes(
      "REEMBOLSO POR COMPRA EN SODIMAC (EXPERIENCIAS GASTRONOMICAS YAYIS SRL)",
    )).toBe(true);
  });

  it("entiende una devolución igual que un reembolso", () => {
    expect(esReembolsoEntreSedes(
      "DEVOLUCIÓN POR PAGO MAL EJECUTADO (EXPERIENCIAS GASTRONOMICAS YAYIS SRL)",
    )).toBe(true);
  });

  it("entiende las notas que escribía Jahnn a mano", () => {
    for (const n of ["Reembolso Fonavi — Agua 1er piso", "Reembolso Centro — Auspicio", "Reembolso Fonavi"]) {
      expect(esReembolsoEntreSedes(n), n).toBe(true);
    }
  });

  it("ignora tildes y minúsculas", () => {
    expect(esReembolsoEntreSedes("devolución de fonavi por el agua")).toBe(true);
  });
});

describe("lo que NO es plata de otra sede", () => {
  it("una devolución de proveedor", () => {
    const r = evaluarReembolso("REEMBOLSO POR EXCESO D COBRO EN COMPRA (ONDA ORGANICA)");
    expect(r.origen).toBe("tercero");
    expect(r.motivo).toContain("proveedor");
  });

  it("otras devoluciones de terceros vistas en agosto", () => {
    expect(evaluarReembolso("DEVOLUCIÓN POR MERMA (RONALD CHILON)").origen).toBe("tercero");
    expect(evaluarReembolso("REEMBOLSO POR 50% IGV QUE NO SE HIZO EFECTIVO (AROMAS)").origen).toBe("tercero");
  });

  it("una venta normal, aunque mencione a Fonavi", () => {
    // Sin la palabra que indica que la plata VUELVE, no se toca: un cobro
    // a Fonavi por mercadería es una venta de verdad.
    const r = evaluarReembolso("PAGO DE PEDIDO (EXPERIENCIAS GASTRONOMICAS YAYIS SRL)");
    expect(r.origen).toBe("no-es-reembolso");
  });

  it("no revienta con vacío ni con null", () => {
    expect(evaluarReembolso("").origen).toBe("no-es-reembolso");
    expect(evaluarReembolso(null).origen).toBe("no-es-reembolso");
    expect(esReembolsoEntreSedes(undefined)).toBe(false);
  });
});
