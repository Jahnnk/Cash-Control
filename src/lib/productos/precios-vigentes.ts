/**
 * Precios de insumos editados en el sistema · MOTOR (puro).
 *
 * Fase 1 de «la carta vive en el sistema» (pedido de Jahnn, 18-nov-2026): «si algún precio de insumo
 * cambia mucho… ¿tengo que hacerlo en el Excel y subirlo nuevamente? No sería muy práctico».
 *
 * El precio de compra de un insumo se cambia en Grupo → Recetas y costos → Precios de insumos. Cada cambio
 * es una fila más de insumos_precios (archivo = «Sistema»), así que también entra al historial.
 *
 *   BASE      el precio de la última subida del Excel: con ese precio están calculados los costos guardados.
 *   VIGENTE   el precio más reciente (del Excel o del sistema).
 *   FACTOR    vigente ÷ base. Cada costo se ajusta por lo que pesa ese insumo en él:
 *               · Atelier: insumos × factor; preparaciones y productos del Excel suman la diferencia de su
 *                 receta (con sus mismos gramos); las recetas del sistema se recalculan solas encima.
 *               · Carta de las cafeterías: el desglose por insumo × factor (lo de la cafetería con los
 *                 precios de la cafetería; lo de Atelier ya sube por la lista de Atelier).
 * Si después se sube un Excel nuevo, ese pasa a ser la base y los cambios anteriores quedan solo en el historial.
 */

import type { CostoPreparacion } from "@/lib/costos-preparaciones";
import { costoDeReceta } from "@/lib/recetas";
import type { AporteInsumo } from "./desglose-insumos";
import type { FotoPrecio, PrecioInsumo } from "./insumos-precios";

export const ARCHIVO_SISTEMA = "Sistema";

export type FotoConArchivo = FotoPrecio & { archivo: string | null };

export type PrecioVigente = PrecioInsumo & {
  /** Precio de la última subida del Excel (null = el insumo no estaba en el Excel). */
  base: number | null;
  fechaBase: string | null;
  /** Desde cuándo vale el precio vigente y quién lo puso. */
  fecha: string;
  delSistema: boolean;
  /** Cambio contra el Excel, en %. 0 si no cambió. */
  cambioPct: number;
};

const clave = (origen: string, sku: string) => `${origen}|${sku.trim().toUpperCase()}`;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** El precio vigente de cada insumo, con su base del Excel. */
export function preciosVigentes(fotos: FotoConArchivo[]): PrecioVigente[] {
  const grupos = new Map<string, FotoConArchivo[]>();
  for (const f of fotos) {
    if (!f?.sku || !(f.precio > 0)) continue;
    const k = clave(f.origen, f.sku);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const out: PrecioVigente[] = [];
  for (const lista of grupos.values()) {
    // Mismo día: manda la foto del sistema (es una corrección hecha después de subir el Excel).
    const orden = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.archivo === ARCHIVO_SISTEMA) - Number(b.archivo === ARCHIVO_SISTEMA));
    const v = orden[orden.length - 1];
    const excel = orden.filter((f) => f.archivo !== ARCHIVO_SISTEMA);
    const b = excel[excel.length - 1] ?? null;
    const base = b && b.unidad === v.unidad ? b.precio : null;
    out.push({
      origen: v.origen, sku: v.sku, nombre: v.nombre, unidad: v.unidad, precio: v.precio,
      base, fechaBase: b?.fecha ?? null, fecha: v.fecha, delSistema: v.archivo === ARCHIVO_SISTEMA,
      cambioPct: base ? r1((v.precio / base - 1) * 100) : 0,
    });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type Factores = {
  /** Factor de un insumo para un origen. 1 si no cambió o no se conoce. */
  de: (origen: PrecioInsumo["origen"], sku: string | null) => number;
  /** Hay al menos un cambio hecho en el sistema que mueve costos. */
  hayCambios: boolean;
};

export function factoresDe(vigentes: PrecioVigente[]): Factores {
  const m = new Map<string, number>();
  for (const v of vigentes) if (v.base && v.base > 0 && v.precio !== v.base) m.set(clave(v.origen, v.sku), v.precio / v.base);
  return {
    de: (origen, sku) => (sku?.trim() ? m.get(clave(origen, sku.split("·")[0])) ?? 1 : 1),
    hayCambios: m.size > 0,
  };
}

/** La lista de costos de Atelier del Excel con los precios vigentes. Sin cambios, la misma lista. */
export function ajustarCatalogo(excel: CostoPreparacion[], f: Factores): CostoPreparacion[] {
  if (!f.hayCambios) return excel;
  const antes = new Map(excel.map((i) => [i.ref, i]));
  const ahora = new Map<string, CostoPreparacion>();
  for (const i of excel) ahora.set(i.ref, i.tipo === "insumo" ? { ...i, costo: i.costo * f.de("Atelier", i.ref) } : i);
  const ajustar = (i: CostoPreparacion) => {
    if (!i.detalle) return;
    const tipo = i.tipo === "preparacion" ? "preparacion" : "producto";
    const viejo = costoDeReceta(tipo, i.detalle, (ref) => antes.get(ref) ?? null).costo;
    const nuevo = costoDeReceta(tipo, i.detalle, (ref) => ahora.get(ref) ?? null).costo;
    if (viejo === null || nuevo === null || Math.abs(nuevo - viejo) < 1e-9) return;
    ahora.set(i.ref, { ...i, costo: Math.max(0, i.costo + (nuevo - viejo)) });
  };
  // Las preparaciones pueden llevar otras preparaciones: tres vueltas alcanzan.
  for (let v = 0; v < 3; v++) for (const i of excel) if (i.tipo === "preparacion") ajustar(i);
  for (const i of excel) if (i.tipo === "producto") ajustar(i);
  return excel.map((i) => ahora.get(i.ref) ?? i);
}

/** El desglose de un producto de carta con los precios vigentes y cuánto subió (o bajó) en soles. */
export function ajustarDesglose(desglose: AporteInsumo[], origen: PrecioInsumo["origen"], f: Factores): { desglose: AporteInsumo[]; delta: number } {
  if (!f.hayCambios) return { desglose, delta: 0 };
  let delta = 0;
  const nuevo = desglose.map((a) => {
    const k = f.de(origen, a.sku);
    if (k === 1) return a;
    const costo = a.costo * k;
    delta += costo - a.costo;
    return { ...a, costo: Math.round(costo * 10000) / 10000 };
  });
  return { desglose: nuevo, delta };
}
