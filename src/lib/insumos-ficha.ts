/**
 * La pantalla Grupo → Insumos · MOTOR (puro). Fase 1, pedido de Jahnn, 24-nov-2026: «una base sólida para
 * todas nuestras recetas son los insumos… categorizarlo, insumos que ya no se utilizan, que han cambiado de
 * precio, insumos críticos como las harinas, la mantequilla».
 *
 *   CATEGORÍA  la que eligió Jahnn (tabla insumos_ficha) o, si no eligió, la del Excel por el prefijo del SKU
 *              (FR = Frutas y Verduras, LC = Lácteos y Cremas…). Los creados en el sistema: «Sin categoría».
 *   CRÍTICO    el sistema propone los que juntos hacen el 80% del gasto en insumos (Pareto); Jahnn puede poner
 *              o quitar la estrella a mano (la harina pesa poco en soles, pero sin ella no hay pan).
 *   PRECIO     verde hasta 30 días, ámbar hasta 60, rojo después. «Precio viejo» = crítico con más de 30 días.
 *   SUBIÓ      el último cambio de precio fue hacia arriba.
 */

export const DIAS_PRECIO_VIEJO = 30;
export const DIAS_PRECIO_MUY_VIEJO = 60;
export const PARETO = 0.8;

export const SIN_CATEGORIA = "Sin categoría";

/** Las categorías del Excel de pricing, por el prefijo de su SKU. */
export const CATEGORIA_POR_PREFIJO: Record<string, string> = {
  AC: "Aceites y Grasas",
  AZ: "Azúcares y Endulzantes",
  BV: "Bebidas",
  CA: "Carnes y Embutidos",
  CC: "Chocolates y Cacaos",
  CF: "Café e Infusiones",
  ES: "Especias y Condimentos",
  FR: "Frutas y Verduras",
  FT: "Frutos Secos y Semillas",
  HR: "Harinas y Cereales",
  HV: "Huevos",
  LC: "Lácteos y Cremas",
  LM: "Limpieza e Higiene",
  OT: "Otros Insumos",
  PK: "Packaging",
  QS: "Quesos",
  SL: "Salsas, Aderezos y Vinagres",
  VA: "Preparados comprados",
};

export const CATEGORIAS: string[] = [...Object.values(CATEGORIA_POR_PREFIJO)].sort((a, b) => a.localeCompare(b, "es"));

/** La categoría del Excel según el SKU; los insumos creados en el sistema (SIS-…) no tienen. */
export function categoriaDelSku(sku: string): string {
  const s = sku.trim().toUpperCase();
  if (s.startsWith("SIS-")) return SIN_CATEGORIA;
  return CATEGORIA_POR_PREFIJO[s.slice(0, 2)] ?? SIN_CATEGORIA;
}

/** Las claves de los insumos que juntos hacen el 80% del gasto (el que cruza el 80% también entra). */
export function criticosPorGasto(gasto: Map<string, number>, corte = PARETO): Set<string> {
  const lista = [...gasto.entries()].filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]);
  const total = lista.reduce((t, [, g]) => t + g, 0);
  const out = new Set<string>();
  if (total <= 0) return out;
  let acum = 0;
  for (const [k, g] of lista) {
    if (acum / total >= corte) break;
    out.add(k);
    acum += g;
  }
  return out;
}

/** Crítico de verdad: lo puesto a mano manda; si no, lo que propone el sistema. */
export const esCritico = (manual: boolean | null, sugerido: boolean) => (manual ?? sugerido);

/** Días entre dos fechas YYYY-MM-DD. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T12:00:00Z`);
  const b = Date.parse(`${hasta}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86_400_000)) : 0;
}

export type TonoEdad = "reciente" | "medio" | "viejo";

export function tonoEdad(dias: number): TonoEdad {
  return dias > DIAS_PRECIO_MUY_VIEJO ? "viejo" : dias > DIAS_PRECIO_VIEJO ? "medio" : "reciente";
}

export type PuntoPrecio = { fecha: string; precio: number };
export type CambioPrecio = { anterior: number; pct: number; fecha: string };

/** El último cambio de precio (contra el precio distinto anterior); null si nunca cambió. */
export function ultimoCambio(historial: PuntoPrecio[]): CambioPrecio | null {
  const h = [...historial].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (let i = h.length - 1; i > 0; i--) {
    if (Math.abs(h[i].precio - h[i - 1].precio) > 1e-6) {
      const pct = h[i - 1].precio > 0 ? Math.round((h[i].precio / h[i - 1].precio - 1) * 1000) / 10 : 0;
      return { anterior: h[i - 1].precio, pct, fecha: h[i].fecha };
    }
  }
  return null;
}

/**
 * El historial de un insumo: un precio por día (si el mismo día hay Excel y sistema, manda el sistema, que es
 * una corrección hecha después de subir el Excel), en orden.
 */
export function historialPorDia(filas: { fecha: string; precio: number; sistema: boolean }[]): PuntoPrecio[] {
  const porDia = new Map<string, { precio: number; sistema: boolean }>();
  for (const f of filas) {
    if (!(f.precio > 0)) continue;
    const prev = porDia.get(f.fecha);
    if (!prev || (f.sistema && !prev.sistema)) porDia.set(f.fecha, { precio: f.precio, sistema: f.sistema });
  }
  return [...porDia.entries()].map(([fecha, v]) => ({ fecha, precio: v.precio })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Los últimos `n` meses cerrados antes de `hoy` (YYYY-MM-DD), del más viejo al más nuevo. */
export function mesesCerrados(hoy: string, n = 3): string[] {
  let [y, m] = hoy.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

// ─── Presentación de compra (24-nov-2026) ───────────────────────────────────────────────────────────────────
//
// El precio se guarda por la unidad de receta (kg, l o und) porque las recetas piden gramos. La presentación dice
// cómo se compra: «lata de 393 g». FACTOR = cuánto de la unidad de receta trae una presentación (0.393 kg).
//   precio por presentación = precio × factor        (S/ 13.74 el kg → S/ 5.40 la lata)
//   cantidad en receta      = presentaciones × factor (12 latas → 4.716 kg)

export type UnidadPresentacion = "g" | "kg" | "ml" | "l" | "und";
export type Presentacion = { nombre: string; cantidad: number; unidad: UnidadPresentacion };

/** Las unidades en que se puede decir cuánto trae, según la unidad de receta del insumo. */
export function unidadesPresentacion(base: string): UnidadPresentacion[] {
  return base === "kg" ? ["g", "kg"] : base === "l" ? ["ml", "l"] : base === "und" ? ["und"] : [];
}

/** Cuánto de la unidad de receta trae una presentación; null si no calza (ej. ml en un insumo por kg). */
export function factorPresentacion(base: string, p: Pick<Presentacion, "cantidad" | "unidad"> | null): number | null {
  if (!p || !(p.cantidad > 0) || !unidadesPresentacion(base).includes(p.unidad)) return null;
  return p.unidad === "g" || p.unidad === "ml" ? p.cantidad / 1000 : p.cantidad;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function precioPorPresentacion(precioBase: number, factor: number): number {
  return Math.round(precioBase * factor * 100) / 100;
}

/** El precio por unidad de receta a partir del precio de una presentación. */
export function precioBaseDesdePresentacion(precioPresentacion: number, factor: number): number {
  return factor > 0 ? r4(precioPresentacion / factor) : 0;
}

const NUM = (n: number, max = 3) => n.toLocaleString("es-PE", { maximumFractionDigits: max });

/** «lata de 393 g», «paquete de 100 und». */
export function textoPresentacion(p: Presentacion): string {
  return `${p.nombre} de ${NUM(p.cantidad)} ${p.unidad}`;
}

/** Plural simple en español: lata → latas, bolsa → bolsas, galonera → galoneras, saco → sacos, unidad → unidades. */
export function plural(nombre: string, n: number): string {
  if (n === 1) return nombre;
  const s = nombre.trim();
  if (/[aeiouáéó]$/i.test(s)) return `${s}s`;
  if (/z$/i.test(s)) return `${s.slice(0, -1)}ces`;
  return `${s}es`;
}

/** «12 latas = 4.716 kg» (con la unidad de receta; g y ml si es menos de 1). */
export function equivalencia(n: number, p: Presentacion, base: string): string | null {
  const f = factorPresentacion(base, p);
  if (f == null || !(n > 0)) return null;
  const total = n * f;
  const enChico = (base === "kg" || base === "l") && total < 1;
  const cantidad = enChico ? `${NUM(total * 1000)} ${base === "kg" ? "g" : "ml"}` : `${NUM(total)} ${base}`;
  return `${NUM(n)} ${plural(p.nombre, n)} = ${cantidad}`;
}

// ─── El mismo insumo en las dos listas (24-nov-2026) ────────────────────────────────────────────────────────
//
// Atelier y las cafeterías compran muchas cosas iguales (191 con el mismo nombre). Cada lado tiene su precio,
// pero categoría, crítico, nombre y presentación son del insumo: se comparten. Se emparejan por el NOMBRE del
// Excel (el código no sirve: hay códigos iguales para insumos distintos). Si un nombre se repite dentro de un
// mismo lado, no se empareja (no se sabe cuál es).

export const normalizarNombre = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** «origen|SKU» → «origen|SKU» del mismo insumo en la otra lista. */
export function parejasEntreListas(items: { origen: string; sku: string; nombre: string }[]): Map<string, string> {
  const clave = (o: string, s: string) => `${o}|${s.trim().toUpperCase()}`;
  const porLado = new Map<string, Map<string, string | null>>();
  for (const i of items) {
    const lado = porLado.get(i.origen) ?? new Map<string, string | null>();
    const n = normalizarNombre(i.nombre);
    if (!n) continue;
    lado.set(n, lado.has(n) ? null : clave(i.origen, i.sku));
    porLado.set(i.origen, lado);
  }
  const a = porLado.get("Atelier") ?? new Map();
  const c = porLado.get("Cafetería") ?? new Map();
  const out = new Map<string, string>();
  for (const [n, ka] of a) {
    const kc = c.get(n);
    if (ka && kc) { out.set(ka, kc); out.set(kc, ka); }
  }
  return out;
}
