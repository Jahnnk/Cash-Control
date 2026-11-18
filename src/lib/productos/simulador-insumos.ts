/**
 * ¿Y si sube un insumo? · simulador de alzas (MOTOR, puro).
 *
 * Mejora B del análisis del Excel de pricing (pedido de Jahnn, 18-nov-2026). Con el desglose del costo de
 * cada producto por insumo (lib/productos/desglose-insumos.ts) y lo vendido en el mes:
 *
 *   PESO     cuánto se gasta al mes en cada insumo a través de lo que se vende (costo por unidad × unidades).
 *            Los que más pesan son los que hay que vigilar y negociar.
 *   ALZA     si un insumo sube X%, su parte del costo de cada producto sube X%. El costo nuevo del producto
 *            es la suma; se ve cuánto más cuesta al mes y qué productos pasan el 35% del precio.
 *   PRECIO   el precio que deja la MISMA ganancia en soles por unidad que hoy, redondeado como la carta.
 *
 * El costo es el de insumos (la mirada del Grupo). En lo que hace Atelier la subida la absorbe primero
 * Atelier; la cafetería la siente solo si Atelier sube el precio interno.
 */

import type { AporteInsumo } from "./desglose-insumos";
import type { RentabilidadSede } from "./rentabilidad";
import { MIN_UNIDADES } from "./rentabilidad";
import { NECESIDAD_ALTA_PCT, pasoDe } from "./subida-precios";

export type ProductoSim = {
  nombre: string;
  /** Unidades llevadas a un mes completo. */
  unidadesMes: number;
  precio: number;
  costo: number;
  deAtelier: boolean;
  desglose: AporteInsumo[];
};

export type PesoInsumo = { clave: string; sku: string | null; nombre: string; costoMes: number; pct: number; productos: number };

export type ProductoSimulado = {
  nombre: string;
  deAtelier: boolean;
  unidadesMes: number;
  precio: number;
  costoAntes: number;
  costoDespues: number;
  pctAntes: number;
  pctDespues: number;
  /** Pasa el 35% con la subida (antes no). */
  cruza: boolean;
  extraMes: number;
  /** El precio redondo que deja la misma ganancia en soles por unidad que hoy. */
  precioParaMantener: number;
};

export type ResultadoSim = {
  productos: ProductoSimulado[];
  extraMes: number;
  /** Cuánto sube el costo de insumos de todo lo vendido (con desglose). */
  subidaCostoPct: number;
  cruzan: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export const claveInsumo = (a: { sku: string | null; nombre: string }) => (a.sku?.trim() ? a.sku.trim().toUpperCase() : `N:${a.nombre.toLowerCase().trim()}`);

/** Los productos del mes con desglose, llevados a mes completo (los de muy poca venta no entran). */
export function productosParaSimular(r: RentabilidadSede): { productos: ProductoSim[]; sinDesglose: number } {
  const [y, m] = r.mes.split("-").map(Number);
  const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const aMes = r.dias > 0 && r.dias < diasDelMes && r.hasta < `${r.mes}-${String(diasDelMes).padStart(2, "0")}` ? diasDelMes / r.dias : 1;
  const productos: ProductoSim[] = [];
  let sinDesglose = 0;
  for (const p of r.productos) {
    if (p.unidades < MIN_UNIDADES || p.familia.startsWith("Otros")) continue;
    const precio = p.precioCarta != null && p.precioCarta > 0 ? p.precioCarta : p.precio;
    const desglose = p.desglose ?? null;
    if (!precio || precio <= 0 || !desglose || desglose.length === 0) { sinDesglose++; continue; }
    const costo = desglose.reduce((t, x) => t + x.costo, 0);
    productos.push({ nombre: p.nombre, unidadesMes: p.unidades * aMes, precio, costo, deAtelier: p.deAtelier, desglose });
  }
  return { productos, sinDesglose };
}

/** Lo que se gasta al mes en cada insumo a través de lo vendido, de mayor a menor. */
export function pesoDeInsumos(productos: ProductoSim[]): PesoInsumo[] {
  const acum = new Map<string, PesoInsumo & { usados: Set<string> }>();
  let total = 0;
  for (const p of productos) for (const x of p.desglose) {
    const k = claveInsumo(x);
    const mes = x.costo * p.unidadesMes;
    total += mes;
    const a = acum.get(k) ?? { clave: k, sku: x.sku, nombre: x.nombre, costoMes: 0, pct: 0, productos: 0, usados: new Set<string>() };
    a.costoMes += mes;
    a.usados.add(p.nombre);
    acum.set(k, a);
  }
  return [...acum.values()]
    .map(({ usados, ...a }) => ({ ...a, costoMes: r2(a.costoMes), pct: total > 0 ? r1((a.costoMes / total) * 100) : 0, productos: usados.size }))
    .sort((a, b) => b.costoMes - a.costoMes);
}

/**
 * El precio redondo (como la carta) más bajo que deja la MISMA ganancia en soles por unidad que hoy: el precio
 * de hoy más lo que subió el costo. Con el paso del precio de hoy (S/ 0.50 bajo S/ 10, de sol en sol desde
 * S/ 10) y conservando el .9.
 */
export function precioParaMantener(precio: number, costoAntes: number, costoDespues: number): number {
  if (costoDespues <= costoAntes) return precio;
  const meta = precio + (costoDespues - costoAntes);
  const conNueve = Math.abs(Math.round(precio * 10) % 10) === 9 && precio >= 10;
  const paso = pasoDe(precio);
  const base = conNueve ? meta + 0.1 : meta;
  const redondo = Math.ceil(base / paso - 1e-9) * paso;
  return r2(conNueve ? redondo - 0.1 : redondo);
}

/** `alzas`: % de subida por clave de insumo (claveInsumo). */
export function simular(productos: ProductoSim[], alzas: Map<string, number>): ResultadoSim {
  const out: ProductoSimulado[] = [];
  let antesMes = 0, despuesMes = 0;
  for (const p of productos) {
    const despues = p.desglose.reduce((t, x) => t + x.costo * (1 + (alzas.get(claveInsumo(x)) ?? 0) / 100), 0);
    antesMes += p.costo * p.unidadesMes;
    despuesMes += despues * p.unidadesMes;
    if (despues - p.costo < 0.0005) continue;
    const pctAntes = (p.costo / p.precio) * 100;
    const pctDespues = (despues / p.precio) * 100;
    out.push({
      nombre: p.nombre, deAtelier: p.deAtelier, unidadesMes: Math.round(p.unidadesMes), precio: p.precio,
      costoAntes: r2(p.costo), costoDespues: r2(despues), pctAntes: r1(pctAntes), pctDespues: r1(pctDespues),
      cruza: pctAntes <= NECESIDAD_ALTA_PCT && pctDespues > NECESIDAD_ALTA_PCT,
      extraMes: r2((despues - p.costo) * p.unidadesMes),
      precioParaMantener: precioParaMantener(p.precio, p.costo, despues),
    });
  }
  out.sort((a, b) => Number(b.cruza) - Number(a.cruza) || b.extraMes - a.extraMes);
  return {
    productos: out,
    extraMes: r2(despuesMes - antesMes),
    subidaCostoPct: antesMes > 0 ? r1((despuesMes / antesMes - 1) * 100) : 0,
    cruzan: out.filter((p) => p.cruza).length,
  };
}
