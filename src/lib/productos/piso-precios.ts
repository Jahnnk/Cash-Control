/**
 * El piso de precios de cada producto de la carta · MOTOR (puro).
 *
 * Pedido de Jahnn (15-oct-2026), de la asesoría con su coach de negocios: un precio mínimo por producto para que
 * el costo no se coma la venta. Desde el 25-nov-2026 (fase 3 de «unificar pricing») el piso usa LA MISMA META de
 * la ruta de precios de Recetas (lib/precios-sugeridos.ts → metaCostoCarta), no una propia:
 *
 *   · se prepara en la cafetería   costo de insumos ≤ 30% del precio  → piso = costo ÷ 0.30
 *   · lo hace Atelier              costo de insumos ≤ 22% del precio  → piso = costo ÷ 0.22
 *
 * Se apoya en lo que ya calcula «¿Dónde ganamos plata?» (lib/productos/rentabilidad.ts):
 * precio = lo que Byte cobró en promedio; costo = el de INSUMOS: la receta de la cafetería o, en lo que hace
 * Atelier, el costo de Atelier (no su precio interno, que ya trae el margen de Atelier: por eso su meta es más
 * baja). Los productos sin costo de insumos conocido no entran (se cuentan aparte).
 *
 *   Estado:  bajo     el costo pasa la meta          → se sugiere el precio de la ruta (cartaPorMeta)
 *            sano     hasta 5 puntos bajo la meta
 *            holgado  más de 5 puntos bajo la meta
 *
 * «Si se vendiera igual»: lo que dejaría subir el precio al sugerido con las mismas unidades, llevado a
 * un mes completo (si el reporte llega hasta el día 10, se escala por los días del mes: de lo
 * contrario «al mes» sería la mitad de la verdad). Es una cuenta, no una predicción: un precio
 * más alto puede vender menos.
 */

import type { ProductoRentable, RentabilidadSede } from "./rentabilidad";
import { cartaPorMeta, frenteMeta, metaCostoCarta } from "../precios-sugeridos";

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
  /** El costo como % del precio (food cost). */
  costoPct: number;
  /** La meta de su clase (30% cafetería, 22% Atelier), en %. */
  metaPct: number;
  margenPct: number;
  /** costo ÷ meta. */
  piso: number;
  /** El precio de carta de la ruta de precios (redondeado de S/ 0.50 en S/ 0.50). */
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
  /** El margen que pide la meta para esa misma mezcla de productos (ponderado por lo vendido). */
  margenMetaPct: number | null;
  /** Lo que dejaría subir todos los bajo-piso a su piso, si se vendiera igual. */
  extraTotal: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** El estado frente a la meta de su clase (costoPct = costo ÷ precio × 100). */
export function estadoFrenteMeta(costoPct: number, deAtelier: boolean): EstadoPiso {
  const f = frenteMeta(costoPct, deAtelier);
  return f === "pasa" ? "bajo" : f === "en-meta" ? "sano" : "holgado";
}

function deProducto(p: ProductoRentable, aMes: number): FilaPiso | null {
  const costo = p.costoInsumos;
  if (p.precio === null || costo === null || p.precio <= 0 || costo <= 0) return null;
  const margenPct = ((p.precio - costo) / p.precio) * 100;
  const costoPct = (costo / p.precio) * 100;
  const estado = estadoFrenteMeta(costoPct, p.deAtelier);
  const meta = metaCostoCarta(p.deAtelier);
  const piso = costo / meta;
  const precioSugerido = cartaPorMeta(costo, p.deAtelier);
  const subida = estado === "bajo" ? Math.max(0, r2(precioSugerido - p.precio)) : 0;
  return {
    nombre: p.nombre, familia: p.familia, deAtelier: p.deAtelier, unidades: p.unidades,
    precio: p.precio, costo, costoPct: r1(costoPct), metaPct: r1(meta * 100), margenPct: r1(margenPct),
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
  const metaTotal = todas.reduce((t, f) => t + (1 - f.metaPct / 100) * ventas(f), 0);
  return {
    businessId: r.businessId, sede: r.sede, mes: r.mes, hasta: r.hasta, filas,
    conCosto: todas.length,
    sinInsumos: r.productos.filter((p) => p.precio !== null && p.precio > 0 && (p.costoInsumos === null || p.costoInsumos <= 0)).length,
    bajo: todas.filter((f) => f.estado === "bajo").length,
    ventasBajoPct: total > 0 ? Math.round((bajoVentas / total) * 100) : null,
    margenCartaPct: total > 0 ? r1((dejaTotal / total) * 100) : null,
    margenMetaPct: total > 0 ? r1((metaTotal / total) * 100) : null,
    extraTotal: r2(todas.reduce((t, f) => t + f.extraMes, 0)),
  };
}
