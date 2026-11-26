/**
 * El precio B2B REAL de cada receta de Atelier, desde Byte · MOTOR (puro).
 *
 * Fase 4 de «unificar pricing e ingeniería de menú» (26-nov-2026). El precio B2B se cobra en Byte: los productos
 * de Atelier con prefijo «P-» son la venta a otros B2B (los «Y-», a las cafeterías; ver la memoria de prefijos).
 * Byte es el dueño de ese precio: el sistema lo LEE (venta ÷ unidades del último mes en que se vendió) y no lo
 * cambia. El precio guardado en precios_b2b queda para lo que todavía no se vende en Byte (una receta nueva).
 *
 * Enlace del nombre de Byte con la receta, sin vínculos a mano (por ahora):
 *   1. Mismas palabras (sin tildes, sin «de/con/la», «750 g» = «750G» = «750», «1 kg» = «1000»).
 *   2. Todas las palabras de Byte están en UNA sola receta («P-CIABATTA» → «Pan Ciabatta (bolsa de 4 und)»).
 *   3. Todas las palabras de UNA sola receta (todavía sin enlazar) están en el nombre de Byte.
 * Si quedan dos o más recetas posibles, no se enlaza: mejor sin precio que con el de otro producto.
 */

export type VentaB2B = { mes: string; nombre: string; unidades: number; venta: number };
export type RecetaB2B = { ref: string; nombre: string };

export type PrecioB2BByte = {
  /** Venta ÷ unidades del último mes en que se vendió. */
  precio: number;
  mes: string;
  /** Nombre en Byte (sin «[ELIMINADO]»). */
  nombreByte: string;
  /** Unidades de todos los meses leídos. */
  unidades: number;
  /** El precio del mes anterior con venta, si era distinto. */
  anterior: number | null;
};

const VACIAS = new Set(["de", "del", "con", "la", "el", "los", "las", "y", "a", "al", "en", "para"]);

/** Quita «[ELIMINADO]» y espacios de más. */
export const limpiarNombreByte = (s: string) => s.replace(/^\s*\[[^\]]*\]\s*/, "").replace(/\s+/g, " ").trim();

/** ¿Es un producto B2B de Atelier en Byte («P-» o «P -»)? */
export const esB2BDeByte = (s: string) => /^p\s*-/i.test(limpiarNombreByte(s));

/** Las palabras que cuentan de un nombre: sin prefijo P-/Y-, sin tildes, pesos en gramos. */
export function palabras(nombre: string): Set<string> {
  const s = limpiarNombreByte(nombre)
    .replace(/^[py]\s*-\s*/i, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|grs|gramos)\b/g, (_, n: string, u: string) => {
      const v = Number(n.replace(",", "."));
      return ` ${u.startsWith("k") ? Math.round(v * 1000) : Math.round(v)} `;
    })
    .replace(/[^a-z0-9]+/g, " ");
  return new Set(s.split(" ").filter((w) => w && !VACIAS.has(w)));
}

const contiene = (a: Set<string>, b: Set<string>) => [...b].every((w) => a.has(w));
const iguales = (a: Set<string>, b: Set<string>) => a.size === b.size && contiene(a, b);

/** Nombre de Byte → ref de la receta (solo los enlaces sin duda). */
export function enlazarB2B(nombres: string[], recetas: RecetaB2B[]): Map<string, string> {
  const rs = recetas.map((r) => ({ ref: r.ref, p: palabras(r.nombre) })).filter((r) => r.p.size > 0);
  const out = new Map<string, string>();
  const pendientes: { nombre: string; p: Set<string> }[] = [];
  for (const nombre of nombres) {
    const p = palabras(nombre);
    if (p.size === 0) continue;
    const exactas = rs.filter((r) => iguales(r.p, p));
    if (exactas.length === 1) { out.set(nombre, exactas[0].ref); continue; }
    if (exactas.length > 1) continue;
    const amplias = rs.filter((r) => contiene(r.p, p));
    if (amplias.length === 1) { out.set(nombre, amplias[0].ref); continue; }
    if (amplias.length > 1) continue;
    pendientes.push({ nombre, p });
  }
  // Paso 3: la receta cabe entera en el nombre de Byte, entre las recetas que nadie tomó todavía.
  const tomadas = new Set(out.values());
  for (const { nombre, p } of pendientes) {
    const cortas = rs.filter((r) => !tomadas.has(r.ref) && contiene(p, r.p));
    if (cortas.length === 1) out.set(nombre, cortas[0].ref);
  }
  return out;
}

/**
 * El precio B2B de Byte por receta. Si dos nombres de Byte caen en la misma receta, gana el que más se vendió.
 */
export function preciosB2BDeByte(ventas: VentaB2B[], recetas: RecetaB2B[]): Map<string, PrecioB2BByte> {
  const porNombre = new Map<string, VentaB2B[]>();
  for (const v of ventas) {
    if (!esB2BDeByte(v.nombre) || !(v.unidades > 0) || !(v.venta > 0)) continue;
    const n = limpiarNombreByte(v.nombre).toUpperCase();
    porNombre.set(n, [...(porNombre.get(n) ?? []), v]);
  }
  const enlaces = enlazarB2B([...porNombre.keys()], recetas);
  const out = new Map<string, PrecioB2BByte>();
  for (const [nombre, filas] of porNombre) {
    const ref = enlaces.get(nombre);
    if (!ref) continue;
    // Por mes (un mes puede traer el mismo nombre dos veces: con y sin «[ELIMINADO]»).
    const meses = new Map<string, { u: number; v: number }>();
    for (const f of filas) { const m = meses.get(f.mes) ?? { u: 0, v: 0 }; m.u += f.unidades; m.v += f.venta; meses.set(f.mes, m); }
    const orden = [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const [mes, ult] = orden[0];
    const precio = Math.round((ult.v / ult.u) * 100) / 100;
    const prev = orden[1] ? Math.round((orden[1][1].v / orden[1][1].u) * 100) / 100 : null;
    const unidades = orden.reduce((t, [, m]) => t + m.u, 0);
    const actual = out.get(ref);
    if (actual && actual.unidades >= unidades) continue;
    out.set(ref, { precio, mes, nombreByte: nombre, unidades, anterior: prev !== null && Math.abs(prev - precio) >= 0.01 ? prev : null });
  }
  return out;
}
