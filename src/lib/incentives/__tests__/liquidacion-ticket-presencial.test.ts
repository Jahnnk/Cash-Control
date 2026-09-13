/**
 * El acta paga con el MISMO ticket que el administrador ve en su panel.
 *
 * Auditoría de Fonavi (13-sep-2026): Chari veía en el panel un ticket
 * sin delivery ni consumo del personal (política vigente) y la
 * liquidación dividía la venta TOTAL entre las personas TOTALES.
 * Fonavi agosto: S/23.59 en el panel, S/24.21 en el acta.
 */
import { describe, it, expect } from "vitest";
import { computeLiquidation, computeProgress, type IncentiveConfigT, type DailyEntry } from "../engine";

const CONFIG: IncentiveConfigT = {
  ticketBase: 24.7, marginPct: 0.533, trafficFloor: 49, poolPct: 0.4,
  levels: [
    { nombre: "Nivel 1", delta: 1.5, bono_mt: 24, bono_tc: 48, bono_admin: 89, premio_mv: 68 },
    { nombre: "Nivel 2", delta: 3, bono_mt: 48, bono_tc: 97, bono_admin: 179, premio_mv: 134 },
  ],
};

/** 30 días iguales: 55 personas, S/1,400, de los cuales 5 pedidos de delivery por S/250. */
const dias = (conDelivery: boolean): DailyEntry[] =>
  Array.from({ length: 30 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    personas: 55, revenue: 1400, items: 140,
    deliveryPedidos: conDelivery ? 5 : 0, deliveryVenta: conDelivery ? 250 : 0,
    personalPedidos: 0, personalVenta: 0,
  }) as DailyEntry);

const liquidar = (d: DailyEntry[]) =>
  computeLiquidation({
    month: "2026-08", todayISO: "2026-09-13", config: CONFIG, staff: [],
    dailies: d, unverifiedDays: 0, observedDays: [], mejorVendedor: null,
  });

describe("un solo ticket para el panel y el acta", () => {
  it("el acta excluye el delivery del ticket", () => {
    // Presencial: (1400−250)/(55−5) = S/23.00. Total sería S/25.45.
    expect(liquidar(dias(true)).ticketFinal).toBe(23);
  });

  it("el acta y el panel dan exactamente el mismo número", () => {
    const d = dias(true);
    const panel = computeProgress(CONFIG, [], d, 31);
    expect(liquidar(d).ticketFinal).toBe(panel.ticketActual);
  });

  it("el piso de tráfico sigue contando a TODAS las personas", () => {
    // 55 por día pasa el piso de 49; si se midiera presencial (50)
    // también pasaría, pero la regla es de volumen de la sede.
    expect(liquidar(dias(true)).personasPorDia).toBe(55);
    expect(liquidar(dias(true)).trafficOk).toBe(true);
  });

  it("sin delivery registrado, todo queda como antes", () => {
    expect(liquidar(dias(false)).ticketFinal).toBe(25.45);
  });
});
