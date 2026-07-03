/**
 * PIC · Simulador de precio (lógica PURA — patrón liquidity.ts).
 *
 * HONESTIDAD INCORPORADA: no conocemos la elasticidad del mercado de
 * Cajamarca, así que un cambio de precio NUNCA devuelve una promesa
 * única — devuelve ESCENARIOS (volumen igual / −5% / −10%) y el punto
 * de equilibrio: cuánta venta puedes perder antes de que la subida
 * deje de convenir. La decisión es del dueño, con el mapa completo.
 */

import type { ProductIntel } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export type PriceScenario = {
  label: string;
  volumeDeltaPct: number;      // 0, -5, -10
  units: number;
  revenue: number;
  contribution: number;
  contributionDelta: number;   // vs situación actual
  marginPct: number;
};

export type PriceSimulation =
  | {
      ok: true;
      current: { price: number; units: number; revenue: number; contribution: number; marginPct: number };
      newPrice: number;
      scenarios: PriceScenario[];
      /** % de volumen que puedes perder antes de quedar igual que hoy.
       *  null si el precio nuevo deja MENOS contribución unitaria (no hay
       *  margen de pérdida: todo escenario empeora). */
      breakEvenVolumeDropPct: number | null;
      note: string;
    }
  | { ok: false; error: string };

export function simulatePriceChange(p: ProductIntel, newPrice: number): PriceSimulation {
  if (!p.hasCost || p.unitCogs === null) {
    return { ok: false, error: "Este producto no tiene costo conocido: primero vincúlalo o costéalo." };
  }
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { ok: false, error: "Precio inválido." };
  }
  if (newPrice <= p.unitCogs) {
    return { ok: false, error: `Ese precio (S/${newPrice.toFixed(2)}) no cubre ni el costo unitario (S/${p.unitCogs.toFixed(2)}).` };
  }

  const currentUnitContribution = p.avgPrice - p.unitCogs;
  const currentContribution = r2(currentUnitContribution * p.units);
  const newUnitContribution = newPrice - p.unitCogs;

  const mk = (volumeDeltaPct: number, label: string): PriceScenario => {
    const units = Math.round(p.units * (1 + volumeDeltaPct / 100));
    const revenue = r2(units * newPrice);
    const contribution = r2(units * newUnitContribution);
    return {
      label,
      volumeDeltaPct,
      units,
      revenue,
      contribution,
      contributionDelta: r2(contribution - currentContribution),
      marginPct: r1((newUnitContribution / newPrice) * 100),
    };
  };

  // Punto de equilibrio: unidades mínimas para igualar la utilidad actual.
  const breakEvenUnits = currentContribution / newUnitContribution;
  const dropPct = (1 - breakEvenUnits / p.units) * 100;
  const breakEvenVolumeDropPct = newUnitContribution > currentUnitContribution ? r1(dropPct) : null;

  return {
    ok: true,
    current: {
      price: p.avgPrice,
      units: p.units,
      revenue: p.revenue,
      contribution: currentContribution,
      marginPct: p.marginPct ?? r1((currentUnitContribution / p.avgPrice) * 100),
    },
    newPrice,
    scenarios: [
      mk(0, "Si el volumen no cambia"),
      mk(-5, "Si cae 5%"),
      mk(-10, "Si cae 10%"),
    ],
    breakEvenVolumeDropPct,
    note:
      breakEvenVolumeDropPct !== null
        ? `No conocemos la elasticidad real: son escenarios, no promesas. Punto de equilibrio: puedes perder hasta ${breakEvenVolumeDropPct}% del volumen y seguir ganando lo mismo que hoy.`
        : "Con este precio la contribución por unidad BAJA: cualquier caída de volumen empeora el resultado. Solo tiene sentido si esperas vender más.",
  };
}
