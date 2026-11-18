/**
 * Historial de precios de compra de los insumos · MOTOR (puro).
 *
 * Mejora C del análisis del Excel de pricing (pedido de Jahnn, 18-nov-2026): el Excel guarda solo el
 * precio de compra de HOY y cada mes se reemplaza, así que se pierde cuánto subió cada insumo. Desde
 * ahora, cada vez que se sube el Excel en Grupo → Recetas y costos, el sistema guarda una foto de los
 * precios (tabla insumos_precios, una fila por fecha, hoja y SKU). Aquí se comparan las fotos.
 */

export type PrecioInsumo = {
  /** De qué hoja sale: «ATE · Insumos» (lo que compra Atelier) o «CAF · Insumos» (lo que compran las cafeterías). */
  origen: "Atelier" | "Cafetería";
  sku: string;
  nombre: string;
  /** El precio es por kg, por litro o por unidad. */
  unidad: "kg" | "l" | "und";
  precio: number;
};

export type FotoPrecio = PrecioInsumo & { fecha: string };

export type CambioPrecio = {
  origen: PrecioInsumo["origen"];
  sku: string;
  nombre: string;
  unidad: PrecioInsumo["unidad"];
  desde: string;
  hasta: string;
  antes: number;
  ahora: number;
  cambioPct: number;
};

export type HistorialPrecios = {
  /** Fechas con foto, de la más antigua a la más reciente. */
  fechas: string[];
  /** Cada insumo: la primera foto contra la última (solo los que cambiaron), de la mayor subida a la mayor baja. */
  cambios: CambioPrecio[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function historialDePrecios(fotos: FotoPrecio[]): HistorialPrecios {
  const fechas = [...new Set(fotos.map((f) => f.fecha))].sort();
  const porInsumo = new Map<string, FotoPrecio[]>();
  for (const f of fotos) {
    const k = `${f.origen}|${f.sku}`;
    porInsumo.set(k, [...(porInsumo.get(k) ?? []), f]);
  }
  const cambios: CambioPrecio[] = [];
  for (const lista of porInsumo.values()) {
    const orden = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const a = orden[0], b = orden[orden.length - 1];
    if (a.fecha === b.fecha || a.precio <= 0 || a.unidad !== b.unidad) continue;
    const cambioPct = r1((b.precio / a.precio - 1) * 100);
    if (cambioPct === 0) continue;
    cambios.push({ origen: b.origen, sku: b.sku, nombre: b.nombre, unidad: b.unidad, desde: a.fecha, hasta: b.fecha, antes: a.precio, ahora: b.precio, cambioPct });
  }
  cambios.sort((x, y) => y.cambioPct - x.cambioPct);
  return { fechas, cambios };
}

/**
 * Cuánto subió cada SKU para el simulador: si está en las dos hojas, el promedio de las dos (la mantequilla
 * la compran Atelier y las cafeterías).
 */
export function alzaPorSku(cambios: CambioPrecio[]): Map<string, number> {
  const suma = new Map<string, { t: number; n: number }>();
  for (const c of cambios) {
    const x = suma.get(c.sku) ?? { t: 0, n: 0 };
    suma.set(c.sku, { t: x.t + c.cambioPct, n: x.n + 1 });
  }
  return new Map([...suma].map(([k, x]) => [k, r1(x.t / x.n)]));
}
