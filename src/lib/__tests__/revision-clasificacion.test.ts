/** Casos reales de Fonavi, abril–setiembre 2026. */
import { describe, it, expect } from "vitest";
import {
  detectarRevisiones, tipoPEDelSistema, kellyDebeCorregir, lineaParaKelly,
  type FilaGastoRevision, type CategoriaSistema,
} from "../revision-clasificacion";
import { normGrupoPE, type CategoriaPE } from "../pe-kelly";

const K = (grupo: string, tipo: CategoriaPE["tipo"]): CategoriaPE => ({ grupo, grupoNorm: normGrupoPE(grupo), tipo, nota: null });
const KELLY = [
  K("CAJA CHICA", "Fijo"), K("SS GENERALES", "Excluido"), K("UNIFORMES", "Excluido"), K("FLETE", "Variable"),
  K("SERVICIOS GENERALES", "Fijo"), K("INSUMOS", "Variable"), K("OTROS", "Excluido"), K("PLANILLA", "Fijo"),
  K("MANTENIMIENTO", "Fijo"),
];
const SISTEMA: CategoriaSistema[] = [
  { name: "CAJA CHICA", costGroup: "variable", excludeFromEbitda: false },
  { name: "SS GENERALES", costGroup: "fijo", excludeFromEbitda: false },
  { name: "INSUMOS", costGroup: "variable", excludeFromEbitda: false },
  { name: "OTROS", costGroup: "variable", excludeFromEbitda: false },
  { name: "PLANILLA", costGroup: "fijo", excludeFromEbitda: false },
  { name: "MANTENIMIENTO", costGroup: "fijo", excludeFromEbitda: false },
];

let n = 0;
const g = (category: string, amount: number, concept = "x", grupo = category): FilaGastoRevision =>
  ({ huella: `h${n++}`, date: "2026-08-10", amount, concept, category, grupo });

describe("por categoría", () => {
  it("Kelly y el sistema clasifican distinto → difiere", () => {
    const r = detectarRevisiones({ gastos: [g("CAJA CHICA", 150)], categoriasSistema: SISTEMA, categoriasKelly: KELLY });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ alcance: "categoria", motivo: "difiere", clave: "CAJA CHICA|CAJA CHICA" });
    expect(r[0].datos).toMatchObject({ tipoKelly: "Fijo", tipoSistema: "Variable", grupoSistema: "variable" });
  });

  it("SS GENERALES junta grupos que Kelly separa → no calza (con los otros grupos a la vista)", () => {
    const r = detectarRevisiones({
      gastos: [g("SS GENERALES", 85, "UNIFORME COCINA", "UNIFORMES"), g("SS GENERALES", 13, "FLETE", "FLETE"), g("SS GENERALES", 60, "CAÑERÍA", "SERVICIOS GENERALES")],
      categoriasSistema: SISTEMA, categoriasKelly: KELLY,
    });
    const motivos = Object.fromEntries(r.map((x) => [x.datos.grupo as string, x.motivo]));
    expect(motivos).toEqual({ UNIFORMES: "no_calza", FLETE: "no_calza" }); // SERVICIOS GENERALES = Fijo, igual que el sistema
    expect((r[0].datos.otrosGruposEnCategoria as unknown[]).length).toBe(2);
  });

  it("grupo que Kelly no tiene → sin_kelly; categoría sin grupo en el sistema → sin_sistema", () => {
    const r = detectarRevisiones({ gastos: [g("INSUMOS", 20, "x", "DEUDA"), g("AHORRO", 500, "x", "INSUMOS")], categoriasSistema: SISTEMA, categoriasKelly: KELLY });
    expect(r.map((x) => x.motivo).sort()).toEqual(["sin_kelly", "sin_sistema"]);
  });

  it("sin lista de Kelly solo se pregunta lo que el sistema no tiene clasificado", () => {
    const r = detectarRevisiones({ gastos: [g("CAJA CHICA", 150), g("AHORRO", 500)], categoriasSistema: SISTEMA, categoriasKelly: null });
    expect(r.map((x) => [x.motivo, x.datos.categoria])).toEqual([["sin_sistema", "AHORRO"]]);
  });

  it("todo coincide → nada que preguntar", () => {
    expect(detectarRevisiones({ gastos: [g("INSUMOS", 20), g("PLANILLA", 900)], categoriasSistema: SISTEMA, categoriasKelly: KELLY })).toEqual([]);
  });
});

describe("por gasto suelto", () => {
  it("bolsón OTROS desde S/100", () => {
    const r = detectarRevisiones({
      gastos: [g("OTROS", 430.38, "CONVOCATORIA ADMINISTRADOR"), g("OTROS", 60, "DEVOLUCIÓN A CLIENTE")],
      categoriasSistema: SISTEMA, categoriasKelly: KELLY,
    }).filter((x) => x.alcance === "gasto");
    expect(r.map((x) => [x.motivo, x.datos.monto])).toEqual([["bolson", 430.38]]);
  });

  it("atípico: S/300+ y 5× la mediana de su categoría (préstamo para uniformes)", () => {
    const normales = Array.from({ length: 10 }, () => g("MANTENIMIENTO", 60));
    const r = detectarRevisiones({
      gastos: [...normales, g("MANTENIMIENTO", 480, "MANTENIMIENTO CAFETERA"), g("MANTENIMIENTO", 250, "no llega a 300")],
      categoriasSistema: SISTEMA, categoriasKelly: KELLY,
    }).filter((x) => x.alcance === "gasto");
    expect(r.map((x) => [x.motivo, x.datos.monto, x.datos.mediana])).toEqual([["atipico", 480, 60]]);
  });

  it("en planilla, alquiler o compras a Atelier un monto grande es normal", () => {
    const filas = [...Array.from({ length: 10 }, () => g("PLANILLA", 50)), g("PLANILLA", 2274.9)];
    expect(detectarRevisiones({ gastos: filas, categoriasSistema: SISTEMA, categoriasKelly: KELLY })).toEqual([]);
  });

  it("un gasto excluido (inversión) no se marca como atípico", () => {
    const sis = [...SISTEMA, { name: "EQUIPOS", costGroup: null, excludeFromEbitda: true }];
    const filas = [...Array.from({ length: 10 }, () => g("EQUIPOS", 150)), g("EQUIPOS", 6339.47, "CONGELADORA")];
    expect(detectarRevisiones({ gastos: filas, categoriasSistema: sis, categoriasKelly: [...KELLY, K("EQUIPOS", "Excluido")] })).toEqual([]);
  });
});

describe("decisiones y la lista para Kelly", () => {
  it("tipo del sistema: financiamiento y 'fuera' cuentan como excluido", () => {
    expect(tipoPEDelSistema({ name: "F", costGroup: "financiamiento", excludeFromEbitda: true })).toBe("Excluido");
    expect(tipoPEDelSistema({ name: "E", costGroup: null, excludeFromEbitda: true })).toBe("Excluido");
    expect(tipoPEDelSistema({ name: "X", costGroup: null, excludeFromEbitda: false })).toBeNull();
  });

  it("Kelly corrige solo si la decisión contradice su Excel", () => {
    expect(kellyDebeCorregir("Fijo", "Fijo", true)).toBe(false);
    expect(kellyDebeCorregir("Excluido", "Fijo", true)).toBe(true);
    expect(kellyDebeCorregir(null, "Fijo", true)).toBe(true);
    expect(kellyDebeCorregir(null, "Fijo", false)).toBe(false);
  });

  it("líneas para Kelly", () => {
    expect(lineaParaKelly({ alcance: "categoria", datos: { grupo: "LIMPIEZA", tipoKelly: "Fijo" }, decision: { tipoPE: "Variable", grupoSistema: "variable" } }))
      .toBe("• Grupo \"LIMPIEZA\": en «Categorías PE» cambiar el tipo de Fijo a Variable.");
    expect(lineaParaKelly({
      alcance: "gasto", datos: { grupo: "OTROS", fecha: "2026-08-31", monto: 430.38, concepto: "CONVOCATORIA" },
      decision: { accion: "reclasificar", tipoPE: "Fijo", categoriaDestino: "PERSONAL" },
    })).toBe("• \"CONVOCATORIA\" del 2026-08-31 (S/430.38): moverlo del grupo \"OTROS\" a uno de tipo Fijo (PERSONAL).");
  });
});
