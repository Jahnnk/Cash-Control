/**
 * Recetas creadas o modificadas en el sistema · MOTOR (puro).
 *
 * Pedido de Jahnn (23-sep-2026): "si agregamos una nueva receta o sub
 * receta o modificamos alguna existente, que no tenga que subir el Excel
 * completo solo por una receta". Caso que lo motivó: la masa del Pie de
 * Manzana no existía como sub-receta y Luis no la podía registrar en mermas.
 *
 * El costo de una receta del sistema se calcula con los precios VIGENTES de
 * la lista (lo que trajo el último Excel): si sube la mantequilla, la receta
 * se actualiza sola.
 *
 *   · Preparación → costo por kg = costo de ingredientes ÷ (kg de la mezcla × (1 − merma)).
 *     Es la fórmula del Excel (Sub-Recetas, fila "Costo por 1 KG"). Si se
 *     conoce cuántos kg SALEN (carnes que pierden peso al cocinarse), se usa
 *     eso: costo ÷ kg finales.
 *   · Producto → costo por unidad = costo de ingredientes ÷ (rendimiento × (1 − merma)).
 *
 * Decisión de Jahnn: si una receta del sistema reemplaza a una del Excel,
 * gana la del sistema, también después de subir un Excel nuevo (la pantalla
 * de carga lo avisa y permite volver a la del Excel).
 */

import type { CostoPreparacion, DetalleReceta, Ingrediente, TipoCosto, UnidadBase } from "@/lib/costos-preparaciones";

export type RecetaSistema = {
  id: number;
  nombre: string;
  tipo: Exclude<TipoCosto, "insumo">;
  detalle: DetalleReceta;
  /** Ref del ítem del Excel que reemplaza, o null si es una receta nueva. */
  reemplaza: string | null;
  categoria: string | null;
};

export const refDeReceta = (id: number) => `REC:${id}`;

const A_BASE: Record<string, { base: "kg" | "l" | "und"; factor: number }> = {
  g: { base: "kg", factor: 0.001 }, kg: { base: "kg", factor: 1 },
  ml: { base: "l", factor: 0.001 }, cm3: { base: "l", factor: 0.001 }, l: { base: "l", factor: 1 },
  und: { base: "und", factor: 1 },
};

/**
 * Costo de una cantidad de un ítem. Entre peso y volumen se asume densidad 1
 * (1 ml = 1 g), igual que el Excel, que multiplica cualquier cantidad por su
 * precio por g/ml. null si no se puede (ej. gramos de algo que va por unidad).
 */
export function costoIngrediente(item: Pick<CostoPreparacion, "unidad" | "costo">, cantidad: number, unidad: string): number | null {
  const u = A_BASE[unidad.trim().toLowerCase()];
  if (!u || !Number.isFinite(cantidad)) return null;
  if (u.base === "und" || item.unidad === "und") return u.base === item.unidad ? item.costo * cantidad : null;
  return item.costo * cantidad * u.factor; // kg↔l con densidad 1
}

/** Kilos que aporta un ingrediente a la mezcla (las unidades no pesan). */
export function kilosDe(ing: Pick<Ingrediente, "unidad" | "cantidad">): number {
  const u = A_BASE[ing.unidad.trim().toLowerCase()];
  return u && u.base !== "und" ? ing.cantidad * u.factor : 0;
}

export type CostoDeReceta = {
  /** Costo de todos los ingredientes de la receta. */
  total: number;
  kilos: number;
  /** Costo por kg (preparación) o por unidad (producto); null si no se puede calcular. */
  costo: number | null;
  /** Ingredientes sin precio (sin enlazar, borrados de la lista o con unidad que no calza). */
  faltantes: string[];
  lineas: { ingrediente: Ingrediente; costo: number | null }[];
};

export function costoDeReceta(
  tipo: RecetaSistema["tipo"],
  d: DetalleReceta,
  buscar: (ref: string) => Pick<CostoPreparacion, "unidad" | "costo"> | null,
): CostoDeReceta {
  const faltantes: string[] = [];
  const lineas = d.ingredientes.map((ing) => {
    const item = ing.ref ? buscar(ing.ref) : null;
    const c = item ? costoIngrediente(item, ing.cantidad, ing.unidad) : null;
    if (c === null) faltantes.push(ing.nombre);
    return { ingrediente: ing, costo: c };
  });
  const total = lineas.reduce((s, l) => s + (l.costo ?? 0), 0);
  const kilos = d.ingredientes.reduce((s, i) => s + kilosDe(i), 0);
  const merma = Math.min(Math.max(d.merma || 0, 0), 0.95);
  const divisor = tipo === "preparacion"
    ? (d.rendimiento && d.rendimiento > 0 ? d.rendimiento : kilos * (1 - merma))
    : (d.rendimiento ?? 0) * (1 - merma);
  return { total, kilos, costo: divisor > 0 && lineas.length > 0 ? total / divisor : null, faltantes, lineas };
}

/**
 * La lista que ve todo el sistema: los ítems del Excel, con las recetas del
 * sistema encima (una receta que reemplaza a un ítem del Excel lo oculta, y
 * quien lo usaba como ingrediente pasa a usar la versión del sistema).
 * Las recetas del sistema pueden usar otras recetas del sistema; un ciclo
 * deja la receta sin costo en vez de colgarse.
 */
export function catalogoEfectivo(excel: CostoPreparacion[], recetas: RecetaSistema[]): CostoPreparacion[] {
  const reemplazadas = new Map<string, RecetaSistema>();
  for (const r of recetas) if (r.reemplaza) reemplazadas.set(r.reemplaza, r);
  const porRefExcel = new Map(excel.map((i) => [i.ref, i]));
  const porId = new Map(recetas.map((r) => [refDeReceta(r.id), r]));
  const memo = new Map<number, number | null>();
  const enCurso = new Set<number>();

  function costoSistema(r: RecetaSistema): number | null {
    if (memo.has(r.id)) return memo.get(r.id)!;
    if (enCurso.has(r.id)) return null;
    enCurso.add(r.id);
    // Con un ingrediente sin precio el costo saldría bajo: la receta no se
    // usa hasta corregirla (la pantalla de Recetas lo muestra).
    const cr = costoDeReceta(r.tipo, r.detalle, buscar);
    const c = cr.faltantes.length > 0 ? null : cr.costo;
    enCurso.delete(r.id);
    memo.set(r.id, c);
    return c;
  }

  function buscar(ref: string): Pick<CostoPreparacion, "unidad" | "costo"> | null {
    const r = porId.get(ref) ?? reemplazadas.get(ref);
    if (r) {
      const c = costoSistema(r);
      return c === null ? null : { unidad: unidadDe(r.tipo), costo: c };
    }
    return porRefExcel.get(ref) ?? null;
  }

  const deExcel = excel.filter((i) => !reemplazadas.has(i.ref)).map((i) => ({ ...i, origen: "excel" as const }));
  const delSistema: CostoPreparacion[] = [];
  for (const r of recetas) {
    const c = costoSistema(r);
    if (c === null) continue; // sin costo no se puede usar en mermas
    const original = r.reemplaza ? porRefExcel.get(r.reemplaza) : undefined;
    delSistema.push({
      ref: refDeReceta(r.id), tipo: r.tipo, nombre: r.nombre,
      categoria: r.categoria ?? original?.categoria ?? (r.tipo === "preparacion" ? "Sub-recetas" : null),
      unidad: unidadDe(r.tipo), costo: c, detalle: r.detalle, origen: "sistema", recetaId: r.id, reemplaza: r.reemplaza,
    });
  }
  return [...deExcel, ...delSistema];
}

export const unidadDe = (tipo: RecetaSistema["tipo"]): UnidadBase => (tipo === "preparacion" ? "kg" : "und");

/** Validación de lo que se guarda (la usa la action; el editor muestra lo mismo). */
export function erroresDeReceta(r: { nombre: string; tipo: string; detalle: DetalleReceta }): string[] {
  const e: string[] = [];
  if (!r.nombre.trim()) e.push("Ponle nombre a la receta.");
  if (r.tipo !== "preparacion" && r.tipo !== "producto") e.push("Elige si es preparación o producto.");
  if (r.detalle.ingredientes.length === 0) e.push("Agrega al menos un ingrediente.");
  for (const i of r.detalle.ingredientes) {
    if (!i.ref) e.push(`"${i.nombre || "Ingrediente"}": elígelo de la lista.`);
    if (!Number.isFinite(i.cantidad) || i.cantidad <= 0) e.push(`"${i.nombre}": la cantidad tiene que ser mayor a 0.`);
    if (!A_BASE[i.unidad]) e.push(`"${i.nombre}": unidad inválida.`);
  }
  if (!(r.detalle.merma >= 0 && r.detalle.merma <= 0.95)) e.push("La merma de preparación va de 0% a 95%.");
  if (r.tipo === "producto" && !((r.detalle.rendimiento ?? 0) > 0)) e.push("Pon cuántas unidades rinde la receta.");
  return e;
}
