/**
 * Cafés · cuánto se vende y cuánto deja solo el café (pedido de Jahnn, 3-nov-2026), para decidir si Fonavi compra
 * una máquina de café nueva. Lógica PURA sobre la rentabilidad por producto (lib/productos/rentabilidad.ts).
 *
 * «Café» = toda bebida cuya base es el café de la máquina o del filtrado: café pasado, americano, espresso, cortado,
 * cappuccino, latte (con sabores), macchiato, moccaccino, affogato, cold brew y frappés. NO son café las infusiones,
 * el matcha (aunque se llame «latte»), los chocolates ni los jugos o batidos. Solo cuentan los productos de las
 * familias de bebidas, así que una bolsa de café para llevar (retail) no entra.
 *
 * El nombre manda, no hay categoría guardada: igual que `familiaDeProducto` (panorama.ts).
 */

import type { ProductoRentable, RentabilidadSede } from "./rentabilidad";

const quitarTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Palabras que sacan al producto del café aunque contenga una clave (matcha latte, infusiones, chocolates). */
const NO_ES_CAFE = /\b(MATCHA|INFUSION|CHOCOLATE|KOMBUCHA)\b/;
const ES_CAFE = /\b(CAFE|CAPPUCCINO|CAPUCCINO|ESPRESSO|EXPRESSO|EXPRESO|AMERICANO|LATTE|MOCCACCINO|MOCACCINO|MOCHA|MACCHIATO|CORTADO|AFFOGATO|COLD BREW|FRAPPE)\b/;
const ES_FRIO = /\b(ICED|COLD BREW|FRAPPE|FRIO|HELADO)\b|BOTELLA/;

export type TipoCafe = "caliente" | "frio";

export function esCafe(nombre: string): boolean {
  const t = quitarTildes(nombre);
  return ES_CAFE.test(t) && !NO_ES_CAFE.test(t);
}

export function tipoCafe(nombre: string): TipoCafe {
  return ES_FRIO.test(quitarTildes(nombre)) ? "frio" : "caliente";
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ProductoCafe = ProductoRentable & { tipo: TipoCafe };

export type TotalesCafe = { ventas: number; unidades: number; deja: number | null; margenPct: number | null };

export type ResumenCafe = {
  mes: string;
  dias: number;
  /** Todos los cafés vendidos, de lo que más ingresos hizo a lo que menos. */
  productos: ProductoCafe[];
  ventas: number;
  unidades: number;
  /** % de las ventas de carta del mes que es café. */
  pctDeCarta: number | null;
  ventasPorDia: number | null;
  tazasPorDia: number | null;
  /** Lo que se cobra por taza en promedio. */
  precioPromedio: number | null;
  /** Costo de las tazas con costo conocido (lo que cuesta preparar lo que se vendió). */
  costo: number | null;
  /** Lo que deja el café con costo conocido (ventas − costo). */
  deja: number | null;
  margenPct: number | null;
  /** % de lo vendido en café que tiene costo conocido. */
  coberturaPct: number;
  caliente: TotalesCafe;
  frio: TotalesCafe;
  sinCosto: { nombre: string; ingresos: number }[];
};

function totales(ps: ProductoCafe[]): TotalesCafe {
  const conCosto = ps.filter((p) => p.deja !== null);
  const ingConCosto = conCosto.reduce((t, p) => t + p.ingresos, 0);
  const deja = conCosto.length ? r2(conCosto.reduce((t, p) => t + (p.deja ?? 0), 0)) : null;
  return {
    ventas: r2(ps.reduce((t, p) => t + p.ingresos, 0)),
    unidades: ps.reduce((t, p) => t + p.unidades, 0),
    deja,
    margenPct: deja !== null && ingConCosto > 0 ? r1((deja / ingConCosto) * 100) : null,
  };
}

export function resumenCafe(d: RentabilidadSede): ResumenCafe {
  const productos: ProductoCafe[] = d.productos
    .filter((p) => esCafe(p.nombre) && /^Bebidas/.test(p.familia))
    .map((p) => ({ ...p, tipo: tipoCafe(p.nombre) }))
    .sort((a, b) => b.ingresos - a.ingresos);

  const t = totales(productos);
  const conCosto = productos.filter((p) => p.deja !== null);
  const ingConCosto = conCosto.reduce((s, p) => s + p.ingresos, 0);
  const costo = conCosto.length ? r2(conCosto.reduce((s, p) => s + (p.costo ?? 0) * p.unidades, 0)) : null;

  return {
    mes: d.mes,
    dias: d.dias,
    productos,
    ventas: t.ventas,
    unidades: t.unidades,
    pctDeCarta: d.ventasCarta > 0 ? r1((t.ventas / d.ventasCarta) * 100) : null,
    ventasPorDia: d.dias > 0 ? r2(t.ventas / d.dias) : null,
    tazasPorDia: d.dias > 0 ? r1(t.unidades / d.dias) : null,
    precioPromedio: t.unidades > 0 ? r2(t.ventas / t.unidades) : null,
    costo,
    deja: t.deja,
    margenPct: t.margenPct,
    coberturaPct: t.ventas > 0 ? r1((ingConCosto / t.ventas) * 100) : 0,
    caliente: totales(productos.filter((p) => p.tipo === "caliente")),
    frio: totales(productos.filter((p) => p.tipo === "frio")),
    sinCosto: productos.filter((p) => p.deja === null).map((p) => ({ nombre: p.nombre, ingresos: p.ingresos })),
  };
}
