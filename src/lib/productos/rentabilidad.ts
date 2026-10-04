/**
 * ¿Dónde ganamos plata? · rentabilidad por producto de la carta (MOTOR, puro).
 *
 * Pedido de Jahnn (4-oct-2026), idea de un libro: muchos negocios tienen
 * productos que se venden mucho pero dejan poco, y otros que venden poco pero
 * dejan mucho. Sin mirar el margen no se sabe cuáles son.
 *
 *   Margen $  = precio − costo directo (por unidad)
 *   Margen %  = margen $ ÷ precio
 *   Deja      = margen $ × unidades vendidas en el período
 *
 * Precio = lo que Byte cobró en promedio. Costo = lo que le cuesta a la
 * CAFETERÍA (receta propia o precio interno de Atelier), del Excel de pricing
 * (lib/productos/costos-carta.ts). No incluye planilla ni alquiler: por eso el
 * margen de un producto sale muy por encima del margen de la sede.
 *
 * Marcas (se comparan solo productos con costo conocido y volumen mínimo):
 *   · campeón            — está entre el tercio que más vende y su margen % es el de la carta o mejor.
 *   · vende mucho, deja poco — entre el tercio que más vende y con el margen % bien por debajo del promedio.
 *   · joya escondida     — vende por debajo de la mediana, con margen % claramente alto y un margen $ por unidad
 *                          que valga la pena (al menos 3/4 de la mediana de la carta).
 * Los que venden poco Y dejan poco los trata «Candidatos a reemplazo».
 */

import { claveByte, enlazarCosto, type CostoCarta } from "./costos-carta";

export type MarcaRentabilidad = "campeon" | "mucho-deja-poco" | "joya";

/** Unidades mínimas en el período para opinar de un producto. */
export const MIN_UNIDADES = 8;
/** Cuántos puntos de margen % por debajo del promedio cuenta como «deja poco». */
export const PUNTOS_DEJA_POCO = 8;
/** Cuántos puntos por encima del promedio cuenta como margen claramente alto. */
export const PUNTOS_MARGEN_ALTO = 10;

export type ProductoRentable = {
  nombre: string;
  familia: string;
  unidades: number;
  ingresos: number;
  precio: number | null;
  costo: number | null;
  margenUnidad: number | null;
  margenPct: number | null;
  /** margen $ × unidades. null = sin costo. */
  deja: number | null;
  marca: MarcaRentabilidad | null;
};

export type RentabilidadSede = {
  businessId: number;
  sede: string;
  mes: string;
  desde: string;
  hasta: string;
  dias: number;
  productos: ProductoRentable[];
  /** Ventas de carta del período y % que tiene costo conocido. */
  ventasCarta: number;
  coberturaPct: number;
  /** Margen % promedio de la carta (ponderado por lo vendido): lo que deja cada S/100 vendidos de carta. */
  margenPromedioPct: number | null;
  /** Lo que deja toda la carta con costo conocido. */
  dejaTotal: number;
  /** % de lo que deja la carta que explican los 10 productos que más dejan. */
  top10Pct: number | null;
  sinCosto: { nombre: string; ingresos: number; unidades: number }[];
  conteo: Record<MarcaRentabilidad, number>;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return 0;
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.ceil(p * ordenados.length) - 1));
  return ordenados[i];
}

export function rentabilidadDeSede(input: {
  businessId: number; sede: string; mes: string; desde: string; hasta: string; dias: number;
  carta: { nombre: string; familia: string; unidades: number; ingresos: number }[];
  costos: CostoCarta[];
  vinculos: Map<string, string>;
}): RentabilidadSede {
  // Una fila por producto (las variantes de nombre se juntan con la misma clave que usa Candidatos).
  const juntos = new Map<string, { nombre: string; familia: string; unidades: number; ingresos: number; mejor: number }>();
  for (const p of input.carta) {
    if (p.unidades <= 0) continue;
    const k = claveByte(p.nombre) || p.nombre;
    const a = juntos.get(k) ?? { nombre: p.nombre, familia: p.familia, unidades: 0, ingresos: 0, mejor: 0 };
    a.unidades += p.unidades; a.ingresos += p.ingresos;
    if (p.ingresos > a.mejor) { a.nombre = p.nombre; a.familia = p.familia; a.mejor = p.ingresos; }
    juntos.set(k, a);
  }

  const productos: ProductoRentable[] = [...juntos.values()].map((a) => {
    const precio = a.unidades > 0 ? a.ingresos / a.unidades : null;
    const costo = enlazarCosto(a.nombre, input.costos, input.vinculos, precio)?.item.costo ?? null;
    const margenUnidad = precio !== null && costo !== null ? precio - costo : null;
    return {
      nombre: a.nombre, familia: a.familia, unidades: a.unidades, ingresos: r2(a.ingresos),
      precio: precio !== null ? r2(precio) : null, costo: costo !== null ? r2(costo) : null,
      margenUnidad: margenUnidad !== null ? r2(margenUnidad) : null,
      margenPct: margenUnidad !== null && precio ? r1((margenUnidad / precio) * 100) : null,
      deja: margenUnidad !== null ? r2(margenUnidad * a.unidades) : null,
      marca: null,
    };
  });

  const conCosto = productos.filter((p) => p.deja !== null);
  const ventasCarta = productos.reduce((t, p) => t + p.ingresos, 0);
  const ingresosConCosto = conCosto.reduce((t, p) => t + p.ingresos, 0);
  const dejaTotal = r2(conCosto.reduce((t, p) => t + (p.deja ?? 0), 0));
  const margenPromedioPct = ingresosConCosto > 0 ? r1((dejaTotal / ingresosConCosto) * 100) : null;

  // Marcas, solo entre los que tienen costo y volumen para opinar.
  const conteo: Record<MarcaRentabilidad, number> = { campeon: 0, "mucho-deja-poco": 0, joya: 0 };
  const elegibles = conCosto.filter((p) => p.unidades >= MIN_UNIDADES);
  if (margenPromedioPct !== null && elegibles.length >= 6) {
    const unidades = elegibles.map((p) => p.unidades).sort((a, b) => a - b);
    const tercioAlto = percentil(unidades, 2 / 3);
    const mediana = percentil(unidades, 0.5);
    const margenesUnidad = elegibles.map((p) => p.margenUnidad ?? 0).sort((a, b) => a - b);
    const medianaMargenUnidad = percentil(margenesUnidad, 0.5);
    for (const p of elegibles) {
      const mp = p.margenPct ?? 0;
      let marca: MarcaRentabilidad | null = null;
      if (p.unidades >= tercioAlto && mp >= margenPromedioPct) marca = "campeon";
      else if (p.unidades >= tercioAlto && mp < margenPromedioPct - PUNTOS_DEJA_POCO) marca = "mucho-deja-poco";
      else if (p.unidades < mediana && mp >= margenPromedioPct + PUNTOS_MARGEN_ALTO && (p.margenUnidad ?? 0) >= medianaMargenUnidad * 0.75) marca = "joya";
      p.marca = marca;
      if (marca) conteo[marca] += 1;
    }
  }

  const ordenados = [...productos].sort((a, b) => (b.deja ?? -Infinity) - (a.deja ?? -Infinity) || b.ingresos - a.ingresos);
  const top10 = ordenados.filter((p) => p.deja !== null).slice(0, 10).reduce((t, p) => t + (p.deja ?? 0), 0);

  return {
    businessId: input.businessId, sede: input.sede, mes: input.mes, desde: input.desde, hasta: input.hasta, dias: input.dias,
    productos: ordenados, ventasCarta: r2(ventasCarta),
    coberturaPct: ventasCarta > 0 ? Math.round((ingresosConCosto / ventasCarta) * 100) : 0,
    margenPromedioPct, dejaTotal,
    top10Pct: dejaTotal > 0 ? Math.round((top10 / dejaTotal) * 100) : null,
    sinCosto: productos.filter((p) => p.deja === null).map((p) => ({ nombre: p.nombre, ingresos: p.ingresos, unidades: p.unidades })).sort((a, b) => b.ingresos - a.ingresos),
    conteo,
  };
}
