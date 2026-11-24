/**
 * Conectar los insumos de Producción con la lista de Cash Control · MOTOR (puro).
 *
 * Paso 2 de «una sola lista de insumos» (decisión de Jahnn, 24-nov-2026): Cash Control es el dueño del nombre,
 * la unidad, el precio y si un insumo está activo; Producción se queda con lo de producir (stock, presentación,
 * pesado). Para que Producción lea la lista de Cash Control (paso 3), cada insumo de Producción necesita su
 * pareja. Las parejas se guardan en recetas_produccion_parejas (tipo «insumo»), la misma tabla de la Etapa 3c.
 *
 *   EXACTA    mismo nombre (sin tildes, mayúsculas ni «kg») y unidades que calzan → se conecta con un botón
 *   PROBABLE  parecido alto (≥ 0.66): casi siempre bien, pero hay que mirarla
 *   DUDOSA    parecido medio (≥ 0.4): muchas veces mal
 *   NADA      no hay nada parecido: falta en Cash Control (se crea) o no aplica
 *   PROPIA    sub-receta de Producción sin su igual en Cash Control: se costea con su propia receta (cada
 *             ingrediente con su pareja). Nunca se sugiere uno de sus ingredientes (pedido de Jahnn, 24-nov-2026:
 *             «el Frosting de Queso Crema es una receta; el Queso Crema Cuisine es un insumo con el que se hace»).
 *             Una sub-receta solo se compara con sub-recetas, y solo por el mismo nombre.
 *
 * Unidades: Producción pesa en g (peso), mide en ml (volumen, 1 ml = 1 g) o cuenta (unidad). Calza con kg o l
 * (factor 0.001) o con und (factor 1). Si no calza (Producción cuenta huevos y Cash Control los compra por kg),
 * la pareja se pone a mano con su equivalencia.
 */

import type { CostoPreparacion } from "@/lib/costos-preparaciones";
import { factorInsumoPorDefecto, parecido, porNombre, type InsumoProd, type ParejaGuardada } from "@/lib/recetas-produccion";

export type EstadoInsumo = "conectado" | "noAplica" | "propia" | "exacta" | "probable" | "dudosa" | "nada";

export type Candidato = { ref: string; nombre: string; tipo: CostoPreparacion["tipo"]; unidad: CostoPreparacion["unidad"]; costo: number };

export type FilaInsumo = {
  id: number;
  nombre: string;
  categoria: string | null;
  usos: number;
  base: InsumoProd["base"];
  esSubreceta: boolean;
  estado: EstadoInsumo;
  /** La pareja guardada (conectado) o la sugerida (exacta/probable/dudosa). */
  pareja: Candidato | null;
  factor: number | null;
  /** Las unidades calzan solas (si no, la equivalencia se pone a mano). */
  unidadOk: boolean;
  parecido: number;
};

export const UMBRAL_PROBABLE = 0.66;
export const UMBRAL_DUDOSA = 0.4;

export function unidadesCalzan(base: InsumoProd["base"], unidadCC: string): boolean {
  return base === "unidad" ? unidadCC === "und" : unidadCC === "kg" || unidadCC === "l";
}

const candidato = (c: CostoPreparacion): Candidato => ({ ref: c.ref, nombre: c.nombre, tipo: c.tipo, unidad: c.unidad, costo: c.costo });

export function clasificarInsumos(insumos: InsumoProd[], catalogo: CostoPreparacion[], parejas: ParejaGuardada[]): FilaInsumo[] {
  const opciones = catalogo.filter((c) => c.tipo === "insumo" || c.tipo === "preparacion");
  const porRef = new Map<string, CostoPreparacion>();
  for (const c of catalogo) { porRef.set(c.ref, c); if (c.reemplaza) porRef.set(c.reemplaza, c); }
  const guardadas = new Map(parejas.filter((p) => p.tipo === "insumo").map((p) => [p.prodClave, p]));

  return insumos.map((i) => {
    const base = {
      id: i.id, nombre: i.nombre, categoria: i.categoria ?? null, usos: i.usos ?? 0, base: i.base, esSubreceta: i.subrecetaId != null,
    };
    const g = guardadas.get(String(i.id));
    if (g) {
      const c = g.refCC ? porRef.get(g.refCC) ?? null : null;
      if (!g.refCC) return { ...base, estado: "noAplica" as const, pareja: null, factor: null, unidadOk: true, parecido: 0 };
      if (c) return { ...base, estado: "conectado" as const, pareja: candidato(c), factor: g.factor, unidadOk: true, parecido: 1 };
      // La pareja guardada ya no existe en Cash Control: vuelve a revisarse.
    }
    if (i.subrecetaId != null) {
      const misma = porNombre(opciones, i.nombre, ["preparacion"]);
      if (!misma) return { ...base, estado: "propia" as const, pareja: null, factor: null, unidadOk: true, parecido: 0 };
      const ok = unidadesCalzan(i.base, misma.unidad);
      return { ...base, estado: ok ? "exacta" as const : "probable" as const, pareja: candidato(misma), factor: ok ? factorInsumoPorDefecto(misma.unidad) : null, unidadOk: ok, parecido: 1 };
    }
    const exacta = porNombre(opciones, i.nombre, ["insumo", "preparacion"]);
    if (exacta) {
      const ok = unidadesCalzan(i.base, exacta.unidad);
      return { ...base, estado: ok ? "exacta" as const : "probable" as const, pareja: candidato(exacta), factor: ok ? factorInsumoPorDefecto(exacta.unidad) : null, unidadOk: ok, parecido: 1 };
    }
    let mejor: { c: CostoPreparacion; p: number } | null = null;
    for (const c of opciones) {
      const p = parecido(i.nombre, c.nombre);
      if (p >= UMBRAL_DUDOSA && (!mejor || p > mejor.p)) mejor = { c, p };
    }
    if (!mejor) return { ...base, estado: "nada" as const, pareja: null, factor: null, unidadOk: true, parecido: 0 };
    const ok = unidadesCalzan(i.base, mejor.c.unidad);
    return {
      ...base, estado: mejor.p >= UMBRAL_PROBABLE ? "probable" as const : "dudosa" as const, pareja: candidato(mejor.c),
      factor: ok ? factorInsumoPorDefecto(mejor.c.unidad) : null, unidadOk: ok, parecido: Math.round(mejor.p * 100) / 100,
    };
  }).sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre, "es"));
}

export function resumenInsumos(filas: FilaInsumo[]): Record<EstadoInsumo, number> & { total: number; listos: number } {
  const r = { conectado: 0, noAplica: 0, propia: 0, exacta: 0, probable: 0, dudosa: 0, nada: 0 };
  for (const f of filas) r[f.estado]++;
  return { ...r, total: filas.length, listos: r.conectado + r.noAplica + r.propia };
}

/** Texto de la equivalencia para la pantalla: «1 g = 0.001 kg», «1 unidad = 0.06 kg». */
export function textoEquivalencia(base: InsumoProd["base"], unidadCC: string, factor: number): string {
  const de = base === "unidad" ? "1 unidad" : base === "volumen" ? "1 ml" : "1 g";
  const n = factor.toLocaleString("es-PE", { maximumFractionDigits: 6 });
  return `${de} de Producción = ${n} ${unidadCC === "und" ? "und" : unidadCC}`;
}
