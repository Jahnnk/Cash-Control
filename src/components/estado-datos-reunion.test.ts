import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/actions/listo-reunion", () => ({ getListoParaReunion: vi.fn() }));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VistaDatosReunion } from "./estado-datos-reunion";
import type { ListoReunion } from "@/lib/kpis/listo-reunion";

const base: ListoReunion = {
  start: "2026-10-11", end: "2026-10-17", hoy: "2026-10-19", listo: false, faltas: 1, avisos: 0,
  resumen: "1 dato por completar · Fonavi.",
  sedes: [
    { businessId: 2, sede: "Fonavi", estado: "falta", hallazgos: [{ nivel: "falta", tema: "nps", titulo: "NPS: 1 de 7 días", detalle: "Falta dom 11." }] },
    { businessId: 3, sede: "Centro", estado: "listo", hallazgos: [] },
  ],
};

describe("«¿Llego con los datos completos?» (pantalla)", () => {
  it("dice el rango, el resumen y qué falta en cada sede", () => {
    const html = renderToStaticMarkup(createElement(VistaDatosReunion, { datos: base, start: "2026-10-11", end: "2026-10-17" }));
    for (const t of ["Datos de los administradores · 11–17 oct", "1 dato por completar · Fonavi.", "Faltan datos", "NPS: 1 de 7 días", "Completa"]) expect(html).toContain(t);
  });
  it("con todo completo lo celebra sin inventar pendientes", () => {
    const ok: ListoReunion = { ...base, listo: true, faltas: 0, resumen: "Llegas con los datos completos de las tres sedes.", sedes: base.sedes.map((s) => ({ ...s, estado: "listo", hallazgos: [] })) };
    const html = renderToStaticMarkup(createElement(VistaDatosReunion, { datos: ok, start: "2026-10-11", end: "2026-10-17" }));
    expect(html).toContain("Llegas con los datos completos");
    expect(html).not.toContain("Faltan datos");
  });
});
