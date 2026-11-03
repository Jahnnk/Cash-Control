/**
 * Cafés · cuánto se vende y cuánto deja el café, separado por CÓMO SE PREPARA (pedido de Jahnn, 3-nov-2026), para decidir
 * si Fonavi compra una máquina de café nueva. Lógica PURA sobre la rentabilidad por producto (lib/productos/rentabilidad.ts).
 *
 * Lo que importa para la máquina es lo que se hace EN la máquina, así que el café va en tres grupos:
 *   · Máquina de espresso — espresso, americano, cortado, cappuccino, latte (con sabores y fríos), macchiato, moccaccino
 *     y affogato.
 *   · Café pasado y cold brew — café de filtro y en frío: llevan café pero no pasan por la máquina de espresso
 *     (supuesto a confirmar con Jahnn).
 * NO son café las infusiones, el matcha (aunque se llame «latte»), los chocolates ni los jugos o batidos. Solo cuentan los
 * productos de las familias de bebidas, así que una bolsa de café para llevar (retail) no entra.
 *
 * El nombre manda, no hay categoría guardada: igual que `familiaDeProducto` (panorama.ts).
 */

import type { ProductoRentable, RentabilidadSede } from "./rentabilidad";

const quitarTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Palabras que sacan al producto del café aunque contenga una clave (matcha latte, infusiones, chocolates). */
const NO_ES_CAFE = /\b(MATCHA|INFUSION|CHOCOLATE|KOMBUCHA)\b/;
const ES_CAFE = /\b(CAFE|CAPPUCCINO|CAPUCCINO|ESPRESSO|EXPRESSO|EXPRESO|AMERICANO|LATTE|MOCCACCINO|MOCACCINO|MOCHA|MACCHIATO|CORTADO|AFFOGATO|COLD BREW|FRAPPE)\b/;
const ES_FRIO = /\b(ICED|COLD BREW|FRAPPE|FRIO|HELADO)\b|BOTELLA/;
const FILTRADO = /\b(CAFE PASADO|COLD BREW)\b/;

export type TipoCafe = "caliente" | "frio";
export type MetodoCafe = "maquina" | "filtrado";

export const NOMBRE_METODO: Record<MetodoCafe, string> = {
  maquina: "Con la máquina de espresso",
  filtrado: "Café pasado y cold brew",
};

export function esCafe(nombre: string): boolean {
  const t = quitarTildes(nombre);
  return ES_CAFE.test(t) && !NO_ES_CAFE.test(t);
}

export function tipoCafe(nombre: string): TipoCafe {
  return ES_FRIO.test(quitarTildes(nombre)) ? "frio" : "caliente";
}

/** Dónde se prepara: solo el café pasado y el cold brew van por filtro; todo lo demás (frappés incluidos) sale de la máquina. */
export function metodoCafe(nombre: string): MetodoCafe {
  const t = quitarTildes(nombre);
  if (FILTRADO.test(t)) return "filtrado";
  return "maquina";
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ProductoCafe = ProductoRentable & { tipo: TipoCafe; metodo: MetodoCafe };

/** Las cifras de un grupo de cafés. */
export type ParteCafe = {
  ventas: number;
  unidades: number;
  /** % de las ventas de carta del mes. */
  pctDeCarta: number | null;
  ventasPorDia: number | null;
  tazasPorDia: number | null;
  /** Lo que se cobra por taza en promedio. */
  precioPromedio: number | null;
  /** Costo de las tazas con costo conocido (lo que cuesta preparar lo que se vendió). */
  costo: number | null;
  /** Lo que deja con costo conocido (ventas − costo). */
  deja: number | null;
  margenPct: number | null;
  /** % de lo vendido que tiene costo conocido. */
  coberturaPct: number;
};

export type ResumenCafe = {
  mes: string;
  dias: number;
  /** Todos los cafés vendidos, de lo que más ingresos hizo a lo que menos. */
  productos: ProductoCafe[];
  /** Todo lo que lleva café, se prepare donde se prepare. */
  todo: ParteCafe;
  maquina: ParteCafe;
  filtrado: ParteCafe;
  sinCosto: { nombre: string; ingresos: number }[];
};

function parte(ps: ProductoCafe[], d: RentabilidadSede): ParteCafe {
  const ventas = r2(ps.reduce((t, p) => t + p.ingresos, 0));
  const unidades = ps.reduce((t, p) => t + p.unidades, 0);
  const conCosto = ps.filter((p) => p.deja !== null);
  const ingConCosto = conCosto.reduce((t, p) => t + p.ingresos, 0);
  const deja = conCosto.length ? r2(conCosto.reduce((t, p) => t + (p.deja ?? 0), 0)) : null;
  return {
    ventas, unidades,
    pctDeCarta: d.ventasCarta > 0 ? r1((ventas / d.ventasCarta) * 100) : null,
    ventasPorDia: d.dias > 0 ? r2(ventas / d.dias) : null,
    tazasPorDia: d.dias > 0 ? r1(unidades / d.dias) : null,
    precioPromedio: unidades > 0 ? r2(ventas / unidades) : null,
    costo: conCosto.length ? r2(conCosto.reduce((t, p) => t + (p.costo ?? 0) * p.unidades, 0)) : null,
    deja,
    margenPct: deja !== null && ingConCosto > 0 ? r1((deja / ingConCosto) * 100) : null,
    coberturaPct: ventas > 0 ? r1((ingConCosto / ventas) * 100) : 0,
  };
}

export function resumenCafe(d: RentabilidadSede): ResumenCafe {
  const productos: ProductoCafe[] = d.productos
    .filter((p) => esCafe(p.nombre) && /^Bebidas/.test(p.familia))
    .map((p) => ({ ...p, tipo: tipoCafe(p.nombre), metodo: metodoCafe(p.nombre) }))
    .sort((a, b) => b.ingresos - a.ingresos);
  const de = (m: MetodoCafe) => parte(productos.filter((p) => p.metodo === m), d);
  return {
    mes: d.mes,
    dias: d.dias,
    productos,
    todo: parte(productos, d),
    maquina: de("maquina"),
    filtrado: de("filtrado"),
    sinCosto: productos.filter((p) => p.deja === null).map((p) => ({ nombre: p.nombre, ingresos: p.ingresos })),
  };
}
