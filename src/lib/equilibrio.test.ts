import { describe, it, expect } from "vitest";
import { analizarEquilibrio, curvaEquilibrio, simular, pisoDiario, ESCENARIO_BASE, type BaseEquilibrio } from "./equilibrio";

// Ejemplo del libro: Cafetería «El Grano». Fijos 3,200; precio promedio por venta 8.50; costo variable 3.20; vende 7,500.
const elGrano: BaseEquilibrio = { fijos: 3200, varRatio: 3.2 / 8.5, ventas: 7500, ticket: 8.5, diasDelMes: 30, financiamiento: 0 };

describe("punto de equilibrio como en el libro", () => {
  it("El Grano: margen de contribución S/5.30 por venta → 604 ventas al mes", () => {
    const a = analizarEquilibrio(elGrano);
    expect(a.mcVenta).toBe(5.3);
    expect(a.costoVariableVenta).toBe(3.2);
    expect(a.peVentas).toBe(604);
    // En soles: 3,200 ÷ (5.30/8.50) = 5,132 (el libro redondea antes: 604 × 8.50 = 5,134).
    expect(a.pe).toBeCloseTo(5132.08, 1);
    expect(a.estado).toBe("sobre");
  });

  it("margen de seguridad: lo que pueden bajar las ventas antes de perder", () => {
    const a = analizarEquilibrio(elGrano);
    expect(a.margenSeguridad).toBeCloseTo(2367.92, 1); // el libro: ~2,366
    expect(a.margenSeguridadPct).toBeCloseTo(31.6, 1);
  });

  it("si vende 4,500 pierde lo que deja ese faltante, no el faltante entero", () => {
    // El libro dice «pierde $634» (5,134 − 4,500): eso es lo que falta VENDER. Lo que se pierde de
    // verdad es el margen de esas ventas que faltan: (4,500 × 62.4%) − 3,200 ≈ −394.
    const a = analizarEquilibrio({ ...elGrano, ventas: 4500 });
    expect(a.estado).toBe("debajo");
    expect(a.margenSeguridad).toBeCloseTo(-632.08, 1);
    expect(a.utilidad).toBeCloseTo(-394.12, 1);
  });

  it("segundo ejemplo: fijos 2,000, precio 10, costo 6 → 500 ventas y S/5,000", () => {
    const a = analizarEquilibrio({ fijos: 2000, varRatio: 0.6, ventas: 6000, ticket: 10, diasDelMes: 30, financiamiento: 0 });
    expect(a.peVentas).toBe(500);
    expect(a.pe).toBe(5000);
    expect(a.peDia).toBeCloseTo(166.67, 1);
  });

  it("Fonavi setiembre con sus números: ~1,084 ventas al mes para cubrir sus fijos", () => {
    const a = analizarEquilibrio({ fijos: 13820, varRatio: 17241 / 37297, ventas: 37297, ticket: 23.71, diasDelMes: 30, financiamiento: 1814 });
    expect(a.pe).toBeCloseTo(25701, -1);
    expect(a.peVentas).toBeGreaterThan(1080);
    expect(a.peVentas).toBeLessThan(1090);
    expect(a.peVentasDia).toBeCloseTo(36.2, 0);
    expect(a.peConDeudas! - a.pe!).toBeCloseTo(1814 / a.mc!, 0);
  });

  it("sin ticket (no se sabe cuántas ventas) solo da los soles", () => {
    const a = analizarEquilibrio({ ...elGrano, ticket: null });
    expect(a.pe).not.toBeNull();
    expect(a.peVentas).toBeNull();
    expect(a.mcVenta).toBeNull();
  });

  it("sin margen: los costos variables comen toda la venta", () => {
    const a = analizarEquilibrio({ ...elGrano, varRatio: 1.05 });
    expect(a.estado).toBe("sin-margen");
    expect(a.pe).toBeNull();
    expect(a.utilidad).toBeLessThan(0);
  });

  it("sin fijos o sin ventas no inventa nada", () => {
    expect(analizarEquilibrio({ ...elGrano, fijos: 0 }).estado).toBe("sin-datos");
    expect(analizarEquilibrio({ ...elGrano, ventas: 0 }).estado).toBe("sin-datos");
  });
});

describe("la gráfica", () => {
  it("ingresos y costos totales se cruzan en el punto de equilibrio; los fijos son una recta plana", () => {
    const a = analizarEquilibrio(elGrano);
    const c = curvaEquilibrio(elGrano, a)!;
    expect(c.eje).toBe("ventas");
    expect(c.equilibrio!.x).toBeCloseTo(603.77, 1);
    expect(c.equilibrio!.y).toBeCloseTo(a.pe!, 1);
    expect(c.actual!.x).toBeCloseTo(882.35, 1);
    expect(c.puntos[0]).toEqual({ x: 0, ingresos: 0, costos: 3200, fijos: 3200 });
    expect(c.puntos.every((p) => p.fijos === 3200)).toBe(true);
    expect(c.xMax).toBeGreaterThan(c.actual!.x);
    // Antes del cruce se pierde, después se gana.
    const antes = c.puntos.filter((p) => p.x < c.equilibrio!.x);
    const despues = c.puntos.filter((p) => p.x > c.equilibrio!.x);
    expect(antes.every((p) => p.ingresos < p.costos)).toBe(true);
    expect(despues.every((p) => p.ingresos > p.costos)).toBe(true);
  });

  it("sin ticket el eje es en soles", () => {
    const b = { ...elGrano, ticket: null };
    expect(curvaEquilibrio(b, analizarEquilibrio(b))!.eje).toBe("soles");
  });

  it("sin equilibrio no hay gráfica", () => {
    const b = { ...elGrano, varRatio: 1.2 };
    expect(curvaEquilibrio(b, analizarEquilibrio(b))).toBeNull();
  });
});

describe("¿y si…? (los cuatro usos del libro)", () => {
  it("sin cambios, no cambia nada", () => {
    const s = simular(elGrano, ESCENARIO_BASE);
    expect(s.despues.pe).toBe(s.antes.pe);
    expect(s.frases).toEqual([]);
  });

  it("evaluar un gasto nuevo: cuánto más hay que vender para pagarlo", () => {
    const s = simular(elGrano, { ...ESCENARIO_BASE, gastoNuevo: 530 });
    // 530 ÷ 62.35% = 850 en ventas; 530 ÷ 5.30 = 100 ventas al mes ≈ 3.3 por día.
    expect(s.ventasExtraMes).toBeCloseTo(850, 0);
    expect(s.ventasExtraDia).toBeCloseTo(3.3, 1);
    expect(s.despues.peVentas).toBe(704);
    expect(s.frases[0]).toMatch(/Para pagar S\/530 más al mes hay que vender S\/850 más/);
  });

  it("ajustar precios: subir 10% baja el piso (el costo de cada venta no cambia)", () => {
    const s = simular(elGrano, { ...ESCENARIO_BASE, precioPct: 10 });
    expect(s.nuevo.ticket).toBeCloseTo(9.35, 2);
    expect(s.despues.costoVariableVenta).toBeCloseTo(3.2, 2);
    expect(s.despues.peVentas!).toBeLessThan(s.antes.peVentas!);
    expect(s.frases.some((f) => /no bajan al cambiar el precio/.test(f))).toBe(true);
  });

  it("si suben los insumos, sube el piso", () => {
    const s = simular(elGrano, { ...ESCENARIO_BASE, costoVariablePct: 20 });
    expect(s.despues.pe!).toBeGreaterThan(s.antes.pe!);
  });

  it("un mes difícil: si las ventas bajan 45%, queda debajo del equilibrio y lo dice", () => {
    const s = simular(elGrano, { ...ESCENARIO_BASE, cantidadPct: -45 });
    expect(s.despues.estado).toBe("debajo");
    expect(s.despues.utilidad!).toBeLessThan(0);
    expect(s.frases.some((f) => /quedaría debajo de su punto de equilibrio/.test(f))).toBe(true);
    expect(s.frases.some((f) => /una pérdida de/.test(f))).toBe(true);
  });

  it("si los insumos suben tanto que no queda margen, lo dice claro", () => {
    const s = simular(elGrano, { ...ESCENARIO_BASE, costoVariablePct: 200 });
    expect(s.despues.estado).toBe("sin-margen");
    expect(s.frases.some((f) => /no hay volumen que alcance/.test(f))).toBe(true);
  });
});

describe("el piso diario de la asesoría (15-oct-2026)", () => {
  it("el ejemplo del coach: ventas proyectadas S/57,000, fijos S/19,000 y food cost S/19,000 → S/1,266.67 por día", () => {
    const p = pisoDiario({ fijos: 19000, varRatio: 1 / 3, ventasEsperadas: 57000 });
    expect(p).toMatchObject({ fijos: 19000, foodCost: 19000, mes: 38000, dia: 1266.67 });
  });

  it("el sueldo de los socios sale de los fijos solo si el CEO lo pasó a la utilidad", () => {
    const base = { fijos: 19000, varRatio: 1 / 3, ventasEsperadas: 57000, sueldoSocios: 1000 };
    expect(pisoDiario(base)!.mes).toBe(38000);
    const fuera = pisoDiario({ ...base, sociosFuera: true })!;
    expect(fuera).toMatchObject({ fijos: 18000, mes: 37000, sociosFuera: 1000 });
  });

  it("sin fijos, sin venta esperada o con un % de variables imposible no hay piso", () => {
    expect(pisoDiario({ fijos: 0, varRatio: 0.3, ventasEsperadas: 1000 })).toBeNull();
    expect(pisoDiario({ fijos: 1000, varRatio: 0.3, ventasEsperadas: 0 })).toBeNull();
    expect(pisoDiario({ fijos: 1000, varRatio: NaN, ventasEsperadas: 1000 })).toBeNull();
  });

  it("en el análisis: cuánto sobra o falta contra el piso, en tickets y con las cuotas", () => {
    const a = analizarEquilibrio({ fijos: 19000, varRatio: 1 / 3, ventas: 57000, ticket: 19, diasDelMes: 30, financiamiento: 2000 });
    expect(a.piso?.mes).toBe(38000);
    expect(a.estadoPiso).toBe("sobre");
    expect(a.sobrePiso).toBe(19000);
    expect(a.sobrePisoPct).toBe(33.3);
    expect(a.pisoVentas).toBe(2000);
    expect(a.pisoVentasDia).toBe(66.7);
    expect(a.pisoConDeudas).toBe(40000);
  });

  it("vende menos que el piso: debajo, aunque el cálculo del libro aún lo vea sobre su punto de equilibrio", () => {
    // Fijos 19,000, variables 33%: el libro pide 28,500; el piso del coach (con las compras del mes), 38,000.
    const a = analizarEquilibrio({ fijos: 19000, varRatio: 1 / 3, ventas: 30000, ticket: null, diasDelMes: 30, financiamiento: 0, ventasEsperadas: 57000 });
    expect(a.estado).toBe("sobre");
    expect(a.estadoPiso).toBe("debajo");
    expect(a.sobrePiso).toBe(-8000);
  });

  it("la venta esperada define el food cost, no la venta real del mes", () => {
    const a = analizarEquilibrio({ fijos: 10000, varRatio: 0.4, ventas: 5000, ticket: null, diasDelMes: 30, financiamiento: 0, ventasEsperadas: 30000 });
    expect(a.piso?.foodCost).toBe(12000);
    expect(a.piso?.mes).toBe(22000);
  });
});
