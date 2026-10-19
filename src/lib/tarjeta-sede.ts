/**
 * La tarjeta de cada sede en Grupo → Resumen · lógica PURA (rediseño, 17-oct-2026).
 *
 * Jahnn pidió la tarjeta con los seis números que necesita entender un dueño: Ventas (lo facturado, el punto de
 * partida), Costos (lo que se gasta para producir lo que se vende: los variables), Gastos (lo que se paga para
 * que el negocio funcione: los fijos), Caja (lo que entra de verdad), Margen (lo que queda de cada venta tras los
 * costos) y Ganancia real (lo que queda después de todo). Todo sale de las seis cifras (una sola fuente).
 */

import type { CifrasSede } from "./seis-cifras";

export type TarjetaSede = {
  businessId: number;
  sede: string;
  corte: string | null;
  ventas: number | null;
  /** Ventas de los días que siguen al corte del Excel (el Excel aún no llega hasta ahí): ventas totales = ventas + esto. */
  ventasPosteriores: number;
  costos: number | null;
  gastos: number | null;
  /** La ganancia ya los resta; se dicen aparte para que la cuenta de las barras cierre. */
  impuestos: number;
  ganancia: number | null;
  margenPct: number | null;
  gananciaPct: number | null;
  /** Por qué no hay ganancia todavía (null si la hay). */
  porque: string | null;
  /** Caja del mes: lo que entró por ventas, lo que entró por otros motivos y el total (igual al Excel). */
  caja: { ingresado: number | null; otras: number; total: number };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function tarjetaDeSede(sede: CifrasSede): TarjetaSede {
  const s = sede;
  const hay = s.conResultado;
  // La caja se cuenta hasta el corte, con la misma separación que la conciliación del mes.
  const f = s.ingresosFuera;
  const ingresado = s.ingresadoVentas ?? s.cobrado;
  const otrasOperacion = s.ingresadoVentas !== null ? (s.otrosIngresos ?? 0) : 0;
  const otras = r2(otrasOperacion + f.devolucionesSedes + f.prestamos + f.rescates + f.otros + (f.devolucionesGastos ?? 0));
  return {
    businessId: s.businessId, sede: s.sede, corte: s.corte,
    ventas: s.ventas,
    ventasPosteriores: s.ventasPosteriores ?? 0,
    costos: hay ? s.costos : null,
    gastos: hay ? s.gastos : null,
    impuestos: hay ? s.impuestos : 0,
    ganancia: s.ganancia,
    margenPct: s.margenPct,
    gananciaPct: s.gananciaPct,
    porque: hay ? null : s.sinResultadoPorque,
    caja: { ingresado: ingresado === null ? null : r2(ingresado), otras, total: r2((ingresado ?? 0) + otras) },
  };
}

const ORDEN = [2, 3, 1];
/** Fonavi, Centro, Atelier (el orden del dashboard). */
export function tarjetasDelMes(sedes: CifrasSede[]): TarjetaSede[] {
  return ORDEN.map((id) => sedes.find((s) => s.businessId === id)).filter((s): s is CifrasSede => !!s).map(tarjetaDeSede);
}
