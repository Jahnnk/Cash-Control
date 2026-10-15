/**
 * El piso de precios de cada producto de la carta · MOTOR (puro).
 *
 * Pedido de Jahnn (15-oct-2026), de la asesoría con su coach de negocios:
 *
 *   · Piso de fijación de precios: para que el costo de insumos se quede cerca del 33%
 *     de la venta, el precio mínimo de un producto es su costo × 3.
 *   · Margen bruto saludable: cada producto debe dejar al menos 65–70% del precio
 *     después de su costo (el costo, no más de 30–35% del precio).
 *
 * Se apoya en lo que ya calcula «¿Dónde ganamos plata?» (lib/productos/rentabilidad.ts):
 * precio = lo que Byte cobró en promedio; costo = el de INSUMOS (food cost): la receta de la
 * cafetería o, en lo que hace Atelier, el costo de Atelier. OJO: el «costo para la cafetería» de
 * lo de Atelier es su precio interno, que ya trae el margen de Atelier; multiplicarlo por 3
 * contaría ese margen dos veces (la empanada mixta: S/4.50 de precio interno, S/1.72 de insumos).
 * Los productos de Atelier sin costo de insumos conocido no entran (se cuentan aparte).
 *
 *   Estado:  holgado  margen ≥ 70%
 *            sano     margen de 65% a 70%
 *            bajo     margen < 65%  → está por debajo del piso; se sugiere subir a costo × 3
 *
 * «Si se vendiera igual»: lo que dejaría subir el precio al piso con las mismas unidades, llevado a
 * un mes completo (si el reporte llega hasta el día 10, se escala por los días del mes: de lo
 * contrario «al mes» sería la mitad de la verdad). Es una cuenta, no una predicción: un precio
 * más alto puede vender menos.
 */

import type { ProductoRentable, RentabilidadSede } from "./rentabilidad";

/** El piso: costo × 3 deja el costo en un tercio del precio. */
export const MULTIPLO_PISO = 3;
/** Margen bruto mínimo saludable y el ideal (% del precio). */
export const MARGEN_MINIMO_PCT = 65;
export const MARGEN_IDEAL_PCT = 70;

export type EstadoPiso = "holgado" | "sano" | "bajo";

export type FilaPiso = {
  nombre: string;
  familia: string;
  /** Lo produce Atelier (su costo es el de insumos de Atelier, no su precio interno). */
  deAtelier: boolean;
  unidades: number;
  precio: number;
  /** Costo de insumos. */
  costo: number;
  /** El costo como % del precio (lo que el coach llama food cost). */
  costoPct: number;
  margenPct: number;
  /** costo × 3. */
  piso: number;
  /** El piso redondeado hacia arriba a S/ 0.10. */
  precioSugerido: number;
  /** Cuánto subir por unidad (0 si ya cumple). */
  subida: number;
  /** Lo que dejaría al mes subir al piso, si se vendiera igual. */
  extraMes: number;
  estado: EstadoPiso;
};

export type PisoSede = {
  businessId: number;
  sede: string;
  mes: string;
  hasta: string;
  /** Productos con precio y costo conocidos, los que bajo el piso primero (por lo que dejarían). */
  filas: FilaPiso[];
  conCosto: number;
  /** Productos con precio pero sin costo de insumos conocido (no entran al piso). */
  sinInsumos: number;
  bajo: number;
  /** % de lo vendido (con costo conocido) que está en productos bajo el piso. */
  ventasBajoPct: number | null;
  /** Margen bruto de la carta con costo conocido (ponderado por lo vendido). */
  margenCartaPct: number | null;
  /** Lo que dejaría subir todos los bajo-piso a su piso, si se vendiera igual. */
  extraTotal: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const arriba10 = (n: number) => Math.ceil(n * 10 - 1e-9) / 10;

export function estadoDelMargen(margenPct: number): EstadoPiso {
  if (margenPct >= MARGEN_IDEAL_PCT) return "holgado";
  if (margenPct >= MARGEN_MINIMO_PCT) return "sano";
  return "bajo";
}

function deProducto(p: ProductoRentable, aMes: number): FilaPiso | null {
  const costo = p.costoInsumos;
  if (p.precio === null || costo === null || p.precio <= 0 || costo <= 0) return null;
  const margenPct = ((p.precio - costo) / p.precio) * 100;
  const estado = estadoDelMargen(margenPct);
  const piso = costo * MULTIPLO_PISO;
  const precioSugerido = arriba10(piso);
  const subida = estado === "bajo" ? Math.max(0, r2(precioSugerido - p.precio)) : 0;
  return {
    nombre: p.nombre, familia: p.familia, deAtelier: p.deAtelier, unidades: p.unidades,
    precio: p.precio, costo, costoPct: r1((costo / p.precio) * 100), margenPct: r1(margenPct),
    piso: r2(piso), precioSugerido: r2(precioSugerido), subida, extraMes: r2(subida * p.unidades * aMes), estado,
  };
}

export function pisoDePrecios(r: RentabilidadSede): PisoSede {
  // Lo vendido es del período del reporte; «al mes» lo lleva a un mes completo.
  const [y, m] = r.mes.split("-").map(Number);
  const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const aMes = r.dias > 0 && r.dias < diasDelMes && r.hasta < `${r.mes}-${String(diasDelMes).padStart(2, "0")}` ? diasDelMes / r.dias : 1;
  const todas = r.productos.map((p) => deProducto(p, aMes)).filter((f): f is FilaPiso => f !== null);
  const filas = [...todas].sort((a, b) => (a.estado === "bajo" ? 0 : 1) - (b.estado === "bajo" ? 0 : 1) || b.extraMes - a.extraMes || a.margenPct - b.margenPct);
  const ventas = (f: FilaPiso) => f.precio * f.unidades;
  const total = todas.reduce((t, f) => t + ventas(f), 0);
  const bajoVentas = todas.filter((f) => f.estado === "bajo").reduce((t, f) => t + ventas(f), 0);
  const dejaTotal = todas.reduce((t, f) => t + (f.precio - f.costo) * f.unidades, 0);
  return {
    businessId: r.businessId, sede: r.sede, mes: r.mes, hasta: r.hasta, filas,
    conCosto: todas.length,
    sinInsumos: r.productos.filter((p) => p.precio !== null && p.precio > 0 && (p.costoInsumos === null || p.costoInsumos <= 0)).length,
    bajo: todas.filter((f) => f.estado === "bajo").length,
    ventasBajoPct: total > 0 ? Math.round((bajoVentas / total) * 100) : null,
    margenCartaPct: total > 0 ? r1((dejaTotal / total) * 100) : null,
    extraTotal: r2(todas.reduce((t, f) => t + f.extraMes, 0)),
  };
}
