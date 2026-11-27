/**
 * Recetario de cocina desde las recetas del sistema (fase 3 del recetario exportable, 27-nov-2026). Arma, para una
 * sección de la carta de las cafeterías (Bebidas, Sánguches, Desayunos…), la ficha de cada producto: sus preparaciones
 * base (las sub-recetas que usa, en el orden en que aparecen), el armado con la medida de cocina, los pasos, las
 * recomendaciones y la vida útil. Lógica pura: el Word lo escribe lib/recetario-word.ts.
 */

import type { DetalleReceta } from "@/lib/costos-preparaciones";
import type { RecetaSistema } from "@/lib/recetas";

const idDeRef = (ref: string): number | null => { const m = /^REC:(\d+)$/.exec(ref.trim()); return m ? Number(m[1]) : null; };

export type LineaFicha = { nombre: string; cantidad: string; unidad: string };
export type BaseFicha = { nombre: string; lineas: LineaFicha[]; pasos: string[]; recomendaciones: string | null; vidaUtil: string | null };
export type FichaProducto = BaseFicha & { numero: string; bases: BaseFicha[] };
export type Recetario = { seccion: string; productos: FichaProducto[]; faltanPasos: string[] };

const UNIDAD_COCINA: Record<string, string> = { g: "gr", kg: "kg", ml: "ml", l: "lt", und: "und" };

/** «153.061 g» → «153 gr»; «0.25 und» → «¼ und». La medida de cocina, si la hay, manda. */
export function lineaDe(i: DetalleReceta["ingredientes"][number]): LineaFicha | null {
  if (!(i.cantidad > 0)) return null; // lo que «se quita» no va en la ficha
  if (i.cocina?.trim()) return { nombre: i.nombre, cantidad: i.cocina.trim(), unidad: "" };
  const fracciones: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
  const n = i.cantidad;
  const texto = fracciones[String(Math.round(n * 100) / 100)]
    ?? (n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10)).replace(".", ",");
  return { nombre: i.nombre, cantidad: texto, unidad: UNIDAD_COCINA[i.unidad] ?? i.unidad };
}

function fichaDe(r: RecetaSistema): BaseFicha {
  const f = r.detalle.ficha;
  return {
    nombre: r.nombre,
    lineas: r.detalle.ingredientes.map(lineaDe).filter((l): l is LineaFicha => !!l),
    pasos: f?.pasos ?? [],
    recomendaciones: f?.recomendaciones ?? null,
    vidaUtil: f?.vidaUtil ?? null,
  };
}

/** Las sub-recetas que usa una receta (también las de sus sub-recetas), sin repetir, en orden de aparición. */
export function basesDe(r: RecetaSistema, porId: Map<number, RecetaSistema>): RecetaSistema[] {
  const out: RecetaSistema[] = [];
  const vistos = new Set<number>([r.id]);
  const recorrer = (x: RecetaSistema) => {
    for (const ing of x.detalle.ingredientes) {
      const id = ing.ref ? idDeRef(ing.ref) : null;
      const sub = id !== null ? porId.get(id) : undefined;
      if (!sub || vistos.has(sub.id)) continue;
      vistos.add(sub.id);
      recorrer(sub); // primero lo que la base necesita
      out.push(sub);
    }
  };
  recorrer(r);
  return out;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Las fichas de una sección: productos de esa categoría, no archivados, por nombre. */
export function armarRecetario(seccion: string, recetas: RecetaSistema[], archivadas: Set<string>): Recetario {
  const porId = new Map(recetas.map((r) => [r.id, r]));
  const productos = recetas
    .filter((r) => r.tipo === "producto" && sinTildes(r.categoria ?? "") === sinTildes(seccion) && !archivadas.has(`REC:${r.id}`))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const fichas = productos.map((r, k) => ({
    ...fichaDe(r),
    numero: String(k + 1).padStart(2, "0"),
    bases: basesDe(r, porId).map(fichaDe),
  }));
  const faltanPasos = fichas.filter((f) => f.pasos.length === 0).map((f) => f.nombre);
  return { seccion, productos: fichas, faltanPasos };
}
