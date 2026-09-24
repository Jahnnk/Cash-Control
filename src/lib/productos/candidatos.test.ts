import { describe, expect, it } from "vitest";
import { armarCandidatos, compararSedes, plazoDe, resultadoPlan, type MesCandidatos, type SedeCandidatos } from "./candidatos";
import { enlazarCosto, parecido, type CostoCarta } from "./costos-carta";
import { semanasDeCortes, type Corte } from "./semanas";
import type { Familia } from "./panorama";

const COSTOS: CostoCarta[] = [
  { ref: "CF-011", nombre: "Sánguche de Pollo con Piña al Grill", nombreCarta: "Sándwich de Pollo con Piña al Grill", categoria: null, costo: 5.6, precio: 16 },
  { ref: "CF-031", nombre: "Cortado", nombreCarta: "Café Cortado", categoria: null, costo: 2, precio: 11 },
  { ref: "CF-022", nombre: "Batido de Papaya", nombreCarta: "Batido de Papaya", categoria: null, costo: 2.12, precio: 12 },
  { ref: "MN-077", nombre: "Leche deslactosada", nombreCarta: "Leche deslactosada", categoria: null, costo: 0.13, precio: 1 },
  { ref: "AT-094", nombre: "Pavo", nombreCarta: null, categoria: null, costo: 69, precio: null },
  { ref: "CF-009", nombre: "Sánguche de Pavo", nombreCarta: "Sándwich de Pavo", categoria: null, costo: 8, precio: 18 },
  { ref: "AT-067", nombre: "Pan IMG Tipo Molde 1 KG", nombreCarta: null, categoria: null, costo: 14, precio: 23.5 },
  { ref: "CF-127", nombre: "Pan Hamburguesa Unidad", nombreCarta: null, categoria: null, costo: 0.9, precio: 2 },
];

describe("enlace de costos por nombre", () => {
  it("reconoce el mismo producto escrito distinto", () => {
    expect(enlazarCosto("POLLO CON PIÑA GRILL", COSTOS, new Map(), 16)?.item.ref).toBe("CF-011");
    expect(enlazarCosto("CAFE CORTADO", COSTOS, new Map(), 11)?.item.ref).toBe("CF-031");
    expect(enlazarCosto("PAN INTEGRAL MULTIGRANO TIPO MOLDE 1KG", COSTOS, new Map(), 23.5)?.item.ref).toBe("AT-067");
  });
  it("no se deja engañar por una palabra suelta ni por un precio muy distinto", () => {
    expect(enlazarCosto("PAN INTEGRAL MULTIGRANO 550 G", COSTOS, new Map(), 12.5)).toBeNull();
    expect(enlazarCosto("LATTE : LECHE DESLACTOSADA", COSTOS, new Map(), 14)).toBeNull();
  });
  it("desempata por lo que distingue al producto, no por las palabras de formato", () => {
    const panes: CostoCarta[] = [
      { ref: "AT-137", nombre: "Pan de Semillas 1 Kg", nombreCarta: null, categoria: null, costo: 16.6, precio: 24.5 },
      { ref: "AT-071", nombre: "Pan con Pan tipo Molde 1 kg", nombreCarta: null, categoria: null, costo: 9.45, precio: null },
      { ref: "AT-070", nombre: "Pan con Pan tipo molde 750", nombreCarta: null, categoria: null, costo: 6.98, precio: 15.5 },
      { ref: "AT-069", nombre: "Pan IMG Tipo Molde 750 g", nombreCarta: null, categoria: null, costo: 10.52, precio: null },
      { ref: "CF-026", nombre: "Jugo de Piña", nombreCarta: "Jugo de Piña", categoria: null, costo: 2.68, precio: 10 },
      { ref: "CF-119", nombre: "Jugo de Naranja", nombreCarta: "Jugo de Piña", categoria: null, costo: 3.97, precio: 10 },
    ];
    expect(enlazarCosto("PAN DE SEMILLAS TIPO MOLDE 1KG", panes, new Map(), 24.5)?.item.ref).toBe("AT-137");
    expect(enlazarCosto("PAN CON PAN TIPO MOLDE 750G", panes, new Map(), 15.5)?.item.ref).toBe("AT-070");
    // Dos dicen "Jugo de Piña" en carta: gana el que SE LLAMA así.
    expect(enlazarCosto("JUGO DE PIÑA", panes, new Map(), 10)?.item.ref).toBe("CF-026");
    expect(enlazarCosto("JUGO DE NARANJA", panes, new Map(), 10)?.item.ref).toBe("CF-119");
  });

  it("en empate gana el que se vende en carta, y el vínculo manual manda", () => {
    expect(enlazarCosto("SANGUCHE DE PAVO", COSTOS, new Map(), 18)?.item.ref).toBe("CF-009");
    expect(enlazarCosto("PAN DE SEMILLAS 550 G", COSTOS, new Map([["550 pan semilla", "AT-067"]]))).toMatchObject({ como: "manual", item: { ref: "AT-067" } });
    expect(parecido("Café Americano", "CAFÉ AMERICANO")).toBe(1);
  });
});

const MESES = ["2026-06", "2026-07", "2026-08"];

/** Un producto con unidades por mes; precio fijo. */
function carta(filas: [string, Familia, number[], number][]): (i: number) => MesCandidatos["carta"] {
  return (i) => filas.map(([nombre, familia, u, precio]) => ({ nombre, familia, unidades: u[i], ingresos: u[i] * precio })).filter((x) => x.unidades > 0);
}

function sede(id: number, nombre: string, filas: [string, Familia, number[], number][]): SedeCandidatos {
  const c = carta(filas);
  return { businessId: id, sede: nombre, semanas: [], meses: MESES.map((month, i) => ({ month, dias: 30, sospechoso: false, carta: c(i) })) };
}

const S: Familia = "Sánguches, platos y desayunos";
const B: Familia = "Bebidas frías";
const C: Familia = "Bebidas calientes";

// Una carta de 10 productos que se venden bien + los casos a probar.
const RELLENO: [string, Familia, number[], number][] = Array.from({ length: 10 }, (_, i) => [`PLATO ${String.fromCharCode(65 + i)}`, S, [300, 300, 300], 15]);

describe("candidatos a reemplazo", () => {
  const fonavi = sede(2, "Fonavi", [
    ...RELLENO,
    ["POLLO CON PIÑA GRILL", S, [400, 410, 420], 16],
    ["BATIDO DE PAPAYA", B, [3, 2, 2], 12],
    ["CAFE CORTADO", C, [20, 10, 1], 11],
    ["HUEVO REVUELTO CLÁSICO", S, [2, 1, 1], 3],
    ["JUGO VIEJO", B, [10, 0, 0], 10],
  ]);
  const centro = sede(3, "Centro", [
    ...RELLENO,
    ["POLLO CON PIÑA GRILL", S, [500, 500, 520], 16],
    ["BATIDO DE PAPAYA", B, [2, 3, 1], 12],
    ["CAFE CORTADO", C, [300, 310, 300], 11],
    ["HUEVO REVUELTO CLÁSICO", S, [1, 2, 1], 3],
    ["JUGO VIEJO", B, [8, 0, 0], 10],
  ]);
  const r = armarCandidatos([fonavi, centro], COSTOS, new Map(), []);
  const de = (n: string) => r.candidatos.find((c) => c.nombre === n);

  it("flojo en las dos sedes → sacar de carta", () => {
    expect(de("BATIDO DE PAPAYA")).toMatchObject({ veredicto: "sacar", cuando: "En el próximo cambio de carta" });
    expect(de("BATIDO DE PAPAYA")!.razon).toMatch(/menos venden en las dos sedes/);
  });

  it("flojo en una y bien en la otra → revisar en esa sede", () => {
    expect(de("CAFE CORTADO")).toMatchObject({ veredicto: "revisar", sedeRevisar: "Fonavi" });
    expect(de("CAFE CORTADO")!.sedes.find((s) => s.sede === "Fonavi")!.senales).toContain("cayendo");
  });

  it("dos meses sin ventas → ¿ya salió?", () => {
    expect(de("JUGO VIEJO")?.veredicto).toBe("confirmar");
  });

  it("no juzga acompañamientos ni a los que venden bien", () => {
    expect(de("HUEVO REVUELTO CLÁSICO")).toBeUndefined();
    expect(de("POLLO CON PIÑA GRILL")).toBeUndefined();
  });

  it("calcula la rentabilidad con el costo del Excel", () => {
    const p = de("BATIDO DE PAPAYA")!.sedes[0];
    expect(p.costo).toBe(2.12);
    expect(p.margenUnidad).toBeCloseTo(9.88, 2);
    expect(r.coberturaCosto).toBeLessThan(100); // el relleno no tiene costo
  });
});

describe("archivados", () => {
  const mk = (id: number, n: string, jugo: number[]) => sede(id, n, [...RELLENO, ["JUGO VIEJO", B, jugo, 10]]);
  const archivo = { clave: "jugo viejo", nombre: "JUGO VIEJO", motivo: "ya-no-se-vende" as const, archivadoEl: "2026-06-20", archivadoPor: "jahnn" };

  it("un archivado deja de aparecer", () => {
    const r = armarCandidatos([mk(2, "Fonavi", [10, 0, 0]), mk(3, "Centro", [8, 0, 0])], COSTOS, new Map(), [], [archivo]);
    expect(r.candidatos.find((c) => c.nombre === "JUGO VIEJO")).toBeUndefined();
    expect(r.archivados).toEqual([{ ...archivo, volvio: false, comparacion: null }]);
  });

  it("si vuelve a venderse en un mes posterior, reaparece marcado", () => {
    const r = armarCandidatos([mk(2, "Fonavi", [10, 0, 2]), mk(3, "Centro", [8, 0, 0])], COSTOS, new Map(), [], [archivo]);
    expect(r.archivados[0].volvio).toBe(true);
    const c = r.candidatos.find((x) => x.nombre === "JUGO VIEJO");
    expect(c?.volvioAVenderse?.archivadoEl).toBe("2026-06-20");
  });

  it("las ventas del mismo mes en que se archivó no cuentan como volver", () => {
    const r = armarCandidatos([mk(2, "Fonavi", [10, 0, 0]), mk(3, "Centro", [8, 0, 0])], COSTOS, new Map(), [], [{ ...archivo, archivadoEl: "2026-06-05" }]);
    expect(r.archivados[0].volvio).toBe(false);
  });
});

describe("decisiones de «Sacar de carta»", () => {
  const POLLO: [string, Familia, number[], number] = ["POLLO CON PIÑA GRILL", S, [400, 410, 420], 16];
  const CORTADO: [string, Familia, number[], number] = ["CAFE CORTADO", C, [300, 310, 300], 11];
  const f = () => sede(2, "Fonavi", [...RELLENO, POLLO, CORTADO, ["BATIDO DE PAPAYA", B, [3, 2, 2], 12], ["JUGO NUEVO", B, [0, 50, 60], 10]]);
  const c = () => sede(3, "Centro", [...RELLENO, POLLO, CORTADO, ["BATIDO DE PAPAYA", B, [2, 3, 1], 12], ["JUGO NUEVO", B, [0, 40, 50], 10]]);
  const base = { clave: "batido papaya", nombre: "BATIDO DE PAPAYA", motivo: null, fechaSalida: null, reemplazo: null, hasta: null, decididoPor: "jahnn" };

  it("dice cuánto se deja de vender y ganar al mes", () => {
    const r = armarCandidatos([f(), c()], COSTOS, new Map(), [], [], [], "2026-09-24");
    const b = r.candidatos.find((x) => x.nombre === "BATIDO DE PAPAYA")!;
    // (7 + 6 unidades en 90 días) × 30 × S/12 = S/52; ganancia con costo S/2.12.
    expect(b.impactoMes.venta).toBe(52);
    expect(b.impactoMes.ganancia).toBe(Math.round((13 / 90) * 30 * 9.88));
  });

  it("una salida programada avisa cuando se cumple la fecha", () => {
    const d = [{ ...base, tipo: "programar" as const, fechaSalida: "2026-10-01", reemplazo: "JUGO NUEVO" }];
    const antes = armarCandidatos([f(), c()], COSTOS, new Map(), [], [], d, "2026-09-24").candidatos.find((x) => x.nombre === "BATIDO DE PAPAYA")!;
    expect(antes.plan).toEqual({ fechaSalida: "2026-10-01", reemplazo: "JUGO NUEVO", vencida: false });
    const despues = armarCandidatos([f(), c()], COSTOS, new Map(), [], [], d, "2026-10-01").candidatos.find((x) => x.nombre === "BATIDO DE PAPAYA")!;
    expect(despues.plan?.vencida).toBe(true);
  });

  it("«lo mantengo» lo saca de la lista hasta su fecha y luego vuelve", () => {
    const d = [{ ...base, tipo: "mantener" as const, motivo: "trae clientes", hasta: "2026-12-24" }];
    const r = armarCandidatos([f(), c()], COSTOS, new Map(), [], [], d, "2026-09-24");
    expect(r.candidatos.find((x) => x.nombre === "BATIDO DE PAPAYA")).toBeUndefined();
    expect(r.mantenidos).toHaveLength(1);
    const luego = armarCandidatos([f(), c()], COSTOS, new Map(), [], [], d, "2026-12-25");
    expect(luego.candidatos.find((x) => x.nombre === "BATIDO DE PAPAYA")?.veredicto).toBe("sacar");
    expect(luego.mantenidos).toHaveLength(0);
  });

  it("compara el reemplazo con lo que vendía el archivado", () => {
    const a = [{ clave: "batido papaya", nombre: "BATIDO DE PAPAYA", motivo: "sacado-de-carta" as const, archivadoEl: "2026-09-24", archivadoPor: "jahnn", reemplazo: "Jugo Nuevo", ventaDiaAlArchivar: 1.73 }];
    const r = armarCandidatos([f(), c()], COSTOS, new Map(), [], a, [], "2026-09-24");
    expect(r.archivados[0].comparacion?.reemplazo).toBe("Jugo Nuevo");
    expect(r.archivados[0].comparacion?.ventaDiaAntes).toBe(1.73);
    expect(r.archivados[0].comparacion?.ventaDiaReemplazo).toBeGreaterThan(10);
  });
});

describe("«Preparar reemplazo»", () => {
  it("el plazo son 4 semanas desde que entró a la lista", () => {
    expect(plazoDe("2026-09-24", "2026-10-10")).toEqual({ desde: "2026-09-24", vence: "2026-10-22", diasRestantes: 12, vencido: false });
    expect(plazoDe("2026-09-24", "2026-10-22").vencido).toBe(true);
  });

  it("dice si el problema es de una sede o del producto", () => {
    const a = compararSedes([{ sede: "Fonavi", ventaDia: 1, precio: 13 }, { sede: "Centro", ventaDia: 3.3, precio: 13 }])!;
    expect(a).toMatchObject({ fuerte: "Centro", floja: "Fonavi", veces: 3.3 });
    expect(a.conclusion).toMatch(/problema parece ser de Fonavi/);
    const b = compararSedes([{ sede: "Fonavi", ventaDia: 1.2, precio: 15 }, { sede: "Centro", ventaDia: 1, precio: 12 }])!;
    expect(b.conclusion).toMatch(/el problema es el producto/);
    expect(b.conclusion).toMatch(/En Centro se cobra 20% menos/);
    expect(compararSedes([{ sede: "Fonavi", ventaDia: 1, precio: 10 }])).toBeNull();
    // Marcada floja pero vende más que la otra: el problema es la caída.
    const c = compararSedes([
      { sede: "Centro", ventaDia: 3.49, precio: 6, estado: "candidato", variacion: -44 },
      { sede: "Fonavi", ventaDia: 2.58, precio: 6, estado: "bien", variacion: 73 },
    ])!;
    expect(c.floja).toBe("Centro");
    expect(c.conclusion).toMatch(/viene cayendo \(-44%\)/);
  });

  it("si Jahnn le programa la salida, pasa a «Sacar de carta»", () => {
    const POLLO: [string, Familia, number[], number] = ["POLLO CON PIÑA GRILL", S, [400, 410, 420], 16];
    const f = sede(2, "Fonavi", [...RELLENO, POLLO, ["CAFE CORTADO", C, [20, 10, 1], 11]]);
    const c = sede(3, "Centro", [...RELLENO, POLLO, ["CAFE CORTADO", C, [300, 310, 300], 11]]);
    const sin = armarCandidatos([f, c], COSTOS, new Map(), [], [], [], "2026-09-24").candidatos.find((x) => x.nombre === "CAFE CORTADO");
    expect(sin?.veredicto).toBe("revisar");
    const d = [{ clave: "cafe cortado", nombre: "CAFE CORTADO", tipo: "programar" as const, motivo: null, fechaSalida: "2026-10-01", reemplazo: null, hasta: null, decididoPor: "jahnn" }];
    const con = armarCandidatos([f, c], COSTOS, new Map(), [], [], d, "2026-09-24").candidatos.find((x) => x.nombre === "CAFE CORTADO")!;
    expect(con.veredicto).toBe("sacar");
    expect(con.plan?.fechaSalida).toBe("2026-10-01");
  });
});

describe("plan de acción en una sede", () => {
  const plan = { id: 1, clave: "latte macchiato", nombre: "LATTE MACCHIATO", businessId: 2, sede: "Fonavi", accion: "vitrina" as const, detalle: null, inicio: "2026-09-24", ventaDiaAntes: 1.32, creadoPor: "jahnn" };

  it("sin semanas desde el inicio, todavía mide", () => {
    const r = resultadoPlan(plan, [{ desde: "2026-09-13", hasta: "2026-09-19", ingresos: 50 }], "2026-09-30");
    expect(r).toMatchObject({ ventaDiaDespues: null, cambioPct: null, listo: false, resultadoEl: "2026-10-22", diasTranscurridos: 6 });
  });

  it("compara la venta por día desde el inicio con la de antes", () => {
    const semanas = [
      { desde: "2026-09-20", hasta: "2026-09-26", ingresos: 30 }, // empezó antes del plan: no cuenta
      { desde: "2026-09-27", hasta: "2026-10-03", ingresos: 14 },
      { desde: "2026-10-04", hasta: "2026-10-10", ingresos: 21 },
    ];
    const r = resultadoPlan(plan, semanas, "2026-10-22");
    expect(r.diasMedidos).toBe(14);
    expect(r.ventaDiaDespues).toBe(2.5);
    expect(r.cambioPct).toBe(89);
    expect(r.listo).toBe(true);
  });
});

describe("semanas desde las cargas del sábado", () => {
  const c = (periodEnd: string, cargadoEl: string, unidades: number, periodStart = "2026-09-01", origen = "sede"): Corte =>
    ({ origen, month: "2026-09", periodStart, periodEnd, cargadoEl, nombre: "LATTE", unidades, ingresos: unidades * 12 });

  it("la semana es la diferencia entre dos cargas acumuladas seguidas", () => {
    const s = semanasDeCortes([c("2026-09-07", "2026-09-08", 20), c("2026-09-12", "2026-09-13", 40), c("2026-09-19", "2026-09-20", 70), c("2026-09-26", "2026-09-27", 95)]);
    expect(s.map((x) => [x.desde, x.hasta, x.productos[0]?.unidades])).toEqual([
      ["2026-09-01", "2026-09-07", 20], ["2026-09-08", "2026-09-12", 20], ["2026-09-13", "2026-09-19", 30], ["2026-09-20", "2026-09-26", 25],
    ]);
  });

  it("un período de más de 10 días no se muestra como semana", () => {
    expect(semanasDeCortes([c("2026-09-19", "2026-09-20", 70)])).toEqual([]);
  });

  it("de una misma fecha vale la última carga, y la de dirección no pisa a la sede", () => {
    const s = semanasDeCortes([
      c("2026-09-07", "2026-09-08T10:00", 60), c("2026-09-07", "2026-09-08T18:00", 70),
      c("2026-09-30", "2026-10-01", 999, "2026-09-01", "direccion"),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].productos[0].unidades).toBe(70);
  });

  it("un archivo que no empieza el 01 cuenta por sí mismo", () => {
    const s = semanasDeCortes([c("2026-09-07", "2026-09-08", 40), c("2026-09-19", "2026-09-20", 22, "2026-09-13")]);
    expect(s.map((x) => [x.desde, x.productos[0].unidades])).toEqual([["2026-09-01", 40], ["2026-09-13", 22]]);
  });
});
