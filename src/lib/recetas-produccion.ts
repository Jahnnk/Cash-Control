/**
 * Recetas de Producción con los precios de Cash Control (Etapa 3c parte 1, 24-nov-2026).
 *
 * Producción es la dueña de los ingredientes de las recetas de Atelier (lo que Luis pesa y hornea); Cash
 * Control pone los precios de los insumos. Aquí se calcula el costo de cada receta de Producción con esos
 * precios y se pone al lado del costo del Excel de pricing, para ver qué recetas difieren antes de cambiar de
 * dueño (parte 3). SOLO MIRA: no cambia ningún costo.
 *
 * Cómo calcula Producción los gramos (src/lib/calculos.ts y plan-compras.ts de yayis-produccion):
 *   · modo «panadero»: gramos = (masa ÷ pesoBase) × harinaBase × (% ÷ 100), por formato (masa = peso del formato);
 *   · modo «directo»:  gramos fijos por unidad producida.
 *   · merma (receta_ajustes): se amasa (1 + merma %) de más; el costo por unidad la incluye.
 *   · Un insumo puede ser una preparación propia (subrecetaId): su costo sale de la sub-receta.
 * Cantidades internas: peso en g, volumen en ml (1 ml = 1 g), unidades contadas.
 */

import type { CostoPreparacion } from "@/lib/costos-preparaciones";

export type RecetaProd = {
  id: number; nombre: string; linea: "panaderia" | "pasteleria" | "empanadas" | "sub_recetas";
  modo: "panadero" | "directo"; activa: boolean; pesoBase: number; harinaBase: number; mermaPct: number;
};
export type FormatoProd = { id: number; recetaId: number; nombre: string; pesoMasa: number; activo: boolean };
export type IngredienteProd = { recetaId: number; insumoId: number; porcentaje: number; gramosUnidad: number | null; orden: number };
export type InsumoProd = {
  id: number; nombre: string; activo: boolean; base: "peso" | "volumen" | "unidad"; subrecetaId: number | null;
  /** Desde el 24-nov-2026 la puerta de Producción también manda la categoría y en cuántas recetas va. */
  categoria?: string | null; usos?: number;
};
export type DatosProduccion = { recetas: RecetaProd[]; formatos: FormatoProd[]; ingredientes: IngredienteProd[]; insumos: InsumoProd[] };

export type Pareja = { ref: string; nombre: string; unidad: string; costo: number; exacta: boolean; guardada?: boolean; factor?: number };

/**
 * Pareja guardada (parte 2, tabla recetas_produccion_parejas). refCC null = «sin pareja» a propósito.
 * insumo: factor = unidades de Cash Control por 1 unidad interna de Producción (g → kg = 0.001).
 * receta: factor = unidades de Producción por 1 unidad del Excel (1 bandeja = 4 cuartos → 0.25).
 */
export type ParejaGuardada = { tipo: "insumo" | "receta"; prodClave: string; refCC: string | null; factor: number };

/** El factor que se propone para un insumo según cómo lo mide cada app. */
export function factorInsumoPorDefecto(unidadCC: string): number {
  return unidadCC === "und" ? 1 : 0.001;
}

export type FilaComparacion = {
  clave: string;
  recetaId: number;
  receta: string;
  /** Formato (solo panadería): «Normal», «Tipo Molde»… */
  formato: string | null;
  linea: RecetaProd["linea"];
  /** Cómo se compara: por unidad o por kg (sub-recetas, o productos del Excel que van por kg). */
  por: "und" | "kg";
  /** Costo con la receta de Producción y los precios de Cash Control. null = falta algún precio. */
  costoProduccion: number | null;
  /** Lo que sí se pudo costear, aunque falten precios (para ver cuánto falta). */
  costoParcial: number;
  sinPrecio: string[];
  pareja: Pareja | null;
  costoExcel: number | null;
  /** (Producción − Excel) ÷ Excel. null = no se puede comparar. */
  diferencia: number | null;
};

// ─────────────────────────────────────────────────────────────────
// Nombres

const VACIAS = new Set(["de", "del", "con", "la", "el", "los", "las", "y", "g", "gr", "kg", "und", "unidad", "unidades", "x", "yayis", "yayi", "s", "sub", "receta"]);

export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/integral multigrano/g, "img")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
const palabras = (t: string) => normalizar(t).split(" ").filter((w) => w && !VACIAS.has(w));

/** Parecido entre dos nombres (0 a 1), por palabras en común. */
export function parecido(a: string, b: string): number {
  const x = new Set(palabras(a));
  const y = new Set(palabras(b));
  if (x.size === 0 || y.size === 0) return 0;
  let comun = 0;
  for (const w of x) if (y.has(w)) comun++;
  return (2 * comun) / (x.size + y.size);
}

/** El ítem del catálogo con el mismo nombre (sin tildes ni «(kg)»). */
export function porNombre(catalogo: CostoPreparacion[], nombre: string, tipos: string[]): CostoPreparacion | null {
  const n = normalizar(nombre);
  const sinKg = (t: string) => normalizar(t).replace(/\bkg\b/g, "").replace(/\s+/g, " ").trim();
  return catalogo.find((c) => tipos.includes(c.tipo) && normalizar(c.nombre) === n)
    ?? catalogo.find((c) => tipos.includes(c.tipo) && sinKg(c.nombre) === sinKg(nombre))
    ?? null;
}

/** La pareja más parecida en el Excel (productos y preparaciones). Exacta si el nombre es el mismo. */
export function sugerirPareja(catalogo: CostoPreparacion[], nombre: string, minimo = 0.5): Pareja | null {
  const exacta = porNombre(catalogo, nombre, ["producto", "preparacion"]);
  if (exacta) return { ref: exacta.ref, nombre: exacta.nombre, unidad: exacta.unidad, costo: exacta.costo, exacta: true };
  let mejor: { c: CostoPreparacion; p: number } | null = null;
  for (const c of catalogo) {
    if (c.tipo === "insumo") continue;
    const p = parecido(nombre, c.nombre);
    if (p >= minimo && (!mejor || p > mejor.p)) mejor = { c, p };
  }
  return mejor ? { ref: mejor.c.ref, nombre: mejor.c.nombre, unidad: mejor.c.unidad, costo: mejor.c.costo, exacta: false } : null;
}

// ─────────────────────────────────────────────────────────────────
// Costos

/** S/ por unidad interna (g, ml o unidad) de un insumo del catálogo. null = unidades que no se pueden convertir. */
function precioInterno(c: CostoPreparacion, base: InsumoProd["base"]): number | null {
  const u = c.unidad;
  if (base === "unidad") return u === "und" ? c.costo : null;
  if (u === "kg" || u === "l") return c.costo / 1000; // peso o volumen: 1 ml = 1 g
  return null;
}

type Costeo = { costo: number; faltan: string[] };

export function crearCosteador(d: DatosProduccion, catalogo: CostoPreparacion[], parejas: ParejaGuardada[] = []) {
  const porRef = new Map(catalogo.map((c) => [c.ref, c]));
  const parejaInsumo = new Map(parejas.filter((p) => p.tipo === "insumo").map((p) => [p.prodClave, p]));
  const insumo = new Map(d.insumos.map((i) => [i.id, i]));
  const receta = new Map(d.recetas.map((r) => [r.id, r]));
  const ingredientesDe = new Map<number, IngredienteProd[]>();
  for (const i of d.ingredientes) ingredientesDe.set(i.recetaId, [...(ingredientesDe.get(i.recetaId) ?? []), i]);
  const memo = new Map<number, Costeo | null>();

  /** Costo por unidad interna de un insumo: del catálogo, o de su sub-receta. */
  function precioDe(insumoId: number, camino: Set<number>): Costeo | null {
    if (memo.has(insumoId)) return memo.get(insumoId)!;
    const i = insumo.get(insumoId);
    if (!i) return null;
    const guardada = parejaInsumo.get(String(i.id));
    const cg = guardada?.refCC ? porRef.get(guardada.refCC) : undefined;
    const c = guardada ? null : porNombre(catalogo, i.nombre, ["insumo", "preparacion"]);
    let r: Costeo | null = null;
    const p = cg ? cg.costo * guardada!.factor : c ? precioInterno(c, i.base) : null;
    if (p != null) r = { costo: p, faltan: [] };
    else if (i.subrecetaId != null && !camino.has(i.subrecetaId)) {
      const sub = receta.get(i.subrecetaId);
      if (sub) {
        const ings = ingredientesDe.get(sub.id) ?? [];
        const peso = ings.reduce((t, x) => t + (x.gramosUnidad ?? 0), 0);
        if (peso > 0) {
          const u = costoDeGramos(ings.map((x) => ({ insumoId: x.insumoId, gramos: x.gramosUnidad ?? 0 })), new Set([...camino, sub.id]));
          r = { costo: (u.costo * (1 + sub.mermaPct / 100)) / peso, faltan: u.faltan };
        }
      }
    }
    memo.set(insumoId, r);
    return r;
  }

  function costoDeGramos(lista: { insumoId: number; gramos: number }[], camino: Set<number> = new Set()): Costeo {
    let costo = 0;
    const faltan: string[] = [];
    for (const x of lista) {
      if (!x.gramos) continue;
      const p = precioDe(x.insumoId, camino);
      if (!p) { faltan.push(insumo.get(x.insumoId)?.nombre ?? `insumo ${x.insumoId}`); continue; }
      costo += p.costo * x.gramos;
      for (const f of p.faltan) if (!faltan.includes(f)) faltan.push(f);
    }
    return { costo, faltan };
  }

  return { costoDeGramos, ingredientesDe };
}

const LINEAS_ORDEN: RecetaProd["linea"][] = ["panaderia", "pasteleria", "empanadas", "sub_recetas"];

/** Cada receta (y formato de pan) de Producción con su costo y el del Excel. */
export function compararRecetas(d: DatosProduccion, catalogo: CostoPreparacion[], parejas: ParejaGuardada[] = []): FilaComparacion[] {
  const { costoDeGramos, ingredientesDe } = crearCosteador(d, catalogo, parejas);
  const porRef = new Map(catalogo.map((c) => [c.ref, c]));
  const parejaReceta = new Map(parejas.filter((p) => p.tipo === "receta").map((p) => [p.prodClave, p]));
  /** La pareja guardada (o «sin pareja»), y si no hay, la sugerida por nombre. */
  const parejaDe = (clave: string, nombre: string): Pareja | null => {
    const g = parejaReceta.get(clave);
    if (!g) return sugerirPareja(catalogo, nombre);
    const c = g.refCC ? porRef.get(g.refCC) : undefined;
    return c ? { ref: c.ref, nombre: c.nombre, unidad: c.unidad, costo: c.costo, exacta: true, guardada: true, factor: g.factor } : null;
  };
  const filas: FilaComparacion[] = [];

  const cerrar = (base: Omit<FilaComparacion, "costoExcel" | "diferencia" | "costoProduccion" | "por">, porKg: (costo: number) => number | null, porDefecto: "und" | "kg") => {
    const p = base.pareja;
    const por: "und" | "kg" = p ? (p.unidad === "und" ? "und" : "kg") : porDefecto;
    const completo = base.sinPrecio.length === 0;
    // Un producto del Excel por unidad puede juntar varias de Producción (paquete de 5) o ser una parte (1/4 de bandeja).
    const factor = por === "und" ? p?.factor ?? 1 : 1;
    const enUnidad = (c: number) => (por === porDefecto ? c * factor : por === "kg" ? porKg(c) : null);
    const costoProduccion = completo ? enUnidad(base.costoParcial) : null;
    const costoExcel = p && (por === "und" ? p.unidad === "und" : p.unidad === "kg" || p.unidad === "l") ? p.costo : null;
    const diferencia = costoProduccion != null && costoExcel ? (costoProduccion - costoExcel) / costoExcel : null;
    filas.push({ ...base, por, costoProduccion, costoParcial: enUnidad(base.costoParcial) ?? base.costoParcial, costoExcel, diferencia });
  };

  for (const r of d.recetas) {
    const esSub = r.linea === "sub_recetas";
    if (!r.activa && !esSub) continue;
    const ings = [...(ingredientesDe.get(r.id) ?? [])].sort((a, b) => a.orden - b.orden);
    const merma = 1 + r.mermaPct / 100;
    if (r.modo === "panadero") {
      for (const f of d.formatos.filter((x) => x.recetaId === r.id && x.activo)) {
        const harina = r.pesoBase ? (f.pesoMasa / r.pesoBase) * r.harinaBase : 0;
        const u = costoDeGramos(ings.map((x) => ({ insumoId: x.insumoId, gramos: (harina * x.porcentaje) / 100 })));
        const nombre = `${r.nombre} ${f.nombre}`;
        cerrar({
          clave: `${r.id}-${f.id}`, recetaId: r.id, receta: r.nombre, formato: f.nombre, linea: r.linea,
          costoParcial: u.costo * merma, sinPrecio: u.faltan, pareja: parejaDe(`${r.id}-${f.id}`, nombre),
        }, (c) => (f.pesoMasa ? (c / f.pesoMasa) * 1000 : null), "und");
      }
      continue;
    }
    const lista = ings.map((x) => ({ insumoId: x.insumoId, gramos: x.gramosUnidad ?? 0 }));
    const peso = lista.reduce((t, x) => t + x.gramos, 0);
    const u = costoDeGramos(lista);
    if (esSub) {
      // Sub-receta: por kg de lo que sale (con la merma).
      if (peso <= 0) continue;
      cerrar({
        clave: `${r.id}`, recetaId: r.id, receta: r.nombre, formato: null, linea: r.linea,
        costoParcial: ((u.costo * merma) / peso) * 1000, sinPrecio: u.faltan, pareja: parejaDe(`${r.id}`, r.nombre),
      }, (c) => c, "kg");
      continue;
    }
    cerrar({
      clave: `${r.id}`, recetaId: r.id, receta: r.nombre, formato: null, linea: r.linea,
      costoParcial: u.costo * merma, sinPrecio: u.faltan, pareja: parejaDe(`${r.id}`, r.nombre),
    }, (c) => (peso ? (c / peso) * 1000 : null), "und");
  }
  return filas.sort((a, b) => LINEAS_ORDEN.indexOf(a.linea) - LINEAS_ORDEN.indexOf(b.linea) || a.receta.localeCompare(b.receta, "es") || (a.formato ?? "").localeCompare(b.formato ?? "", "es"));
}

/** Diferencia que ya merece revisión (10%). */
export const UMBRAL_DIFERENCIA = 0.1;

export function resumenComparacion(filas: FilaComparacion[]) {
  return {
    total: filas.length,
    comparables: filas.filter((f) => f.diferencia != null).length,
    parecidas: filas.filter((f) => f.diferencia != null && Math.abs(f.diferencia) < UMBRAL_DIFERENCIA).length,
    difieren: filas.filter((f) => f.diferencia != null && Math.abs(f.diferencia) >= UMBRAL_DIFERENCIA).length,
    sinPareja: filas.filter((f) => !f.pareja).length,
    faltanPrecios: filas.filter((f) => f.sinPrecio.length > 0).length,
  };
}
