/**
 * La vista del semáforo (24-oct-2026): una línea para el CEO con solo los rojos, y el checklist para Kelly.
 * Los controles son los mismos; aquí solo se prueba cómo se muestran y a quién.
 */
import { describe, it, expect, vi } from "vitest";

// El componente pide los datos a una server action (con base de datos): aquí se le pasan directo.
vi.mock("@/app/actions/controles-fiabilidad", () => ({ getControlesDelMes: vi.fn() }));
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { c5Caja, estadoDe, type Control, type ControlesMes, type DatosControles } from "../controles-fiabilidad";
import { checklistKelly, quePasa, quienResuelve, resumenCeo, solesSinDecimales } from "../controles-vista";
import { VistaSemaforoMes } from "../../app/grupo/dashboard/semaforo-mes";
import type { ControlesDelMes } from "../../app/actions/controles-fiabilidad";

const ctl = (id: Control["id"], estado: Control["estado"], diferencia: number | null = null, detalle = `detalle de ${id}`): Control =>
  ({ id, nombre: id, estado, diferencia, detalle, queHacer: `qué hacer en ${id}` });
const verdes = (): Control[] => (["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"] as const).map((id) => ctl(id, "verde"));
const sede = (businessId: number, nombre: string, cambios: Control[]): ControlesMes => {
  const controles = verdes().map((c) => cambios.find((x) => x.id === c.id) ?? c);
  return { businessId, sede: nombre, mes: "2026-09", estado: estadoDe(controles), controles };
};
const datos = (sedes: ControlesMes[], vista: "ceo" | "kelly" = "ceo", c7Grupo: Control = ctl("C7", "verde")): ControlesDelMes => {
  const peor = sedes.some((s) => s.estado === "no_confiable") ? "no_confiable" : sedes.some((s) => s.estado === "con_observaciones") ? "con_observaciones" : "confiable";
  return { mes: "2026-09", sedes, grupo: { businessId: 0, sede: "Grupo", mes: "2026-09", estado: c7Grupo.estado === "rojo" ? "no_confiable" : peor, controles: [c7Grupo] }, vista };
};

/** Setiembre 2026 tal como lo dejan los controles (Fonavi y Centro; Atelier con observaciones). */
const setiembre = (vista: "ceo" | "kelly" = "ceo") => datos([
  sede(2, "Fonavi", [ctl("C2", "amarillo", 3.2), ctl("C3", "amarillo", 138.04), ctl("C4", "rojo", 32.12)]),
  sede(3, "Centro", [ctl("C1", "rojo", 9601.97), ctl("C2", "amarillo", 1.7), ctl("C4", "rojo", 3810.52), ctl("C5", "rojo", 103, "Caja negativa al 31/08: −S/103.00."), ctl("C6", "rojo", 63.19)]),
  sede(1, "Atelier", [ctl("C4", "amarillo")]),
], vista);

describe("«Qué pasa» en máximo 4 palabras y quién lo resuelve", () => {
  it("etiquetas fijas de C1 a C8", () => {
    expect((["C1", "C2", "C3", "C4", "C6", "C7", "C8"] as const).map((id) => quePasa(ctl(id, "rojo")))).toEqual([
      "Excel incompleto", "Ventas Byte ≠ Excel", "Gastos sin categoría", "Banco no cuadra", "Fila mal anotada", "Error de cálculo de la app", "Falta Excel del mes",
    ]);
  });
  it("C5 según lo que encontró el control real (lib/controles-fiabilidad.ts → c5Caja)", () => {
    const base = { saldoInicial: { fecha: "2026-08-31", banco: 0, caja: 50 }, saldosDelMes: [] } as unknown as DatosControles;
    expect(quePasa(c5Caja({ ...base, efectivo: { ventas: 1000, depositos: 900 } }))).toBe("Efectivo no cuadra");
    expect(quePasa(c5Caja({ ...base, efectivo: null }))).toBe("Falta pestaña efectivo");
    expect(quePasa(c5Caja({ ...base, efectivo: { ventas: 1, depositos: 1 }, saldoInicial: { fecha: "2026-08-31", banco: 0, caja: -103 } }))).toBe("Caja en negativo");
  });
  it("todo lo resuelve Kelly, salvo C7 (error de la app): Sistema", () => {
    expect(quienResuelve(ctl("C2", "rojo"))).toBe("Kelly");
    expect(quienResuelve(ctl("C7", "rojo"))).toBe("Sistema");
  });
  it("cada etiqueta tiene 4 palabras o menos (C7 lleva el texto literal que pidió Jahnn)", () => {
    for (const id of ["C1", "C2", "C3", "C4", "C5", "C6", "C8"] as const) {
      expect(quePasa(ctl(id, "rojo")).split(/\s+/).length).toBeLessThanOrEqual(4);
    }
    expect(quePasa(ctl("C7", "rojo"))).toBe("Error de cálculo de la app");
  });
});

describe("vista del CEO", () => {
  it("todo verde: solo «✓ Números de setiembre confiables»", () => {
    const r = resumenCeo(datos([sede(2, "Fonavi", []), sede(3, "Centro", [])]));
    expect(r).toMatchObject({ estado: "confiable", texto: "✓ Números de setiembre confiables", observaciones: null, puntos: [], filas: [] });
  });
  it("con rojos: una línea con los pendientes de Kelly, las observaciones aparte y un punto por sede (sin «Grupo»)", () => {
    const r = resumenCeo(setiembre());
    expect(r.texto).toBe("Setiembre · números no confiables · 5 pendientes de Kelly");
    expect(r.observaciones).toBe("· 4 observaciones");
    expect(r.puntos).toEqual([{ sede: "Fonavi", color: "rojo" }, { sede: "Centro", color: "rojo" }, { sede: "Atelier", color: "amarillo" }]);
  });
  it("la tabla trae SOLO los rojos, una fila por problema", () => {
    const r = resumenCeo(setiembre());
    expect(r.filas.map((f) => [f.sede, f.quePasa, f.monto, f.quien])).toEqual([
      ["Fonavi", "Banco no cuadra", 32.12, "Kelly"],
      ["Centro", "Excel incompleto", 9601.97, "Kelly"],
      ["Centro", "Banco no cuadra", 3810.52, "Kelly"],
      ["Centro", "Caja en negativo", 103, "Kelly"],
      ["Centro", "Fila mal anotada", 63.19, "Kelly"],
    ]);
  });
  it("un error de la app sale como «Sistema» y no cuenta como pendiente de Kelly", () => {
    const r = resumenCeo(datos([sede(2, "Fonavi", [])], "ceo", ctl("C7", "rojo", null, "La app calcula mal")));
    expect(r.texto).toBe("Setiembre · números no confiables · 1 error de la app");
    expect(r.filas).toEqual([expect.objectContaining({ sede: "Grupo", quePasa: "Error de cálculo de la app", quien: "Sistema" })]);
  });
  it("solo amarillos: «con observaciones», sin tabla", () => {
    const r = resumenCeo(datos([sede(2, "Fonavi", [ctl("C2", "amarillo", 3.2)])]));
    expect(r.texto).toBe("Setiembre · números con observaciones");
    expect(r.observaciones).toBe("· 1 observación");
    expect(r.filas).toEqual([]);
  });
  it("montos sin decimales en la vista del CEO", () => {
    expect(solesSinDecimales(3810.52)).toBe("3,811");
  });
  it("en pantalla: cerrada es una línea; abierta, 4 columnas, sin «qué hacer»", () => {
    const html = renderToStaticMarkup(h(VistaSemaforoMes, { data: setiembre() }));
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Setiembre · números no confiables · 5 pendientes de Kelly");
    for (const t of ["Sede", "Qué pasa", "S/", "Quién lo resuelve", "Banco no cuadra", "3,811", "detalle"]) expect(html).toContain(t);
    expect(html.match(/<th /g)).toHaveLength(4);
    expect(html.match(/<tr class="align-baseline"/g)).toHaveLength(5);
    expect(html).not.toContain("qué hacer");
    expect(html).not.toContain("Grupo");
    // El detalle completo (con decimales) no se dibuja hasta pedirlo.
    expect(html).not.toContain("Caja negativa al 31/08");
  });
  it("en pantalla, todo verde: solo la línea en verde", () => {
    const html = renderToStaticMarkup(h(VistaSemaforoMes, { data: datos([sede(2, "Fonavi", [])]) }));
    expect(html).toContain("✓ Números de setiembre confiables");
    expect(html).not.toContain("<details");
  });
});

describe("checklist de Kelly", () => {
  it("por sede, rojos primero y luego amarillos, con su qué hacer; los verdes no son tarea", () => {
    const c = checklistKelly(setiembre("kelly"));
    expect(c.pendientes).toBe(9);
    expect(c.sedes.find((s) => s.sede === "Centro")!.tareas.map((t) => [t.id, t.estado])).toEqual([
      ["C1", "rojo"], ["C4", "rojo"], ["C5", "rojo"], ["C6", "rojo"], ["C2", "amarillo"],
    ]);
    expect(c.sedes.find((s) => s.sede === "Fonavi")!.tareas[0]).toMatchObject({ id: "C4", queHacer: "qué hacer en C4" });
  });
  it("un error de la app no es tarea suya: va aparte", () => {
    const c = checklistKelly(datos([sede(2, "Fonavi", [ctl("C7", "rojo")])], "kelly"));
    expect(c.pendientes).toBe(0);
    expect(c.sistema).toHaveLength(1);
  });
  it("Kelly ve el checklist (con el qué hacer); el CEO, la línea", () => {
    const k = renderToStaticMarkup(h(VistaSemaforoMes, { data: setiembre("kelly") }));
    expect(k).toContain("Checklist de setiembre");
    expect(k).toContain("qué hacer en C4");
    expect(k).toContain("S/3,810.52");
    const ceo = renderToStaticMarkup(h(VistaSemaforoMes, { data: setiembre("ceo") }));
    expect(ceo).not.toContain("Checklist");
  });
});
