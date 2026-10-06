import { describe, expect, it } from "vitest";
import { AREAS, areaDe, armarEmpresa, armarSede, mayoresDesvios, modoPorDefecto, montoDe, sugerir, CATEGORIAS_PRESUPUESTABLES, type EntradaSede } from "./presupuesto";
import { CATEGORIAS_GASTO } from "./reglas-gasto";

const cerrado = { enCurso: false, avanceMes: 100 };
const enCurso = { enCurso: true, avanceMes: 20 };

const fonavi = (o: Partial<EntradaSede> = {}): EntradaSede => ({
  businessId: 2, sede: "Fonavi", ventaEsperada: 40000, ventaReal: 50000,
  lineas: [
    { categoria: "PLANILLA", modo: "soles", valor: 10000 },
    { categoria: "INSUMOS", modo: "pct", valor: 20 },
    { categoria: "MARKETING", modo: "soles", valor: 300 },
  ],
  real: { PLANILLA: 10500, INSUMOS: 9500, MARKETING: 450, LIMPIEZA: 200, "PRÉSTAMOS ENTRE SEDES": 5000 },
  ...o,
});

describe("áreas", () => {
  it("cada categoría de la lista única está en exactamente un área", () => {
    for (const c of CATEGORIAS_GASTO) expect(AREAS.filter((a) => a.categorias.includes(c.nombre)).length, c.nombre).toBe(1);
  });
  it("lo desconocido no se presupuesta", () => {
    expect(areaDe("CATEGORÍA RARA").bloque).toBe("fuera");
    expect(CATEGORIAS_PRESUPUESTABLES).not.toContain("POR ACLARAR");
    expect(CATEGORIAS_PRESUPUESTABLES).not.toContain("PRÉSTAMOS ENTRE SEDES");
  });
  it("fijos en soles, variables en %", () => {
    expect(modoPorDefecto("PLANILLA")).toBe("soles");
    expect(modoPorDefecto("INSUMOS")).toBe("pct");
    expect(modoPorDefecto("PRÉSTAMOS Y TARJETAS")).toBe("soles");
  });
});

describe("presupuesto contra real", () => {
  it("mes cerrado: el % se aplica a la venta real (no se castiga un buen mes)", () => {
    const s = armarSede(fonavi(), cerrado);
    const ins = s.areas.find((a) => a.area.id === "produccion")!.categorias.find((c) => c.categoria === "INSUMOS")!;
    expect(s.ventaBaseEs).toBe("real");
    expect(ins.presupuestado).toBe(10000); // 20% de 50,000
    expect(ins.ejecucion).toBe(95);
    expect(ins.semaforo).toBe("verde");
  });
  it("mes en curso: el % se aplica a la venta esperada", () => {
    expect(montoDe({ categoria: "INSUMOS", modo: "pct", valor: 20 }, 40000)).toBe(8000);
    const s = armarSede(fonavi({ real: { INSUMOS: 3000 } }), enCurso);
    const ins = s.areas[0].categorias.find((c) => c.categoria === "INSUMOS")!;
    expect(s.ventaBaseEs).toBe("esperada");
    expect(ins.presupuestado).toBe(8000);
    // 37.5% ejecutado con el 20% del mes: va adelantado.
    expect(ins.semaforo).toBe("ambar");
  });
  it("hasta 10% de más es precaución; más es rojo; sin plan se marca", () => {
    const s = armarSede(fonavi(), cerrado);
    const cat = (n: string) => s.areas.flatMap((a) => a.categorias).find((c) => c.categoria === n)!;
    expect(cat("PLANILLA").semaforo).toBe("ambar"); // 105%
    expect(cat("PLANILLA").variacion).toBe(500);
    expect(cat("MARKETING").semaforo).toBe("rojo"); // 150%
    expect(cat("LIMPIEZA").semaforo).toBe("sin-plan");
  });
  it("lo que no se presupuesta se muestra pero no suma al total", () => {
    const s = armarSede(fonavi(), cerrado);
    expect(s.bloques.fuera.real).toBe(5000);
    expect(s.real).toBe(10500 + 9500 + 450 + 200);
    expect(s.presupuestado).toBe(10000 + 10000 + 300);
    // Verde en el total no esconde una categoría pasada.
    expect(s.semaforo).not.toBe("verde");
  });
  it("la empresa es la suma de las sedes", () => {
    const a = armarSede(fonavi(), cerrado);
    const b = armarSede(fonavi({ businessId: 3, sede: "Centro" }), cerrado);
    const e = armarEmpresa([a, b], cerrado);
    expect(e.presupuestado).toBe(2 * a.presupuestado!);
    expect(e.real).toBe(2 * a.real);
    expect(e.areas.find((x) => x.area.id === "personal")!.real).toBe(21000);
  });
  it("los mayores desvíos ordenan por soles de más", () => {
    const d = mayoresDesvios([armarSede(fonavi(), cerrado)]);
    expect(d.map((x) => x.categoria)).toEqual(["PLANILLA", "LIMPIEZA", "MARKETING"]);
    expect(d[1].sinPlan).toBe(true);
  });
});

describe("sugerencia", () => {
  it("fijos = promedio en soles; variables = gasto ÷ venta", () => {
    const s = sugerir([
      { mes: "2026-07", ventas: 40000, real: { PLANILLA: 10000, INSUMOS: 8000 } },
      { mes: "2026-08", ventas: 60000, real: { PLANILLA: 11000, INSUMOS: 12000 } },
    ]);
    expect(s.ventaEsperada).toBe(50000);
    expect(s.lineas).toContainEqual({ categoria: "PLANILLA", modo: "soles", valor: 10500 });
    expect(s.lineas).toContainEqual({ categoria: "INSUMOS", modo: "pct", valor: 20 });
  });
  it("sin historial no inventa", () => {
    expect(sugerir([])).toEqual({ ventaEsperada: null, lineas: [] });
  });
});
