/**
 * Mano de obra por producto · método 2 del coach (distribución por ventas) · MOTOR (puro).
 *
 * Pedido de Jahnn (15-oct-2026), de la asesoría con su coach: hay tres métodos para conocer el costo
 * real de la mano de obra por producto.
 *
 *   1. % sobre ventas:      planilla ÷ ventas. Rango sano: 20% a 25% (lib/regla-33.ts).
 *   2. Distribución por ventas (esto): la planilla se reparte entre los productos en proporción a
 *      lo que cada uno vende. Dice, en soles, qué producto paga más sueldos.
 *   3. Tiempo de preparación: costo por hora × minutos de la receta. Revela si la cocina es
 *      eficiente. (Falta cargar los minutos de cada receta; queda para después.)
 *
 * OJO con lo que NO dice el método 2: al repartir por ventas, todos los productos cargan el MISMO
 * % de su precio, así que no distingue al ineficiente (eso lo hace el método 3). Lo que sí dice es
 * cuánto lleva de sueldos cada unidad y cuántos soles de planilla pagan los productos grandes,
 * y con eso el margen que queda DESPUÉS de insumos y mano de obra. Esa meta sale de la regla del
 * 33-33-33: 100% − (costo del producto, un tercio) − (planilla, máximo 25%) = ~42% para los otros
 * fijos y el EBITDA.
 *
 * Mano de obra de un producto = su venta × (planilla ÷ ventas). Insumos: lib/productos/piso-precios.ts.
 */

import { TOPE_PLANILLA_PCT } from "../regla-33";
import type { RentabilidadSede } from "./rentabilidad";

export type BaseManoDeObra = {
  /** La planilla del mes que se reparte y la venta contra la que se mide (mismo mes, mismas sedes). */
  planilla: number;
  ventas: number;
  /** De qué mes salen (puede ser el anterior si el mes elegido está a medias). */
  mes: string;
};

export type FilaManoDeObra = {
  nombre: string;
  familia: string;
  deAtelier: boolean;
  unidades: number;
  ingresos: number;
  precio: number;
  /** Costo de insumos por unidad; null = no se conoce. */
  costoInsumos: number | null;
  /** Sueldos que lleva cada unidad. */
  moUnidad: number;
  /** Sueldos que paga el producto en el período. */
  moTotal: number;
  /** % del total de la planilla repartida. */
  participacionPct: number;
  /** Lo que queda por unidad después de insumos y mano de obra; null sin costo. */
  margenUnidad: number | null;
  margenPct: number | null;
  /** «bajo» = deja menos de lo que pide la regla después de insumos y mano de obra. */
  estado: "ok" | "bajo" | "sin-costo";
};

export type ManoDeObraSede = {
  businessId: number;
  sede: string;
  mes: string;
  hasta: string;
  base: BaseManoDeObra;
  /** Planilla ÷ ventas de la base, en %. */
  planillaPct: number;
  /** Lo que debe quedar después de insumos y mano de obra (%). */
  metaPct: number;
  /** Todos los productos con venta, los que más sueldos pagan primero. */
  filas: FilaManoDeObra[];
  /** Planilla repartida en este período (venta de carta × planilla %). */
  repartida: number;
  /** % de la planilla que pagan los 5 productos que más venden. */
  top5Pct: number | null;
  /** Margen de la carta (con costo conocido) después de insumos y mano de obra, ponderado por ventas. */
  margenCartaPct: number | null;
  bajo: number;
  conCosto: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * @param metaCostosPct el tercio del costo del producto (por defecto 100/3; cambia si el CEO ajusta el EBITDA objetivo).
 */
export function manoDeObraPorProducto(r: RentabilidadSede, base: BaseManoDeObra, metaCostosPct = 100 / 3): ManoDeObraSede | null {
  if (!(base.planilla > 0) || !(base.ventas > 0)) return null;
  const planillaFrac = base.planilla / base.ventas;
  const metaPct = r1(100 - metaCostosPct - TOPE_PLANILLA_PCT);
  const conVenta = r.productos.filter((p) => p.precio !== null && p.precio > 0 && p.unidades > 0 && p.ingresos > 0);
  const totalIngresos = conVenta.reduce((t, p) => t + p.ingresos, 0);
  if (totalIngresos <= 0) return null;

  const filas: FilaManoDeObra[] = conVenta.map((p) => {
    const precio = p.precio!;
    const moUnidad = precio * planillaFrac;
    const costo = p.costoInsumos;
    const margenUnidad = costo !== null && costo > 0 ? precio - costo - moUnidad : null;
    const margenPct = margenUnidad !== null ? (margenUnidad / precio) * 100 : null;
    return {
      nombre: p.nombre, familia: p.familia, deAtelier: p.deAtelier, unidades: p.unidades, ingresos: r2(p.ingresos), precio,
      costoInsumos: costo !== null && costo > 0 ? costo : null,
      moUnidad: r2(moUnidad), moTotal: r2(p.ingresos * planillaFrac), participacionPct: r1((p.ingresos / totalIngresos) * 100),
      margenUnidad: margenUnidad !== null ? r2(margenUnidad) : null, margenPct: margenPct !== null ? r1(margenPct) : null,
      estado: (margenPct === null ? "sin-costo" : margenPct >= metaPct ? "ok" : "bajo") as FilaManoDeObra["estado"],
    };
  }).sort((a, b) => b.moTotal - a.moTotal);

  const conCosto = filas.filter((f) => f.margenPct !== null);
  const ingresosConCosto = conCosto.reduce((t, f) => t + f.ingresos, 0);
  const margenTotal = conCosto.reduce((t, f) => t + (f.margenUnidad ?? 0) * f.unidades, 0);
  const top5 = filas.slice(0, 5).reduce((t, f) => t + f.ingresos, 0);
  return {
    businessId: r.businessId, sede: r.sede, mes: r.mes, hasta: r.hasta, base,
    planillaPct: r1(planillaFrac * 100), metaPct, filas,
    repartida: r2(totalIngresos * planillaFrac),
    top5Pct: r1((top5 / totalIngresos) * 100),
    margenCartaPct: ingresosConCosto > 0 ? r1((margenTotal / ingresosConCosto) * 100) : null,
    bajo: filas.filter((f) => f.estado === "bajo").length,
    conCosto: conCosto.length,
  };
}
