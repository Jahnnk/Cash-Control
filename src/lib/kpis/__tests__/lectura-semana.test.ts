import { describe, expect, it } from "vitest";
import {
  avanceNivel, hallazgosCafeteria, hallazgosEquilibrio, hallazgosIncentivos,
  lecturaAtelier, lecturaCafeteria, lecturaVentas, peorTono,
  type ResumenCafeteria, type ResumenIncentivo,
} from "../lectura-semana";

const cafe = (o: Partial<ResumenCafeteria> = {}): ResumenCafeteria => ({
  sede: "Fonavi", ventasPct: 104, ticketPct: 101, nps: 82, npsMin: 70, mermasPct: 3, mermasMaxPct: 0.05,
  traffic: { ventas: "verde", ticket: "verde", nps: "verde", mermas: "verde" },
  ...o,
});

describe("peorTono", () => {
  it("rojo gana a todo; gris solo si no hay otro", () => {
    expect(peorTono("verde", "rojo", "ambar")).toBe("rojo");
    expect(peorTono("verde", "gris")).toBe("verde");
    expect(peorTono()).toBe("gris");
  });
});

describe("lecturaCafeteria", () => {
  it("semana en meta: una línea para NPS y merma y acción de mantener", () => {
    const l = lecturaCafeteria(cafe());
    expect(l.tono).toBe("verde");
    expect(l.puntos).toEqual(["Ventas 4% sobre la meta.", "Ticket 1% sobre la referencia.", "NPS en meta y merma en rango."]);
    expect(l.accion).toMatch(/mantener/i);
  });

  it("ventas en rojo manda en la acción aunque la merma esté mal", () => {
    const l = lecturaCafeteria(cafe({
      ventasPct: 88, mermasPct: 7,
      traffic: { ventas: "rojo", ticket: "verde", nps: "verde", mermas: "rojo" },
    }));
    expect(l.tono).toBe("rojo");
    expect(l.puntos[0]).toBe("Ventas 12% por debajo de la meta.");
    expect(l.puntos).toContain("Merma por encima del rango (7%, máx. 5%).");
    expect(l.accion).toMatch(/recuperar las ventas/);
  });

  it("casi en meta lo dice con el signo", () => {
    const l = lecturaCafeteria(cafe({ ticketPct: 97, traffic: { ventas: "verde", ticket: "ambar", nps: "verde", mermas: "verde" } }));
    expect(l.puntos[1]).toBe("Ticket casi en referencia (−3%).");
    expect(l.tono).toBe("ambar");
  });
});

describe("lecturaAtelier", () => {
  it("no tiene meta: tono gris y pide definirla", () => {
    const l = lecturaAtelier({ ventasTotal: 8123.4, dias: 6, ticketProm: 95.5, mermasPct: 2, mermasMaxPct: 0.04 });
    expect(l.tono).toBe("gris");
    expect(l.puntos).toContain("Merma en rango.");
    expect(l.accion).toMatch(/meta/);
  });
});

describe("lecturaVentas", () => {
  it("umbrales del acumulado: ±2 verde, hasta −10 ámbar, más rojo", () => {
    expect(lecturaVentas({ sede: "Centro", deltaSemanaPct: 1, deltaMesPct: -1.5, esAtelier: false }).tono).toBe("verde");
    expect(lecturaVentas({ sede: "Centro", deltaSemanaPct: -6, deltaMesPct: -6, esAtelier: false }).tono).toBe("ambar");
    const r = lecturaVentas({ sede: "Centro", deltaSemanaPct: -12, deltaMesPct: -14, esAtelier: false });
    expect(r.tono).toBe("rojo");
    expect(r.puntos[1]).toBe("Caída importante en la semana (−12%).");
    expect(r.accion).toMatch(/plan de acción/);
  });

  it("Atelier en baja apunta a la cartera B2B; sin mes anterior no evalúa", () => {
    expect(lecturaVentas({ sede: "Atelier", deltaSemanaPct: null, deltaMesPct: -4, esAtelier: true }).accion).toMatch(/B2B/);
    const s = lecturaVentas({ sede: "Atelier", deltaSemanaPct: null, deltaMesPct: null, esAtelier: true });
    expect(s.tono).toBe("gris");
    expect(s.accion).toMatch(/mes anterior/);
  });
});

describe("hallazgosCafeteria", () => {
  it("nombra el peor día solo cuando las ventas no están en meta", () => {
    const base = { ventasProm: 1254.47, ticketProm: 18.2, peorDiaVentas: { dia: "Mar 16", valor: 980 } };
    const bien = hallazgosCafeteria({ ...cafe(), ...base });
    expect(bien[0].texto).not.toMatch(/Mar 16/);
    const mal = hallazgosCafeteria({ ...cafe({ ventasPct: 90, traffic: { ventas: "rojo", ticket: "verde", nps: "verde", mermas: "verde" } }), ...base });
    expect(mal[0].titulo).toBe("Ventas bajo la meta");
    expect(mal[0].texto).toMatch(/Mar 16 fue el día más bajo/);
    expect(mal[2].titulo).toBe("NPS y mermas en buen nivel");
  });
});

describe("avanceNivel", () => {
  it("cuánto del aumento de ticket ya se logró (+1.31 de +1.50 = 87%)", () => {
    expect(avanceNivel(1.31, 1.5)).toBe(87);
    expect(avanceNivel(2, 1.5)).toBe(100);
    expect(avanceNivel(-0.4, 1.5)).toBe(0);
    expect(avanceNivel(null, 1.5)).toBe(0);
  });
});

describe("hallazgosIncentivos", () => {
  const inc = (o: Partial<ResumenIncentivo>): ResumenIncentivo => ({
    sede: "Fonavi", deltaActual: 1.31, personasPorDia: 120, trafficFloor: 100, trafficOk: true,
    candado: null, avanceProximo: { nivel: "Nivel 2", pct: 87 }, nivelAlcanzado: "Nivel 1", ...o,
  });

  it("ambas suben, piso de tráfico ok y mismo nivel casi alcanzado", () => {
    const h = hallazgosIncentivos([inc({}), inc({ sede: "Centro", deltaActual: 0.9, avanceProximo: { nivel: "Nivel 2", pct: 82 } })]);
    expect(h.map((x) => x.titulo)).toEqual(["Ambas sedes aumentan el ticket", "Tráfico en el piso objetivo", "Nivel 2 casi alcanzado"]);
  });

  it("con candado de ventas reemplaza al piso de tráfico", () => {
    const h = hallazgosIncentivos([inc({ candado: { meta: 40000, proyeccion: 36000, cumple: false, enCamino: false } })]);
    expect(h[1].titulo).toBe("Meta de ventas en riesgo");
    expect(h[1].tono).toBe("rojo");
  });
});

describe("hallazgosEquilibrio", () => {
  it("una sede debajo, las demás en ganancia y el grupo", () => {
    const h = hallazgosEquilibrio(
      [
        { nombre: "Centro", avancePct: 64, falta: 5200, superado: false, sinDatos: false },
        { nombre: "Fonavi", avancePct: 112, falta: null, superado: true, sinDatos: false },
        { nombre: "Atelier", avancePct: 104, falta: null, superado: true, sinDatos: false },
      ],
      { nombre: "Grupo", avancePct: 93, falta: 1800, superado: false, sinDatos: false },
    );
    expect(h.map((x) => x.titulo)).toEqual(["Centro por debajo", "Fonavi y Atelier ya en ganancia", "Grupo casi en equilibrio"]);
    expect(h[0].texto).toMatch(/Faltan S\/5,200/);
  });
});
