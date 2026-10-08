import { describe, expect, test } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EstadoMes, type EstadoMesProps } from "./estado-mes";

const base: EstadoMesProps = {
  periodo: "Octubre 2026", enCurso: true, dia: 8, diasDelMes: 31, ventas: 19168, deltaPct: -2.6, meta: 118000, proyeccion: 125791,
  liquidez: 18624, equilibrio: { texto: "Se cubre el día 24", detalle: "Va en 24% al ritmo actual", tono: "neutro" },
  ganancia: { valor: null, detalle: "Se calcula con el Excel desde el día 10" }, flujo: null,
};

describe("¿Cómo vamos este mes?", () => {
  test("una sola cifra de ventas, su meta, el ritmo y tres datos de apoyo", () => {
    const html = renderToStaticMarkup(h(EstadoMes, base));
    for (const t of ["S/19,168", "vendido en las 3 sedes", "16% de la meta de S/118,000", "Al ritmo actual cierra en S/125,791", "S/7,791 sobre la meta", "Liquidez", "Se cubre el día 24", "Ganancia"]) expect(html).toContain(t);
  });
  test("mes cerrado: resultado contra la meta, caja en vez de liquidez", () => {
    const html = renderToStaticMarkup(h(EstadoMes, { ...base, enCurso: false, ventas: 115000, proyeccion: null, flujo: -1737, ganancia: { valor: 11655, detalle: "12.5% de lo vendido" } }));
    expect(html).toContain("mes cerrado");
    expect(html).toContain("S/3,000 bajo la meta");
    expect(html).toContain("Caja");
    expect(html).not.toContain("Liquidez");
  });
});
