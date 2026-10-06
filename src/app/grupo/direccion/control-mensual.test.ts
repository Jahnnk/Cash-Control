import { describe, expect, test, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/control-mensual", () => ({
  getRevisionSemanal: vi.fn(), getCierreMes: vi.fn(), marcarSemanaRevisada: vi.fn(), marcarCheck: vi.fn(), agregarCompromiso: vi.fn(), quitarCompromiso: vi.fn(),
}));

import { Checklist, VistaCierre, VistaSemana } from "./control-mensual-client";
import { ToastProvider } from "@/components/toast-provider";
import type { DatosCierre, DatosSemana, SedeCierre } from "@/app/actions/control-mensual";
import { ritmoVentas, variacion } from "@/lib/control-mensual";

const semana: DatosSemana = {
  hoy: "2026-10-06", semana: { desde: "2026-09-28", hasta: "2026-10-04" }, revisada: null, semanaAnteriorSinRevisar: false, avisos: [],
  sedes: [
    {
      businessId: 2, sede: "Fonavi", ventasHasta: "2026-10-05",
      liquidez: { saldo: 11954, entradas: 18383, compromisos7: 2209, compromisos14: 3512, libre14: 26825, semaforo: "verde", saldoAl: "2026-10-02" },
      compromisos: [{ fecha: "2026-10-08", concepto: "Préstamos y tarjetas · segunda semana", monto: 643, origen: "recurrente", clave: "PRÉSTAMOS Y TARJETAS|2|2026-10" }],
      ritmo: ritmoVentas({ ventasMes: 5689, ventasSemana: 8804, diasConDatos: 5, diasDelMes: 31, ventaEsperada: 37500, pe: 27522 }),
      cobros: null, noPrevistos: { desvios: [], sobreTope: [], total: 0, semaforo: "verde" },
    },
    {
      businessId: 1, sede: "Atelier", ventasHasta: "2026-10-03", liquidez: null, compromisos: [],
      ritmo: ritmoVentas({ ventasMes: 2401, ventasSemana: 8098, diasConDatos: 3, diasDelMes: 31, ventaEsperada: 38500, pe: 36392 }),
      cobros: { porCobrar: 6203, atrasado: 6203, diasDesdeCarga: 59, ultimaCarga: "2026-08-10", deudores: [], semaforo: "gris" },
      noPrevistos: { desvios: [], sobreTope: [], total: 0, semaforo: "gris" },
    },
  ],
};

const sede: SedeCierre = {
  businessId: 2, sede: "Fonavi", ventas: variacion(37294, 38979), costos: variacion(17116, 20000), gastos: variacion(13820, 15000), impuestos: 125,
  ganancia: variacion(6232, 1131), margenPct: variacion(54, 43), gananciaPct: 16.7, sinResultadoPorque: null, mesCompleto: true,
  caja: { entro: 37109, salio: 33181, flujo: 3928 }, fuera: { deudas: 1814, inversion: 110, ahorro: 0, reparto: 0, otrasSedes: 0, noEsGasto: 196, rescate: 0 },
  cambios: [{ categoria: "PRODUCTOS ATELIER", actual: 12152, anterior: 15367, diferencia: -3215 }],
  equilibrio: { pe: 25703, ventas: 37294, superado: true }, libreHoy: 2335,
  siguiente: { aprobado: true, ventaEsperada: 37500, peReferencia: 27888, compromisosFijos: 14208, detalle: [{ concepto: "Planilla", monto: 10700 }] },
};
const cierre: DatosCierre = {
  mes: "2026-09", siguiente: "2026-10", sedes: [sede], marcados: [{ item: "ventas", el: "2026-10-06", por: "jahnn" }],
  grupo: { ventas: variacion(93446, 97578), costos: variacion(30157, 34842), gastos: variacion(50896, 55787), ganancia: variacion(11655, 5814), flujo: variacion(-1737, 1366), provisional: false },
  estado: { totalSedes: 3, sedesConVentas: 3, sedesConExcelCompleto: 3, sedesConResultado: 3, porAclarar: 182, sedesPresupuestoSiguienteAprobado: 3, sedesMetaSiguiente: 3 },
};
const render = (x: ReturnType<typeof h>) => renderToStaticMarkup(h(ToastProvider, null, x));

describe("Control mensual (pantalla)", () => {
  test("las 4 tarjetas semanales del libro, con el aviso de cobros sin carga", () => {
    const html = render(h(VistaSemana, { d: semana, onCambio: () => {} }));
    for (const t of ["Saldo bancario vs. compromisos", "Cobros pendientes", "Ventas de la semana", "Gastos no previstos", "No vende al crédito", "hace 59 días", "Anotar pago"]) expect(html).toContain(t);
  });
  test("cierre: las 6 preguntas y los 5 pasos", () => {
    const html = render(h(VistaCierre, { c: cierre }));
    for (const t of ["¿Cuánto vendí este mes?", "¿Cuánto me costó vender eso?", "¿Cuánto gasté en operar el negocio?", "¿Cuánto gané realmente?", "¿Cuánto tengo libre en caja?", "¿Superé mi punto de equilibrio?",
      "Estado de resultados simplificado", "Comparación vs. agosto", "Flujo de caja del mes", "Revisión de punto de equilibrio", "Proyección de octubre"]) expect(html).toContain(t);
  });
  test("checklist: 12 puntos, lo marcado y lo que falta", () => {
    const html = render(h(Checklist, { c: cierre, onCambio: () => {} }));
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(12);
    expect(html).toContain("POR ACLARAR");
    expect(html).toContain("Lo decides tú");
  });
});
