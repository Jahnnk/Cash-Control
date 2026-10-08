import { describe, expect, test, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/centro/dashboard" }));
vi.mock("./sales-comparison-section", () => ({ SalesComparisonSection: () => null }));
vi.mock("./capital-card", () => ({ CapitalCard: () => null }));
vi.mock("@/components/banking/InternalTransferModal", () => ({ InternalTransferModal: () => null }));

import { SedeDashboard } from "./sede-dashboard";

describe("dashboard de sede", () => {
  test("cómo va la sede, qué necesita atención y el detalle plegado", () => {
    const html = renderToStaticMarkup(h(SedeDashboard, {
      sede: "Yayi's Centro", code: "centro", mes: "2026-10", mesActual: "2026-10",
      estado: {
        periodo: "Octubre 2026", enCurso: true, dia: 8, diasDelMes: 31, ventas: 9844, deltaPct: 6.4, meta: 42000, proyeccion: 43595,
        liquidez: 2853, equilibrio: { texto: "Se cubre el día 22", detalle: "Va en 33% al ritmo actual", tono: "neutro" },
        ganancia: { valor: null, detalle: "Se calcula con el Excel desde el día 10" }, flujo: null, etiquetaVentas: "vendido en Centro",
      },
      atencion: [{ id: "cuadre", nivel: "medio", titulo: "1 carga del Excel con diferencias", detalle: "Centro setiembre.", href: "/grupo/dashboard?pestana=kelly", accion: "Revisar" }],
      cifras: null, diagnostico: null,
    }));
    for (const t of ["Yayi&#x27;s Centro", "S/9,844", "vendido en Centro", "S/1,595 sobre la meta", "Se cubre el día 22", "1 carga del Excel con diferencias", "Ventas: semana y mes comparados", "Grupo → Reportes"]) expect(html).toContain(t);
    // El detalle va plegado: la comparación de ventas no se abre sola.
    expect(html).toContain("Abrir");
  });
});
