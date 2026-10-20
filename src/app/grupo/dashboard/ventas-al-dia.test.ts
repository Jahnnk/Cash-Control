import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VistaVentasAlDia } from "./ventas-al-dia-vista";
import { ventasAlDia } from "@/lib/kpis/ventas-al-dia";

const d = (xs: [string, number][]) => xs.map(([fecha, total]) => ({ fecha, total }));
const datos = ventasAlDia({ mes: "2026-10", hoy: "2026-10-19", sedes: [
  { businessId: 3, sede: "Centro", diasEsperados: [0, 1, 2, 3, 4, 5, 6], diasPausados: [], admin: d([["2026-10-15", 1130.4], ["2026-10-16", 2067.8], ["2026-10-18", 700]]), byte: d([["2026-10-15", 1998.32], ["2026-10-16", 1283.22], ["2026-10-18", 700]]), byteHasta: "2026-10-18" },
  { businessId: 2, sede: "Fonavi", diasEsperados: [0, 1, 2, 3, 4, 5, 6], diasPausados: [], admin: d([["2026-10-17", 1210]]), byte: d([["2026-10-17", 667], ["2026-10-18", 435]]), byteHasta: "2026-10-18" },
] });

describe("Ventas al día (lo que anotan los administradores)", () => {
  const html = renderToStaticMarkup(createElement(VistaVentasAlDia, { datos }));
  it("muestra lo anotado, hasta cuándo, Byte en los mismos días y si cuadra", () => {
    for (const t of ["Ventas al día", "Lo que anotó", "Byte, mismos días", "hasta el 18/10", "Cuadra con Byte", "Las 3 sedes", "Día por día"]) expect(html).toContain(t);
  });
  it("plegado es una sola línea con el estado de cada sede, y el detalle se abre con «Ver contra Byte»", () => {
    expect(html).toContain("Ver contra Byte");
    expect(html).toContain("Centro</b> cuadra");
    expect(html).toContain("Fonavi</b> revisar");
    expect(html).not.toContain("<details id=\"ventas-al-dia\" open");
  });
  it("explica la caja sin abrir y avisa lo que no coincide o falta", () => {
    expect(html).toContain("Byte repartió distinto");
    expect(html).toContain("No coincide con Byte: sáb 17");
    expect(html).toContain("Falta anotar: dom 18");
  });
});
