/**
 * Recetas de las cafeterías (Fonavi y Centro) · MOTOR (puro).
 *
 * Pedido de Jahnn (26-nov-2026): «en Recetas y costos veo Recetas Atelier, pero no Recetas Cafeterías; Fonavi y
 * Centro también producen sus propias recetas con los sánguches y bebidas». Las recetas estaban en el Excel de
 * pricing (hojas «CAF · …») pero el sistema solo guardaba el costo total y los nombres de los insumos.
 *
 * Mismo modelo que las recetas de Atelier (lib/recetas.ts), en la misma tabla (recetas_sistema) con business_id
 * CAFETERIAS: las dos cafeterías comparten carta y recetas. Su lista de costos es:
 *   · los insumos que compran las cafeterías (CAF · Insumos, con su precio vigente), por su SKU;
 *   · los productos de Atelier (pan, focaccia…) a su PRECIO INTERNO (lo que la cafetería le paga a Atelier);
 *   · sus sub-recetas (mayonesa, ají de casa, pollo sancochado…).
 * Una receta de producto puede «reemplazar» a un producto de la carta (su ref CF-…): entonces el costo de ese
 * producto en la carta sale de la receta, con los precios de hoy.
 */

import type { CostoPreparacion, DetalleReceta, Ingrediente } from "@/lib/costos-preparaciones";
import type { Bloque } from "@/lib/costos-preparaciones-excel";
import { refDeReceta } from "@/lib/recetas";

/** business_id con que se guardan las recetas de las cafeterías (Fonavi = 2; Centro usa las mismas). */
export const CAFETERIAS = 2;

export type InsumoCafeteria = { sku: string; nombre: string; unidad: "kg" | "l" | "und"; precio: number };
export type ProductoAtelier = { ref: string; nombre: string; interno: number };

export const CATEGORIA_ATELIER = "De Atelier (precio interno)";

/** La lista base de costos de las cafeterías (sin sus recetas). */
export function catalogoBaseCafeteria(insumos: InsumoCafeteria[], atelier: ProductoAtelier[]): CostoPreparacion[] {
  const out: CostoPreparacion[] = [];
  const vistos = new Set<string>();
  for (const i of insumos) {
    const sku = i.sku.trim().toUpperCase();
    if (!(i.precio > 0) || vistos.has(sku)) continue;
    vistos.add(sku);
    out.push({ ref: sku, tipo: "insumo", nombre: i.nombre, categoria: "Insumos de cafetería", unidad: i.unidad, costo: i.precio });
  }
  for (const a of atelier) {
    if (!(a.interno > 0) || vistos.has(a.ref)) continue;
    vistos.add(a.ref);
    out.push({ ref: a.ref, tipo: "producto", nombre: a.nombre, categoria: CATEGORIA_ATELIER, unidad: "und", costo: a.interno });
  }
  return out;
}

/* ── Importar del Excel (una vez) ─────────────────────────────────────────────────────────── */

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/yayi['’]?s/g, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export type PanExcel = { sku: string; nombre: string; /** S/ por unidad de la línea (por g o por und). */ precio: number | null };

export type PlanReceta = {
  /** Id provisional (para enlazar sub-recetas antes de guardar). */
  id: number;
  nombre: string;
  tipo: "producto" | "preparacion";
  categoria: string;
  /** Producto de la carta que costea (CF-…), o null. */
  reemplaza: string | null;
  detalle: DetalleReceta;
  /** Costo del Excel (por und o por kg) para comparar. */
  costoExcel: number | null;
  avisos: string[];
};

export const ID_PROVISIONAL = 900000;

/**
 * Una preparación que el Excel costea con un precio fijo y que no tiene receta en la hoja de sub-recetas de
 * cafetería (Tártara, Sarsa Criolla, Mermelada de Tocino…): entra como insumo de cafetería con el precio del
 * Excel, para que el costo cuadre. Se marca para convertirla en sub-receta después.
 */
export type FijoDelExcel = { clave: string; nombre: string; unidad: "kg" | "l" | "und"; precio: number };
export const REF_FIJO = (clave: string) => `FIJO:${clave}`;

/** Mismo factor (merma del ingrediente) en todas las líneas: se guarda «Q x Receta» y la merma de la receta. */
function mermaComun(b: Bloque): number | null {
  const fs = b.ingredientes.filter((g) => g.q && g.q > 0 && g.cantidad > 0).map((g) => g.cantidad / g.q!);
  if (fs.length === 0 || fs.length !== b.ingredientes.length) return null;
  const f = fs[0];
  if (!(f >= 1 && f < 1.5) || fs.some((x) => Math.abs(x - f) / f > 0.005)) return null;
  return f === 1 ? 0 : Math.round((1 - 1 / f) * 10000) / 10000;
}

export function planImportacion(p: {
  subrecetas: Bloque[];
  productos: Bloque[];
  srNombre: Map<string, string>;
  panes: PanExcel[];
  /** PN### → ref del producto de Atelier. */
  panAtelier: Record<string, string>;
  atelierInterno: Map<string, number>;
  /** Insumos de cafetería con precio (por SKU): su unidad y precio por kg, litro o unidad. */
  insumos: Map<string, { unidad: "kg" | "l" | "und"; precio: number }>;
  carta: { ref: string; nombre: string; nombreCarta: string | null }[];
  /** Productos de Atelier por nombre (Empanada de Lomito en el Desayuno Rústico). */
  atelier?: { ref: string; nombre: string }[];
}): { recetas: PlanReceta[]; fijos: FijoDelExcel[] } {
  const subs = p.subrecetas.filter((b) => !b.archivado && b.ingredientes.length > 0);
  const prods = p.productos.filter((b) => !b.archivado && b.ingredientes.length > 0);
  const idSub = new Map(subs.map((b, k) => [b, ID_PROVISIONAL + k]));
  // El código SR del Excel no es confiable (SR030 es el Tostón en una hoja y el Cake de Zanahoria en otra):
  // primero el nombre de la línea, después el nombre del código.
  const subDe = (nombre: string, sku: string): Bloque | null => porNombre(norm(nombre)) ?? (p.srNombre.get(sku) ? porNombre(norm(p.srNombre.get(sku)!)) : null);
  const porNombre = (k: string): Bloque | null => {
    if (!k) return null;
    const c = subs.filter((b) => norm(b.nombre) === k);
    if (c.length === 1) return c[0];
    const c2 = subs.filter((b) => k.startsWith(norm(b.nombre)) || norm(b.nombre).startsWith(k));
    return c2.length === 1 ? c2[0] : null;
  };
  const pan = new Map(p.panes.map((x) => [x.sku, x]));
  const fijos = new Map<string, FijoDelExcel>();
  const fijo = (g: Bloque["ingredientes"][number], unidad: string, cant: number): Ingrediente | null => {
    // Precio del Excel: «Costo Total de Receta» de la línea ÷ su «Q x Receta» (sin merma).
    if (!g.total || !g.q || !(g.total > 0)) return null;
    const porUnidad = g.total / g.q;
    const u = unidad === "g" || unidad === "kg" ? "kg" : unidad === "ml" || unidad === "l" ? "l" : "und";
    const f = unidad === "g" || unidad === "ml" ? 1000 : 1;
    const clave = norm(g.nombre).replace(/ /g, "-");
    if (!fijos.has(clave)) fijos.set(clave, { clave, nombre: `${g.nombre} (precio del Excel)`, unidad: u, precio: Math.round(porUnidad * f * 10000) / 10000 });
    return { ref: REF_FIJO(clave), nombre: g.nombre, unidad, cantidad: cant };
  };
  const atelierPorNombre = (nombre: string) => {
    const c = (p.atelier ?? []).filter((a) => norm(a.nombre) === norm(nombre));
    return c.length === 1 ? c[0].ref : null;
  };

  const plan = (b: Bloque, id: number, tipo: PlanReceta["tipo"], categoria: string, reemplaza: string | null, costoExcel: number | null, esSub: boolean): PlanReceta => {
    const avisos: string[] = [];
    // Las sub-recetas van con su «Q x Receta» y su merma; los productos, igual si todas sus líneas llevan la misma.
    const merma = esSub ? null : mermaComun(b);
    const conQ = esSub || merma !== null;
    const ingredientes: Ingrediente[] = b.ingredientes.map((g) => {
      const cant = conQ && g.q ? g.q : g.cantidad;
      const unidad = g.unidad === "cm3" ? "ml" : g.unidad;
      if (/^SR/.test(g.sku)) {
        const s = subDe(g.nombre, g.sku);
        if (s && s !== b) {
          // El Excel a veces pone «1 und» de una sub-receta que se costea por kg (Parfait): se pasa a gramos con su costo.
          if (unidad === "und" && s.kg && g.total && g.total > 0) return { ref: refDeReceta(idSub.get(s)!), nombre: s.nombre, unidad: "g", cantidad: Math.round((g.total / s.kg) * 1000 * 100) / 100 };
          return { ref: refDeReceta(idSub.get(s)!), nombre: s.nombre, unidad, cantidad: cant };
        }
        const at = unidad === "und" ? atelierPorNombre(g.nombre) : null;
        if (at) return { ref: at, nombre: g.nombre, unidad: "und", cantidad: cant };
        const fx = fijo(g, unidad, cant);
        if (fx) { avisos.push(`«${g.nombre}» va con el precio del Excel: falta su sub-receta.`); return fx; }
        avisos.push(`Falta la sub-receta «${g.nombre}».`);
        return { ref: null, nombre: g.nombre, unidad, cantidad: cant };
      }
      if (/^PN/.test(g.sku)) {
        const at = p.panAtelier[g.sku];
        const interno = at ? p.atelierInterno.get(at) : undefined;
        const precio = pan.get(g.sku)?.precio ?? null;
        if (!at || !interno || !precio) {
          const fx = fijo(g, unidad, cant);
          avisos.push(fx ? `«${g.nombre}» va con el precio del Excel: no sé qué producto de Atelier es.` : `«${g.nombre}»: no sé qué producto de Atelier es.`);
          return fx ?? { ref: null, nombre: g.nombre, unidad, cantidad: cant };
        }
        // Cuánto del producto de Atelier es esta línea, a lo que lo costeaba el Excel (porción = ¼ de focaccia…).
        return { ref: at, nombre: g.nombre, unidad: "und", cantidad: Math.round(cant * (precio / interno) * 10000) / 10000 };
      }
      const insumo = p.insumos.get(g.sku);
      // «1 und» de un insumo que se compra por kg (la piña): se pasa a gramos con el costo del Excel.
      if (insumo && unidad === "und" && insumo.unidad !== "und" && g.total && g.total > 0 && insumo.precio > 0) {
        return { ref: g.sku, nombre: g.nombre, unidad: insumo.unidad === "l" ? "ml" : "g", cantidad: Math.round((g.total / insumo.precio) * 1000 * 100) / 100 };
      }
      if (!insumo) {
        const fx = fijo(g, unidad, cant);
        avisos.push(fx ? `«${g.nombre}» (${g.sku}) va con el precio del Excel.` : `«${g.nombre}» (${g.sku}) no tiene precio de cafetería.`);
        return fx ?? { ref: null, nombre: g.nombre, unidad, cantidad: cant };
      }
      return { ref: g.sku, nombre: g.nombre, unidad, cantidad: cant };
    });
    return {
      id, nombre: b.nombre, tipo, categoria, reemplaza, costoExcel, avisos,
      detalle: { rendimiento: tipo === "producto" ? b.rendimiento || 1 : null, merma: esSub ? b.merma || 0 : merma ?? 0, ingredientes },
    };
  };

  const out: PlanReceta[] = subs.map((b) => plan(b, idSub.get(b)!, b.kg ? "preparacion" : "producto", "Sub-recetas", null, b.kg ?? b.costoUnidad, true));
  const usados = new Set<string>();
  prods.forEach((b, k) => {
    const n = norm(b.nombre);
    const c = p.carta.filter((x) => !usados.has(x.ref) && (norm(x.nombre) === n || norm(x.nombreCarta ?? "") === n));
    const ref = c.length === 1 ? c[0].ref : null;
    if (ref) usados.add(ref);
    out.push(plan(b, ID_PROVISIONAL + subs.length + k, "producto", b.hoja.replace(/^CAF · /, ""), ref, b.costoUnidad, false));
  });
  return { recetas: out, fijos: [...fijos.values()] };
}

/** Cambia los ids provisionales por los reales en las líneas que usan sub-recetas. */
export function conIdsReales(d: DetalleReceta, reales: Map<number, number>): DetalleReceta {
  return {
    ...d,
    ingredientes: d.ingredientes.map((i) => {
      const m = i.ref?.match(/^REC:(\d+)$/);
      const real = m ? reales.get(Number(m[1])) : undefined;
      return real ? { ...i, ref: refDeReceta(real) } : i;
    }),
  };
}
