import { describe, it, expect } from "vitest";
import { computeMejorVendedor, type SellerFranjaRecord } from "./mejor-vendedor";

describe("mejor vendedor por franja (hándicap) — el ejemplo de Jahnn", () => {
  // Pico: lo normal S/30. Valle: lo normal S/20 (baseline fijado por dirección).
  const expected = { pico: 30, valle: 20 };

  it("gana el que más levanta su franja, no el de mayor ticket bruto", () => {
    const records: SellerFranjaRecord[] = [
      // Full time en pico: S/31 = apenas +1 sobre lo normal de su franja.
      { seller: "Full time", franja: "pico", ticketPersona: 31, clientes: 100 },
      // Medio turno en valle: S/23 = +3 sobre lo normal de su franja.
      { seller: "Medio turno", franja: "valle", ticketPersona: 23, clientes: 70 },
    ];
    const r = computeMejorVendedor({ records, minClientes: 60, expectedByFranja: expected });

    expect(r.ganador).toBe("Medio turno");     // +3 le gana a +1
    const ft = r.ranking.find((s) => s.seller === "Full time")!;
    const mt = r.ranking.find((s) => s.seller === "Medio turno")!;
    expect(ft.liftPromedio).toBe(1);
    expect(mt.liftPromedio).toBe(3);
    // El contraste: el Full time tiene MAYOR ticket bruto (31 > 23) y aún así pierde.
    expect(ft.ticketGlobal! > mt.ticketGlobal!).toBe(true);
    expect(r.ranking[0].seller).toBe("Medio turno"); // primero en el ranking
  });

  it("el mínimo de clientes descalifica el golpe de suerte de una o dos mesas", () => {
    const records: SellerFranjaRecord[] = [
      { seller: "Suertudo", franja: "valle", ticketPersona: 40, clientes: 2 },   // ticket altísimo, casi sin clientes
      { seller: "Constante", franja: "valle", ticketPersona: 24, clientes: 80 },
    ];
    const r = computeMejorVendedor({ records, minClientes: 60, expectedByFranja: expected });
    const suertudo = r.ranking.find((s) => s.seller === "Suertudo")!;
    expect(suertudo.elegible).toBe(false);
    expect(suertudo.notas.join(" ")).toMatch(/no califica/i);
    expect(r.ganador).toBe("Constante");       // gana el desempeño sostenido
  });

  it("un vendedor en varias franjas: promedia su lift ponderado por clientes", () => {
    const records: SellerFranjaRecord[] = [
      // Mitad en pico (+2) y mitad en valle (+4), pesos iguales → lift 3.
      { seller: "Mixto", franja: "pico", ticketPersona: 32, clientes: 50 },
      { seller: "Mixto", franja: "valle", ticketPersona: 24, clientes: 50 },
      { seller: "Otro", franja: "pico", ticketPersona: 30, clientes: 80 },
    ];
    const r = computeMejorVendedor({ records, minClientes: 60, expectedByFranja: expected });
    const mixto = r.ranking.find((s) => s.seller === "Mixto")!;
    expect(mixto.liftPromedio).toBe(3);        // (2*50 + 4*50)/100
    expect(mixto.totalClientes).toBe(100);
  });
});

describe("mejor vendedor — baseline empírico (sin baseline fijado)", () => {
  it("usa el promedio de la franja SIN el propio vendedor (no compite contra sí mismo)", () => {
    const records: SellerFranjaRecord[] = [
      { seller: "A", franja: "pico", ticketPersona: 34, clientes: 60 },
      { seller: "B", franja: "pico", ticketPersona: 30, clientes: 60 },
      { seller: "C", franja: "pico", ticketPersona: 26, clientes: 60 },
    ];
    const r = computeMejorVendedor({ records, minClientes: 60 });
    expect(r.usoEmpirico).toBe(true);
    // A se compara contra (B,C) = 28 → lift +6. Baseline de display (todos) = 30.
    const a = r.ranking.find((s) => s.seller === "A")!;
    expect(a.liftPromedio).toBe(6);
    expect(r.baselineByFranja.pico).toBe(30);
    expect(r.ganador).toBe("A");
  });

  it("si un vendedor es el único de su franja, esa franja no puntúa (con aviso)", () => {
    const records: SellerFranjaRecord[] = [
      { seller: "Solo", franja: "madrugada", ticketPersona: 50, clientes: 70 },
    ];
    const r = computeMejorVendedor({ records, minClientes: 60 });
    const solo = r.ranking.find((s) => s.seller === "Solo")!;
    expect(solo.liftPromedio).toBeNull();
    expect(solo.elegible).toBe(false);
    expect(solo.notas.join(" ")).toMatch(/único/i);
  });
});
