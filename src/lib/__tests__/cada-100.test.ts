/**
 * «De cada S/ 100 que vendes» (29-oct-2026): la regla 33-33-33 y Profit First por sede y para el grupo, real en un mes
 * cerrado y ESTIMADO en un mes abierto. Datos inventados con la forma de los casos reales (el repo es público).
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cifrasDeSede, cifrasDelGrupo, type CifrasSede } from "../seis-cifras";
import { cada100DeSede, cada100DelGrupo, cada100DelMes, esperadoDe, metasDeLaRegla, type EsperadoSede } from "../cada-100";
import { CadaCien } from "../../app/grupo/dashboard/cada-100";

type Fila = { categoria: string; propio: number; monto: number };
const f = (categoria: string, monto: number): Fila => ({ categoria, propio: monto, monto });

/** Un mes de una sede con sus filas: costos, fijos y lo que sale de la ganancia. */
function sede(businessId: number, nombre: string, ventas: number, filas: Fila[], opts: { mes?: string; fin?: string; corte?: string; entro?: number } = {}): CifrasSede {
  const mes = opts.mes ?? "2026-09";
  return cifrasDeSede({
    businessId, sede: nombre, mes, finDeMes: opts.fin ?? "2026-09-30", corte: opts.corte ?? opts.fin ?? "2026-09-30",
    filas, ventas, caja: { entro: opts.entro ?? ventas, salio: filas.reduce((t, x) => t + x.monto, 0) }, cobrado: ventas, ingresadoVentas: ventas,
  });
}

// Fonavi setiembre (cifras reales redondeadas): variables 46%, fijos 36%, EBITDA ~18%; deuda 1,814 + inversión 10 + impuestos 125.
const fonaviSet = () => sede(2, "Fonavi", 37294, [
  f("INSUMOS", 5000), f("PRODUCTOS ATELIER", 12148), f("PLANILLA", 10314), f("ALQUILER", 1000), f("SERVICIOS", 2224),
  f("IMPUESTOS", 125), f("PRÉSTAMOS Y TARJETAS", 1814), f("REMODELACIÓN", 10),
]);
// Atelier setiembre: las deudas y los impuestos se comen más que los 8.
const atelierSet = () => sede(1, "Atelier", 36285, [
  f("INSUMOS", 18013), f("PLANILLA", 23129), f("IMPUESTOS", 613), f("PRÉSTAMOS Y TARJETAS", 4552), f("REMODELACIÓN", 22),
]);

describe("las metas salen de la regla (y de los ajustes de Jahnn)", () => {
  it("33 · 33 · 33, de ese tercio 25 de utilidad y 8 para impuestos, inversión y deudas", () => {
    expect(metasDeLaRegla()).toEqual({ operacion: 33.3, ebitda: 33.3, utilidad: 25, bolsa: 8.3 });
  });
  it("si Jahnn cambia la utilidad, cambian la meta y la bolsa", () => {
    expect(metasDeLaRegla({ utilidadPct: 20, ebitdaPct: 30, sociosDeUtilidad: false })).toEqual({ operacion: 35, ebitda: 30, utilidad: 20, bolsa: 10 });
  });
});

describe("mes cerrado: real", () => {
  const c = cada100DeSede(fonaviSet());
  const linea = (k: string) => c.lineas.find((l) => l.clave === k)!;
  it("variables 46, fijos 36, EBITDA 18: de cada S/ 100 vendidos", () => {
    expect(c.modo).toBe("real");
    expect(c.provisional).toBe(false);
    expect(linea("variables")).toMatchObject({ cien: 46, meta: 33.3, sentido: "tope", tono: "mal" });
    expect(linea("fijos").cien).toBe(36.3);
    expect(linea("ebitda")).toMatchObject({ cien: 17.7, meta: 33.3, sentido: "piso", tono: "ojo" });
    expect(c.termometro).toBe("en_camino");
  });
  it("las deudas, la inversión y los impuestos juntos son la bolsa de los 8", () => {
    expect(linea("bolsa")).toMatchObject({ cien: 5.2, meta: 8.3, tono: "bien", monto: 1949 });
  });
  it("no apartó utilidad: 0 de 25, en rojo", () => {
    expect(linea("utilidad")).toMatchObject({ cien: 0, meta: 25, tono: "mal" });
  });
  it("lo que quedó en caja es lo que entró menos lo que salió", () => {
    expect(c.caja).toBe(37294 - (5000 + 12148 + 10314 + 1000 + 2224 + 125 + 1814 + 10));
  });
  it("Atelier: las deudas y los impuestos se comen más que los 8 (tono rojo) y el EBITDA es negativo", () => {
    const a = cada100DeSede(atelierSet());
    expect(a.lineas.find((l) => l.clave === "bolsa")).toMatchObject({ cien: 14.3, tono: "mal" });
    expect(a.lineas.find((l) => l.clave === "ebitda")!.cien).toBeLessThan(0);
    expect(a.termometro).toBe("fragil");
  });
  it("la utilidad apartada descuenta lo que se rescató (la misma cuenta de Profit First)", () => {
    const base = sede(3, "Centro", 40000, [f("INSUMOS", 14000), f("PLANILLA", 18000), f("AHORRO", 7200), f("UTILIDADES A SOCIOS", 2400)]);
    const conRescate = { ...base, fuera: { ...base.fuera, rescate: 2400 } };
    expect(cada100DeSede(base).lineas.find((l) => l.clave === "utilidad")!.monto).toBe(9600);
    expect(cada100DeSede(conRescate).lineas.find((l) => l.clave === "utilidad")!.monto).toBe(7200);
  });
});

describe("mes abierto: el EBITDA es una estimación (no el 50% falso de mitad de mes)", () => {
  // Mitad de octubre: el Excel llega al 13, con la planilla y el alquiler todavía sin pagar.
  const medioMes = () => sede(2, "Fonavi", 16000, [f("INSUMOS", 2500), f("PRODUCTOS ATELIER", 3700), f("PLANILLA", 600), f("SERVICIOS", 300)], { mes: "2026-10", fin: "2026-10-31", corte: "2026-10-13" });
  const esperado: EsperadoSede = { businessId: 2, fijos: 14550, fuente: "presupuesto", ventasAlCierre: 35662, varPct: 46.3 };

  it("lo «real a la fecha» daría un EBITDA inflado", () => {
    const real = cada100DeSede(medioMes());
    expect(real.lineas.find((l) => l.clave === "ebitda")!.cien).toBeGreaterThan(55);
  });
  it("estimado: variables de siempre (46%), fijos del presupuesto sobre la venta al cierre (41%) → EBITDA ~13%", () => {
    const c = cada100DeSede(medioMes(), undefined, esperado, true);
    expect(c.modo).toBe("estimado");
    expect(c.ventas).toBe(35662);
    expect(c.lineas.find((l) => l.clave === "variables")).toMatchObject({ cien: 46.3, tono: "mal" });
    expect(c.lineas.find((l) => l.clave === "fijos")!.cien).toBe(40.8);
    expect(c.lineas.find((l) => l.clave === "ebitda")).toMatchObject({ cien: 12.9, tono: "ojo", nota: "estimado al cierre" });
    expect(c.fuenteFijos).toBe("presupuesto");
    expect(c.fijosEsperados).toBe(14550);
  });
  it("los variables no se toman «a la fecha» (bajos porque las compras se pagan después), pero se dice cuánto van", () => {
    const v = cada100DeSede(medioMes(), undefined, esperado, true).lineas.find((l) => l.clave === "variables")!;
    expect(v.nota).toBe("promedio de los meses cerrados · a la fecha va 39%");
  });
  it("sin historia de meses cerrados, los variables son lo que va a la fecha", () => {
    const c = cada100DeSede(medioMes(), undefined, { ...esperado, varPct: null }, true);
    expect(c.lineas.find((l) => l.clave === "variables")!.cien).toBe(38.8);
  });
  it("la utilidad no se juzga a mitad de mes (se aparta del 1 al 7 del mes siguiente): solo dice cuánto tocará", () => {
    const u = cada100DeSede(medioMes(), undefined, esperado, true).lineas.find((l) => l.clave === "utilidad")!;
    expect(u.tono).toBe("neutro");
    expect(u.nota).toBe("se aparta del 1 al 7 del mes que viene: tocarán S/ 8,916");
  });
  it("sin presupuesto, los fijos son el promedio de los meses cerrados", () => {
    const e = esperadoDe(2, { fijos: 13500, varRatio: 0.4631, referenceMonths: ["2026-09", "2026-08"], ventasProyectadas: 35000, ventasEsperadas: null }, null);
    expect(e).toEqual({ businessId: 2, fijos: 13500, fuente: "promedio", ventasAlCierre: 35000, varPct: 46.3 });
  });
  it("con presupuesto aprobado, manda el presupuesto", () => {
    const e = esperadoDe(2, { fijos: 13500, varRatio: 0.4631, referenceMonths: ["2026-09"], ventasProyectadas: null, ventasEsperadas: null }, { fijos: 14550, ventaEsperada: 37500 });
    expect(e).toMatchObject({ fijos: 14550, fuente: "presupuesto", ventasAlCierre: 37500 });
  });
  it("sin presupuesto ni meses cerrados no se estima: se dice por qué", () => {
    const e = esperadoDe(2, { fijos: 0, varRatio: null, referenceMonths: null, ventasProyectadas: 35000, ventasEsperadas: null }, null);
    const c = cada100DeSede(medioMes(), undefined, e, true);
    expect(c.modo).toBe("sin-datos");
    expect(c.porque).toContain("presupuesto aprobado o meses cerrados");
  });
  it("un mes ya cerrado nunca se estima", () => {
    expect(cada100DeSede(fonaviSet(), undefined, esperado, false).modo).toBe("real");
  });
  it("antes del día 10 no hay base: sin datos, con su razón", () => {
    const temprano = sede(2, "Fonavi", 5000, [f("INSUMOS", 1500), f("PLANILLA", 400)], { mes: "2026-10", fin: "2026-10-31", corte: "2026-10-05" });
    expect(cada100DeSede(temprano, undefined, esperado, true)).toMatchObject({ modo: "sin-datos", porque: "El mes recién empieza" });
  });
});

describe("el grupo", () => {
  it("real: suma las sedes y cuenta una sola vez lo que Atelier le vende a las cafeterías", () => {
    const fon = sede(2, "Fonavi", 40000, [f("PRODUCTOS ATELIER", 12000), f("INSUMOS", 6000), f("PLANILLA", 12000)]);
    const ate = sede(1, "Atelier", 30000, [f("INSUMOS", 10000), f("PLANILLA", 15000)]);
    const g = cada100DelGrupo([fon, ate], cifrasDelGrupo([fon, ate]));
    // Ventas 70,000 − 12,000 internas = 58,000; costos 28,000 − 12,000 = 16,000; fijos 27,000.
    expect(g.ventas).toBe(58000);
    expect(g.lineas.find((l) => l.clave === "variables")!.monto).toBe(16000);
    expect(g.lineas.find((l) => l.clave === "fijos")!.monto).toBe(27000);
    expect(g.lineas.find((l) => l.clave === "ebitda")!.monto).toBe(15000);
  });
  it("estimado: suma las sedes estimadas, sin contar dos veces la venta interna", () => {
    const abierto = (id: number, n: string, ventas: number, filas: Fila[]) => sede(id, n, ventas, filas, { mes: "2026-10", fin: "2026-10-31", corte: "2026-10-13" });
    const fon = abierto(2, "Fonavi", 16000, [f("PRODUCTOS ATELIER", 5000), f("INSUMOS", 2400), f("PLANILLA", 500)]);
    const ate = abierto(1, "Atelier", 14000, [f("INSUMOS", 6500), f("PLANILLA", 800)]);
    const esp: EsperadoSede[] = [
      { businessId: 2, fijos: 14000, fuente: "presupuesto", ventasAlCierre: 36000, varPct: 46 },
      { businessId: 1, fijos: 17000, fuente: "promedio", ventasAlCierre: 38000, varPct: 43 },
    ];
    const g = cada100DelGrupo([fon, ate], cifrasDelGrupo([fon, ate]), undefined, esp, true);
    // Fonavi: variables 46% de 36,000 = 16,560. Lo que compra a Atelier: 5,000 de 16,000 vendidos (31.25%) → 11,250 de 36,000. Atelier: 43% de 38,000 = 16,340.
    expect(g.modo).toBe("estimado");
    expect(g.ventas).toBeCloseTo(36000 + 38000 - 11250, 0);
    expect(g.lineas.find((l) => l.clave === "variables")!.monto).toBeCloseTo(16560 + 16340 - 11250, 0);
    expect(g.lineas.find((l) => l.clave === "fijos")!.monto).toBe(31000);
    expect(g.fuenteFijos).toBe("promedio");
  });
  it("estimado: si una sede no se puede estimar, el grupo tampoco, y dice cuál", () => {
    const fon = sede(2, "Fonavi", 16000, [f("INSUMOS", 2500), f("PLANILLA", 600)], { mes: "2026-10", fin: "2026-10-31", corte: "2026-10-13" });
    const g = cada100DelGrupo([fon], cifrasDelGrupo([fon]), undefined, [], true);
    expect(g.modo).toBe("sin-datos");
    expect(g.porque).toContain("Fonavi");
  });
  it("cada100DelMes arma el grupo y cada sede", () => {
    const r = cada100DelMes({ sedes: [fonaviSet(), atelierSet()], grupo: cifrasDelGrupo([fonaviSet(), atelierSet()]) });
    expect(Object.keys(r.sedes).sort()).toEqual(["1", "2"]);
    expect(r.grupo.sede).toBe("Grupo");
  });
});

describe("cómo se dibuja", () => {
  it("las cinco líneas con su meta, y el EBITDA con su palabra", () => {
    const html = renderToStaticMarkup(createElement(CadaCien, { c: cada100DeSede(fonaviSet()) }));
    for (const t of ["De cada S/ 100 que vendes", "Costos variables", "Costos fijos", "EBITDA", "En camino", "Utilidad apartada", "Impuestos, inversión y deudas", "tope 33", "meta 25", "tope 8", "Lo que quedó en caja del mes"]) expect(html).toContain(t);
    expect(html).not.toContain("Estimado al cierre");
  });
  it("el mes abierto lo dice: «Estimado al cierre», de dónde salen los fijos y las ventas al ritmo", () => {
    const c = cada100DeSede(
      sede(2, "Fonavi", 16000, [f("INSUMOS", 2500), f("PRODUCTOS ATELIER", 3700), f("PLANILLA", 600)], { mes: "2026-10", fin: "2026-10-31", corte: "2026-10-13" }),
      undefined, { businessId: 2, fijos: 14550, fuente: "presupuesto", ventasAlCierre: 35662, varPct: 46.3 }, true,
    );
    const html = renderToStaticMarkup(createElement(CadaCien, { c }));
    for (const t of ["Estimado al cierre", "presupuesto aprobado", "S/ 14,550", "S/ 35,662", "a la fecha va 39%"]) expect(html).toContain(t);
    expect(html).not.toContain("compras se pagan con retraso");
  });
  it("sin datos, una frase con la razón", () => {
    const html = renderToStaticMarkup(createElement(CadaCien, { c: { businessId: 2, sede: "Fonavi", modo: "sin-datos", porque: "El mes recién empieza", provisional: false, ventas: null, corte: null, lineas: [], termometro: null, caja: null, fuenteFijos: null, fijosEsperados: null } }));
    expect(html).toContain("todavía sin datos (el mes recién empieza)");
  });
  it("un EBITDA negativo se escribe con su signo y la barra no se sale", () => {
    const html = renderToStaticMarkup(createElement(CadaCien, { c: cada100DeSede(atelierSet()) }));
    expect(html).toContain("−");
    expect(html).toContain("Frágil");
  });
});
