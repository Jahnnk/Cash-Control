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
    for (const t of ["S/19,168", "vendido en las 3 sedes", "16% de la meta de S/118,000", "Al ritmo actual cierra en S/125,791", "S/7,791 sobre la meta", "Dinero hoy", "Mínimo del día", "Se cubre el día 24", "Ganancia"]) expect(html).toContain(t);
  });
  test("mes cerrado: resultado contra la meta, caja en vez de liquidez", () => {
    const html = renderToStaticMarkup(h(EstadoMes, { ...base, enCurso: false, ventas: 115000, proyeccion: null, flujo: -1737, ganancia: { valor: 11655, detalle: "12.5% de lo vendido" } }));
    expect(html).toContain("mes cerrado");
    expect(html).toContain("S/3,000 bajo la meta");
    expect(html).toContain("Dinero del mes");
    expect(html).not.toContain("Dinero hoy");
  });
  test("el pastel de la regla 33-33-33: el Grupo primero, con selector de sede, las tres partes en real / meta y enlace a Reportes", () => {
    const bloque = (pct: number, metaPct: number) => ({ monto: 0, pct, metaPct, meta: 0, difMeta: 0 });
    const fila = (c: number, f: number, e: number, t: "fragil" | "en_camino" | "eficiente") => ({ costos: bloque(c, 33.3), fijos: bloque(f, 33.3), ebitda: bloque(e, 33.3), termometro: t }) as never;
    const sinDatos = { costos: null, fijos: null, ebitda: null, termometro: null, sinResultadoPorque: "Sin gastos cargados" } as never;
    const html = renderToStaticMarkup(h(EstadoMes, {
      ...base,
      regla: { href: "/grupo/reportes", opciones: [
        { etiqueta: "Grupo", fila: fila(32.3, 59.2, 8.5, "fragil") },
        { etiqueta: "Fonavi", fila: fila(45.9, 37.1, 17, "en_camino") },
        { etiqueta: "Atelier", fila: sinDatos },
      ] },
    }));
    for (const t of ["Regla 33-33-33 · real / meta", "Grupo: frágil", "Costos variables", "Costos fijos", "32.3%", "59.2%", "/ 33%", "Fonavi", "Atelier", "href=\"/grupo/reportes\"", "Cambiar la meta"]) expect(html).toContain(t);
    // Atelier no tiene resultado: su botón del selector queda deshabilitado.
    expect(html).toMatch(/disabled=""[^>]*>Atelier</);
  });
  test("sin EBITDA (mes recién empezado) no hay pastel", () => {
    expect(renderToStaticMarkup(h(EstadoMes, { ...base, regla: null }))).not.toContain("Regla 33-33-33");
  });
});
