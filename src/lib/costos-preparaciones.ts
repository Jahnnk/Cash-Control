/**
 * Costos de preparaciones de Atelier · MOTOR (puro).
 *
 * Pedido de Jahnn (23-sep-2026): "cuando mi administrador de Atelier quiere
 * hacer el reporte de mermas no tiene el costo de las preparaciones… si
 * coloca en mermas 70 cookies XL, que el sistema genere automáticamente el
 * costo en insumos".
 *
 * La fuente es el Excel maestro "Pricing Yayis_v…xlsx" (Dropbox › Grupo ›
 * Finanzas › Costos & Pricing). De ahí salen tres listas:
 *
 *   · PRODUCTOS — hoja PRICING, filas de origen Atelier y Vigente = "Sí".
 *     Columna "Costo insumos Atelier" (G): costo por unidad (o por kg si la
 *     unidad del producto es kg). Es la tabla curada de Jahnn: manda.
 *   · PREPARACIONES — hoja "ATE · Sub-Recetas", fila "Costo por 1 KG" de cada
 *     bloque (frostings, cremas, masas…). Se registran en g o kg.
 *   · INSUMOS — hoja "ATE · Insumos", columna "Costo por Peso (g,ml)": el
 *     costo por gramo / ml / unidad del insumo crudo (sin las secciones de
 *     sub-recetas y panes, que ya están arriba).
 *
 * La lectura del Excel vive en lib/costos-preparaciones-excel.ts (aparte,
 * para no cargar la librería de Excel en el panel de la administradora).
 *
 * Todo el costo se guarda por UNIDAD BASE (und, kg o l); el registro de la
 * merma puede venir en g o ml y se convierte (costoPorUnidadRegistrada).
 */

export type TipoCosto = "producto" | "preparacion" | "insumo";
export type UnidadBase = "und" | "kg" | "l";

export type CostoPreparacion = {
  /** ID del Excel: AT-049 (PRICING), SKU del insumo, o "SUB:<nombre>". */
  ref: string;
  tipo: TipoCosto;
  nombre: string;
  categoria: string | null;
  unidad: UnidadBase;
  /** Costo en insumos por unidad base (S/ por und, por kg o por litro). */
  costo: number;
  /**
   * La receta detrás del costo, cuando se conoce: la del Excel (para abrirla
   * y modificarla) o la creada en el sistema (ver lib/recetas.ts).
   */
  detalle?: DetalleReceta | null;
  /** "sistema" = receta creada o modificada en Grupo → Recetas. */
  origen?: "excel" | "sistema";
  /** Solo recetas del sistema: su id y el ítem del Excel que reemplazan. */
  recetaId?: number;
  reemplaza?: string | null;
};

export type Ingrediente = {
  /** Ítem de la lista (insumo, preparación o producto); null = sin enlazar. */
  ref: string | null;
  nombre: string;
  /** g, kg, ml, l o und. */
  unidad: string;
  cantidad: number;
};

export type DetalleReceta = {
  /**
   * Productos: unidades que salen de la receta. Preparaciones: kg que salen,
   * o null = el peso de la mezcla menos la merma (ver lib/recetas.ts).
   */
  rendimiento: number | null;
  /** Merma de preparación, 0 a 0.95 (0.02 = 2%). */
  merma: number;
  ingredientes: Ingrediente[];
};

export type LecturaPricing = {
  items: CostoPreparacion[];
  /** Lo que se dejó fuera y por qué (para que Jahnn lo vea al subir). */
  avisos: string[];
};

export type ResumenPricing = {
  archivo: string;
  conteos: Record<TipoCosto, number>;
  /** Algunos ítems conocidos para que Jahnn reconozca los números. */
  ejemplos: CostoPreparacion[];
  avisos: string[];
};

const CONOCIDOS = ["Cookie XL", "Empanada de Lomito", "Frosting de Chocolate", "Crema Pastelera (kg)", "Mantequilla sin sal"];

export function resumirPricing(archivo: string, { items, avisos }: LecturaPricing): ResumenPricing {
  const conteos: Record<TipoCosto, number> = { producto: 0, preparacion: 0, insumo: 0 };
  for (const i of items) conteos[i.tipo]++;
  const ejemplos = CONOCIDOS.map((n) => items.find((i) => i.nombre === n)).filter((i): i is CostoPreparacion => !!i);
  return { archivo, conteos, ejemplos, avisos };
}

/* ── Registro de la merma ─────────────────────────────────────────────── */

/** En qué unidades se puede registrar cada unidad base. */
export const UNIDADES_REGISTRO: Record<UnidadBase, string[]> = {
  und: ["und"],
  kg: ["g", "kg"],
  l: ["ml", "l"],
};

const FACTOR: Record<string, number> = { und: 1, kg: 1, g: 0.001, l: 1, ml: 0.001 };

/**
 * Costo por la unidad en que se registra la merma. null si la unidad no es
 * compatible (ej. registrar en "g" algo que se costea por unidad).
 */
export function costoPorUnidadRegistrada(item: Pick<CostoPreparacion, "unidad" | "costo">, unidadRegistro: string): number | null {
  if (!UNIDADES_REGISTRO[item.unidad].includes(unidadRegistro)) return null;
  return item.costo * FACTOR[unidadRegistro];
}

/** Unidad sugerida al elegir un ítem: las preparaciones se pesan en gramos. */
export function unidadSugerida(item: Pick<CostoPreparacion, "unidad">): string {
  return item.unidad === "kg" ? "g" : item.unidad === "l" ? "ml" : "und";
}
