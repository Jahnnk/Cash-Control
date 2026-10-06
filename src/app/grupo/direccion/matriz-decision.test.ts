import { describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/decision", () => ({ getMatrizDecision: vi.fn(), guardarFondosMutuos: vi.fn() }));

import { VistaMatriz } from "./matriz-decision-client";
import { ToastProvider } from "@/components/toast-provider";
import type { SedeDecision } from "@/app/actions/decision";
import type { DatosDecision } from "@/lib/decisiones";

const datos = (o: Partial<DatosDecision> = {}): DatosDecision => ({
  businessId: 2, sede: "Fonavi", banco: 11795, efectivo: 190, bancoAl: "2026-10-03", fondos: null, fondosAl: null,
  fijosMes: 25000, varRatio: 0.45, ventasMes: 55000, ticket: 25, cuotasMes: 1400, diasDelMes: 31,
  reserva: { monto: 23333, como: "4 semanas de costos fijos" },
  tendencias: { varAntes: 0.45, varAhora: 0.45, fijosAntes: 25000, fijosAhora: 25000 }, ...o,
});

const render = (sedes: SedeDecision[]) =>
  renderToStaticMarkup(createElement(ToastProvider, null, createElement(VistaMatriz, { sedes, onRecargar: () => {} })));

describe("Matriz de decisión (pantalla)", () => {
  test("muestra las cinco preguntas por sede y el detalle de la primera casilla", () => {
    const html = render([
      { businessId: 2, sede: "Fonavi", datos: datos(), avisos: [], reservaConfig: null },
      { businessId: 1, sede: "Atelier", datos: null, avisos: ["Faltan datos."], reservaConfig: null },
    ]);
    for (const t of ["¿Puedo retirar dinero?", "¿Puedo contratar o sumar un gasto fijo?", "¿Necesito ajustar precios?", "¿Puedo reinvertir en el negocio?", "¿Puedo comprar inventario o insumos?"]) {
      expect(html).toContain(t);
    }
    expect(html).toContain("Fonavi");
    expect(html).toContain("Sin datos");
    expect(html).toContain("Plata libre");
    expect(html).toContain("Qué hacer");
  });
});
