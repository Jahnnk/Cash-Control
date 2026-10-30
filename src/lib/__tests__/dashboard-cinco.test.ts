/**
 * Dashboard de Grupo en cinco secciones (30-oct-2026): alcance de una sede o del grupo, familias de egresos, alertas y la
 * pantalla con el selector de sede. Datos inventados con la forma de los casos reales (el repo es público).
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cifrasDeSede, cifrasDelGrupo, type CifrasSede } from "../seis-cifras";
import { cada100DelMes } from "../cada-100";
import { alcanceDe, alertasDeNumeros, bonita, familiasDeEgreso, textoCortes } from "../dashboard-cinco";
import { CincoSecciones, type CincoProps } from "../../app/grupo/dashboard/cinco-secciones";
import { CONFIG_PROFIT_FIRST } from "../regla-33";

type Fila = { categoria: string; propio: number; monto: number };
const f = (categoria: string, monto: number): Fila => ({ categoria, propio: monto, monto });

function sede(businessId: number, nombre: string, ventas: number, filas: Fila[], corte = "2026-09-30"): CifrasSede {
  return cifrasDeSede({
    businessId, sede: nombre, mes: "2026-09", finDeMes: "2026-09-30", corte,
    filas, ventas, caja: { entro: ventas, salio: filas.reduce((t, x) => t + x.monto, 0) }, cobrado: ventas, ingresadoVentas: ventas,
  });
}

const fonavi = () => sede(2, "Fonavi", 37294, [
  f("INSUMOS", 5000), f("PRODUCTOS ATELIER", 12148), f("PLANILLA", 10314), f("ALQUILER", 1000), f("SERVICIOS", 2224),
  f("IMPUESTOS", 125), f("PRÉSTAMOS Y TARJETAS", 1814), f("REMODELACIÓN", 10),
]);
const atelier = () => sede(1, "Atelier", 36285, [f("INSUMOS", 18013), f("PLANILLA", 23129), f("IMPUESTOS", 613), f("PRÉSTAMOS Y TARJETAS", 4552), f("REMODELACIÓN", 22)]);
const centro = () => sede(3, "Centro", 40000, [f("INSUMOS", 6000), f("PRODUCTOS ATELIER", 9000), f("PLANILLA", 12000), f("ALQUILER", 3000)]);

const cifras = (sedes: CifrasSede[]) => ({ mes: "2026-09", sedes, grupo: cifrasDelGrupo(sedes), config: CONFIG_PROFIT_FIRST, configGuardable: true }) as never;

describe("alcance: una sede o el grupo", () => {
  it("una sede trae sus propias cifras", () => {
    const a = alcanceDe(cifras([fonavi(), atelier(), centro()]), 2);
    expect(a.nombre).toBe("Fonavi");
    expect(a.ventas).toBe(37294);
    expect(a.gastos).toBe(13538);
    expect(a.deudas).toBe(1814);
  });
  it("el grupo suma las sedes y no cuenta dos veces lo que Atelier le vende a Fonavi y Centro", () => {
    const a = alcanceDe(cifras([fonavi(), atelier(), centro()]), null);
    expect(a.nombre).toBe("Grupo Yayi's");
    expect(a.ventas).toBe(37294 + 36285 + 40000 - (12148 + 9000));
    // En el detalle de costos tampoco aparece la compra a Atelier de las cafeterías.
    expect(a.categorias.filter((x) => x.categoria === "PRODUCTOS ATELIER")).toEqual([]);
  });
  it("sin la sede pedida, no inventa números", () => {
    expect(alcanceDe(cifras([fonavi()]), 1).hayResultado).toBe(false);
  });
});

describe("sección 3 · las cuatro familias, todas «de lo vendido»", () => {
  const a = alcanceDe(cifras([fonavi()]), 2);
  const fam = familiasDeEgreso(a);
  it("fijos, variables, inversiones y financiamiento, en ese orden, con su % de ventas", () => {
    expect(fam.map((x) => x.clave)).toEqual(["fijos", "variables", "inversiones", "financiamiento"]);
    expect(fam.find((x) => x.clave === "fijos")).toMatchObject({ monto: 13538, pctVentas: 36.3 });
    expect(fam.find((x) => x.clave === "variables")).toMatchObject({ monto: 17148, pctVentas: 46 });
    expect(fam.find((x) => x.clave === "financiamiento")).toMatchObject({ monto: 1814 });
  });
  it("el detalle de cada familia cierra con su monto y lleva la categoría más pesada primero", () => {
    for (const x of fam) expect(Math.round(x.detalle.reduce((t, d) => t + d.monto, 0) * 100) / 100).toBe(x.monto);
    expect(fam.find((x) => x.clave === "fijos")!.detalle[0]).toEqual({ nombre: "Planilla", monto: 10314 });
  });
  it("con muchas categorías, las menores se juntan en «Otros»", () => {
    const grande = { ...a, categorias: ["A", "B", "C", "D", "E", "F", "G"].map((c, i) => ({ categoria: c, rubro: "gastos" as const, monto: 100 - i })), gastos: 100 + 99 + 98 + 97 + 96 + 95 + 94 };
    const fijos = familiasDeEgreso(grande)[0];
    expect(fijos.detalle).toHaveLength(5);
    expect(fijos.detalle.at(-1)!.nombre).toBe("Otros");
  });
  it("«Oficina y sistemas» se lee como persona", () => {
    expect(bonita("OFICINA Y SISTEMAS")).toBe("Oficina y sistemas");
  });
});

describe("hasta qué día llega el Excel", () => {
  it("un solo día, varios días o mes completo", () => {
    expect(textoCortes([{ sede: "A", corte: "2026-10-13", mesCompleto: false }, { sede: "B", corte: "2026-10-13", mesCompleto: false }])).toBe("hasta el 13/10");
    expect(textoCortes([{ sede: "Atelier", corte: "2026-10-13", mesCompleto: false }, { sede: "Centro", corte: "2026-10-14", mesCompleto: false }]))
      .toBe("hasta el 13/10 (Atelier) y el 14/10 (Centro)");
    expect(textoCortes([{ sede: "A", corte: "2026-09-30", mesCompleto: true }])).toBe("mes completo");
    expect(textoCortes([{ sede: "A", corte: null, mesCompleto: false }])).toBeNull();
  });
});

describe("sección 5 · alertas con el culpable concreto", () => {
  const todas = cifras([fonavi(), atelier(), centro()]);
  const alertas = (id: number | null) => {
    const a = alcanceDe(todas, id);
    const cada = cada100DelMes(todas);
    return alertasDeNumeros(a, id === null ? cada.grupo : cada.sedes[id], familiasDeEgreso(a), 30254);
  };
  it("Fonavi (setiembre): variables y fijos pasan el tope, y dice qué pesa más", () => {
    const x = alertas(2);
    const variables = x.find((y) => y.id === "variables")!;
    expect(variables.tono).toBe("mal");
    expect(variables.titulo).toBe("Costos variables: 46% de ventas");
    expect(variables.detalle).toContain("productos Atelier");
    expect(x.find((y) => y.id === "fijos")!.detalle).toContain("planilla");
  });
  it("Atelier (setiembre): el EBITDA negativo dice cuánto falta y las deudas se señalan", () => {
    const x = alertas(1);
    expect(x.find((y) => y.id === "ebitda")!.detalle).toContain("faltan");
    expect(x.find((y) => y.id === "bolsa")!.detalle).toContain("deudas");
  });
  it("con el mes abierto no nombra al culpable: la planilla aún no se pagó y engañaría", () => {
    const abierto = cifras([{ ...fonavi(), mes: "2026-10", mesCompleto: false } as CifrasSede]);
    const a = alcanceDe(abierto, 2);
    const esperado = [{ businessId: 2, fijos: 14550, fuente: "presupuesto" as const, ventasAlCierre: 36000, varPct: 46 }];
    const x = alertasDeNumeros(a, cada100DelMes(abierto, esperado, true).sedes[2], familiasDeEgreso(a), null);
    expect(x.find((y) => y.id === "variables")!.titulo).toContain("estimado");
    for (const y of x.filter((z) => z.id === "variables" || z.id === "fijos")) expect(y.detalle).not.toContain("Lo que más pesa:");
  });
  it("lo más grave va primero y la liquidez siempre se dice", () => {
    const x = alertas(2);
    expect(x[0].tono).toBe("mal");
    const liquidez = x.find((y) => y.id === "flujo")!;
    expect(liquidez.detalle).toContain("S/ 30,254");
  });
  it("una sede sana recibe una sola línea que lo dice", () => {
    const sana = sede(2, "Fonavi", 40000, [f("INSUMOS", 10000), f("PLANILLA", 10000), f("ALQUILER", 3000), f("AHORRO", 10000), f("IMPUESTOS", 400)]);
    const t = cifras([sana]);
    const a = alcanceDe(t, 2);
    const c = cada100DelMes(t).sedes[2];
    const x = alertasDeNumeros(a, c, familiasDeEgreso(a), null);
    expect(x.some((y) => y.id === "todo-bien" || y.tono === "bien")).toBe(true);
  });
  it("el flujo negativo es una alerta roja", () => {
    const a = { ...alcanceDe(todas, 2), caja: { entro: 1000, salio: 3000, flujo: -2000 } };
    const x = alertasDeNumeros(a, cada100DelMes(todas).sedes[2], familiasDeEgreso(a), null);
    expect(x.find((y) => y.id === "flujo")).toMatchObject({ tono: "mal", titulo: "Salió más plata de la que entró" });
  });
});

describe("la pantalla", () => {
  const todas = cifras([fonavi(), atelier(), centro()]);
  const ventas = { ventas: 113579, hasta: "2026-09-30", deltaPct: -0.8, meta: 118000, proyeccion: null, dia: 30, diasDelMes: 30, equilibrio: { texto: "Cubierto", detalle: "Las ventas pagaron los costos del mes", tono: "bien" as const } };
  const tarjetas = [
    { businessId: 1, nombre: "Atelier", ventas: 36285, pctGrupo: 32, ebitdaPct: -13.4, ebitdaTono: "mal" as const, ebitdaEstimado: false, aviso: null },
    { businessId: 2, nombre: "Fonavi", ventas: 37294, pctGrupo: 33, ebitdaPct: 17.7, ebitdaTono: "ojo" as const, ebitdaEstimado: false, aviso: "Falta 1 día de ventas · llegan al 28/10" },
    { businessId: 3, nombre: "Centro", ventas: 40000, pctGrupo: 35, ebitdaPct: 16, ebitdaTono: "ojo" as const, ebitdaEstimado: true, aviso: null },
  ];
  const props = (sedeElegida: number | null, extra: Partial<CincoProps> = {}): CincoProps => ({
    cifras: todas, cada: cada100DelMes(todas), sede: sedeElegida, onSede: () => {}, enCurso: false, periodo: "Septiembre 2026",
    ventas, tarjetas, saldo: 30254, cajaHref: "/grupo/reportes?mes=2026-09", ...extra,
  });
  const html = (p: CincoProps) => renderToStaticMarkup(createElement(CincoSecciones, p));

  it("las cinco secciones, en orden, cada una con su fuente", () => {
    const h = html(props(null));
    const orden = ["1. Ventas por sede", "2. Movimiento de dinero", "3. Egresos", "4. EBITDA", "5. Alertas gerenciales"].map((t) => h.indexOf(t));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(h).toContain("Fuente: Byte");
    expect(h).toContain("Fuente: Excel de Finanzas");
  });
  it("sección 1: venta total, meta y las tres sedes con su % del grupo y su EBITDA", () => {
    const h = html(props(null));
    for (const t of ["Ventas totales del mes", "S/ 113,579", "Consolidado de 3 sedes", "32% del grupo", "EBITDA −13%", "EBITDA 18%", "EBITDA 16% est.", "⚠ Falta 1 día de ventas"]) expect(h).toContain(t);
    expect(h).toContain("incluye lo que Atelier le vende a Fonavi y Centro");
  });
  it("sección 2: ingresos, egresos y flujo del Excel", () => {
    const h = html(props(2));
    for (const t of ["Ingresos", "Egresos", "Flujo neto del mes", "S/ 37,294", "mes completo"]) expect(h).toContain(t);
  });
  it("sección 3: las 4 familias con % de lo vendido y el detalle de la primera", () => {
    const h = html(props(2));
    for (const t of ["Costos fijos", "Costos variables", "Inversiones", "Financiamiento", "36.3% de lo vendido", "46% de lo vendido", "Detalle · Costos fijos", "Planilla"]) expect(h).toContain(t);
  });
  it("sección 4: el modelo 33-33-33 y lo real contra la meta", () => {
    const h = html(props(2, { tarjetas: tarjetas.map((t) => ({ ...t, ebitdaEstimado: false })) }));
    for (const t of ["Modelo financiero Yayi", "Objetivo", "25% ", "De cada S/ 100 que vendes", "Margen EBITDA"]) expect(h).toContain(t.trim());
    expect(h).toContain("EBITDA");
    expect(h).not.toContain("EBITDA estimado al cierre");
  });
  it("con una sede elegida, su tarjeta queda marcada y el título dice la sede", () => {
    const h = html(props(2));
    expect(h).toContain("Ventas de Fonavi en el mes");
    expect(h).toContain('aria-pressed="true"');
  });
  it("mes abierto: el EBITDA se dice estimado", () => {
    const abierto = cifras([{ ...fonavi(), mes: "2026-10", corte: "2026-10-13", mesCompleto: false } as CifrasSede]);
    const esperado = [{ businessId: 2, fijos: 14550, fuente: "presupuesto" as const, ventasAlCierre: 36000, varPct: 40 }];
    const h = html(props(2, { cifras: abierto, cada: cada100DelMes(abierto, esperado, true), enCurso: true }));
    expect(h).toContain("EBITDA estimado al cierre");
    expect(h).toContain("hasta el 13/10");
    expect(h).toContain("faltan pagos de fin de mes");
  });
  it("sin cifras avisa en vez de romperse", () => {
    expect(html(props(null, { cifras: null, cada: null }))).toContain("No se pudieron calcular las cifras de Septiembre 2026");
  });
});
