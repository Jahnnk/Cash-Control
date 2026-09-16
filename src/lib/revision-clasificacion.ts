/**
 * Revisión de la clasificación de gastos ("Por definir") · MOTOR (puro).
 *
 * ─── Para qué ───
 *
 * Pedido de Jahnn (16-sep-2026): "tener los datos lo más correctos posibles
 * y con la categoría correcta". Hay dos clasificaciones que tienen que
 * decir lo mismo — la del Excel de Kelly ("Categorías PE") y el catálogo
 * del sistema — y gastos sueltos que caen donde no deberían. En Fonavi,
 * abril–setiembre 2026: 19 grupos clasificados distinto, 35 gastos por
 * S/5,376 en el bolsón OTROS, y montos fuera de lo normal (un "préstamo
 * para uniformes" de S/1,058 en SS GENERALES).
 *
 * Este motor NO decide nada: detecta qué hay que preguntarle a Jahnn y, una
 * vez que decide, dice si Kelly tiene que corregir su Excel y si ya lo hizo.
 * Adivinar la categoría de un gasto es justo lo que no hay que hacer (ver
 * memoria del catálogo único: "el sistema NO adivina lo nuevo").
 *
 * ─── Qué se revisa (decisiones de Jahnn) ───
 *
 *   Por CATEGORÍA (un grupo del Excel dentro de una categoría del sistema;
 *   se decide una vez y vale para siempre):
 *     · difiere     — Kelly y el sistema le dan tipos distintos.
 *     · no_calza    — la categoría del sistema junta grupos que Kelly
 *                     clasifica distinto (UNIFORMES y FLETE dentro de
 *                     SS GENERALES): el grupo quizá va en otra categoría.
 *     · sin_kelly   — el grupo no está en la lista de Kelly.
 *     · sin_sistema — la categoría no tiene grupo en el sistema.
 *   Por GASTO suelto:
 *     · bolson      — S/100 o más en OTROS o PENDIENTE.
 *     · atipico     — S/300 o más y 5× o más la mediana de su categoría.
 */

import { normGrupoPE, type CategoriaPE, type TipoPE } from "./pe-kelly";
import type { GrupoCategoria } from "./catalogo-categorias";

export type { TipoPE };

export type AlcanceRevision = "categoria" | "gasto";
export type MotivoRevision = "difiere" | "no_calza" | "sin_kelly" | "sin_sistema" | "bolson" | "atipico";

export type FilaGastoRevision = {
  huella: string;
  date: string;
  amount: number;
  concept: string | null;
  category: string;
  /** El texto de Grupo del Excel (o la categoría, si no vino del Excel). */
  grupo: string;
};

export type CategoriaSistema = { name: string; costGroup: string | null; excludeFromEbitda: boolean };

export type CandidatoRevision = {
  alcance: AlcanceRevision;
  motivo: MotivoRevision;
  clave: string;
  datos: Record<string, unknown>;
};

/** Grupos que funcionan como bolsón de "lo que no se sabe dónde va". */
export const GRUPOS_BOLSON = new Set(["OTROS", "PENDIENTE"]);
export const BOLSON_DESDE = 100;
export const ATIPICO_DESDE = 300;
export const ATIPICO_VECES = 5;
/** Con menos gastos, la mediana no dice qué es "lo normal". */
export const ATIPICO_MIN_FILAS = 8;
/**
 * Categorías donde un monto grande es lo esperado (una planilla, el
 * alquiler, el pedido de la semana a Atelier): marcarlas sería ruido.
 */
export const SIN_ATIPICOS = new Set(["PLANILLA", "ALQUILER", "PRODUCTOS ATELIER"]);

/** El tipo para el punto de equilibrio según el catálogo del sistema. */
export function tipoPEDelSistema(c: CategoriaSistema | undefined): TipoPE | null {
  if (!c) return null;
  if (c.excludeFromEbitda || c.costGroup === "financiamiento") return "Excluido";
  if (c.costGroup === "fijo") return "Fijo";
  if (c.costGroup === "variable") return "Variable";
  return null;
}

export function grupoDelSistema(c: CategoriaSistema | undefined): GrupoCategoria | null {
  if (!c) return null;
  if (c.costGroup === "fijo" || c.costGroup === "variable" || c.costGroup === "financiamiento") return c.costGroup;
  return c.excludeFromEbitda ? "fuera" : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function claveCategoria(grupo: string, category: string): string {
  return `${normGrupoPE(grupo)}|${category}`;
}

export function detectarRevisiones(input: {
  gastos: FilaGastoRevision[];
  categoriasSistema: CategoriaSistema[];
  /** null = la sede todavía no tiene la lista de Kelly. */
  categoriasKelly: CategoriaPE[] | null;
}): CandidatoRevision[] {
  const { gastos, categoriasKelly } = input;
  const sistema = new Map(input.categoriasSistema.map((c) => [c.name, c]));
  const kelly = categoriasKelly ? new Map(categoriasKelly.map((c) => [c.grupoNorm, c.tipo])) : null;
  const out: CandidatoRevision[] = [];

  // ─── Por categoría ───
  const pares = new Map<string, { grupo: string; category: string; filas: FilaGastoRevision[] }>();
  for (const g of gastos) {
    const k = claveCategoria(g.grupo, g.category);
    if (!pares.has(k)) pares.set(k, { grupo: g.grupo, category: g.category, filas: [] });
    pares.get(k)!.filas.push(g);
  }
  // Tipos de Kelly que conviven dentro de cada categoría del sistema.
  const tiposPorCategoria = new Map<string, Map<string, TipoPE | null>>();
  for (const p of pares.values()) {
    if (!tiposPorCategoria.has(p.category)) tiposPorCategoria.set(p.category, new Map());
    tiposPorCategoria.get(p.category)!.set(p.grupo, kelly?.get(normGrupoPE(p.grupo)) ?? null);
  }

  for (const [clave, p] of pares) {
    const cat = sistema.get(p.category);
    const tipoSistema = tipoPEDelSistema(cat);
    const tipoKelly = kelly ? kelly.get(normGrupoPE(p.grupo)) ?? null : null;
    const otros = [...(tiposPorCategoria.get(p.category) ?? new Map()).entries()]
      .filter(([g]) => normGrupoPE(g) !== normGrupoPE(p.grupo))
      .map(([g, t]) => ({ grupo: g, tipoKelly: t }));
    const tiposDistintosEnCategoria = new Set([tipoKelly, ...otros.map((o) => o.tipoKelly)].filter(Boolean)).size > 1;

    let motivo: MotivoRevision | null = null;
    if (kelly) {
      if (tipoKelly === null) motivo = "sin_kelly";
      else if (tipoSistema === null) motivo = "sin_sistema";
      else if (tipoKelly !== tipoSistema) motivo = tiposDistintosEnCategoria ? "no_calza" : "difiere";
    } else if (tipoSistema === null) {
      motivo = "sin_sistema";
    }
    if (!motivo) continue;

    const ejemplos = [...p.filas].sort((a, b) => b.amount - a.amount).slice(0, 3)
      .map((f) => ({ fecha: f.date, monto: r2(f.amount), concepto: f.concept }));
    out.push({
      alcance: "categoria",
      motivo,
      clave,
      datos: {
        grupo: p.grupo,
        categoria: p.category,
        tipoKelly,
        tipoSistema,
        grupoSistema: grupoDelSistema(cat),
        filas: p.filas.length,
        monto: r2(p.filas.reduce((t, f) => t + f.amount, 0)),
        ejemplos,
        otrosGruposEnCategoria: otros,
      },
    });
  }

  // ─── Por gasto ───
  const porCategoria = new Map<string, number[]>();
  for (const g of gastos) {
    if (!porCategoria.has(g.category)) porCategoria.set(g.category, []);
    porCategoria.get(g.category)!.push(g.amount);
  }
  const vistos = new Set<string>();
  for (const g of gastos) {
    if (vistos.has(g.huella)) continue;
    const tipoFinal = (kelly ? kelly.get(normGrupoPE(g.grupo)) : null) ?? tipoPEDelSistema(sistema.get(g.category));
    const base = {
      fecha: g.date, monto: r2(g.amount), concepto: g.concept, grupo: g.grupo, categoria: g.category,
      tipoKelly: kelly ? kelly.get(normGrupoPE(g.grupo)) ?? null : null,
      tipoSistema: tipoPEDelSistema(sistema.get(g.category)),
    };
    const esBolson = GRUPOS_BOLSON.has(normGrupoPE(g.grupo)) || GRUPOS_BOLSON.has(normGrupoPE(g.category));
    if (esBolson && g.amount >= BOLSON_DESDE) {
      vistos.add(g.huella);
      out.push({ alcance: "gasto", motivo: "bolson", clave: g.huella, datos: base });
      continue;
    }
    const montos = porCategoria.get(g.category) ?? [];
    if (
      !SIN_ATIPICOS.has(g.category) && (tipoFinal === "Fijo" || tipoFinal === "Variable") &&
      montos.length >= ATIPICO_MIN_FILAS && g.amount >= ATIPICO_DESDE && g.amount >= ATIPICO_VECES * mediana(montos)
    ) {
      vistos.add(g.huella);
      out.push({ alcance: "gasto", motivo: "atipico", clave: g.huella, datos: { ...base, mediana: r2(mediana(montos)) } });
    }
  }
  return out;
}

/* ─────────────────────────── Decisiones ─────────────────────────── */

export type DecisionCategoria = {
  /** Cómo cuenta este grupo en el punto de equilibrio. */
  tipoPE: TipoPE;
  /** Cómo cuenta la categoría en el sistema (EBITDA, reportes). */
  grupoSistema: GrupoCategoria;
  /** Mover los gastos de este grupo a otra categoría del sistema. */
  categoriaDestino?: string | null;
  nota?: string | null;
};

export type DecisionGasto =
  | { accion: "ok"; nota?: string | null }
  | { accion: "reclasificar"; tipoPE: TipoPE; categoriaDestino?: string | null; nota?: string | null }
  | { accion: "consultar"; pregunta: string };

/**
 * ¿La decisión contradice lo que dice hoy el Excel de Kelly? Si sí, va a su
 * lista de correcciones. Sin lista de Kelly no hay nada que corregir allá.
 */
export function kellyDebeCorregir(tipoKellyActual: TipoPE | null, tipoDecidido: TipoPE, hayListaKelly: boolean): boolean {
  return hayListaKelly && tipoKellyActual !== tipoDecidido;
}

/** Texto de la lista de correcciones para Kelly (se copia por WhatsApp). */
export function lineaParaKelly(item: {
  alcance: AlcanceRevision;
  datos: Record<string, unknown>;
  decision: DecisionCategoria | DecisionGasto;
}): string {
  const d = item.datos as { grupo?: string; fecha?: string; monto?: number; concepto?: string | null; tipoKelly?: TipoPE | null };
  if (item.alcance === "categoria") {
    const dec = item.decision as DecisionCategoria;
    return d.tipoKelly
      ? `• Grupo "${d.grupo}": en «Categorías PE» cambiar el tipo de ${d.tipoKelly} a ${dec.tipoPE}.`
      : `• Grupo "${d.grupo}": agregarlo a «Categorías PE» como ${dec.tipoPE}.`;
  }
  const dec = item.decision as DecisionGasto;
  const gasto = `"${d.concepto ?? "sin concepto"}" del ${d.fecha} (S/${(d.monto ?? 0).toFixed(2)})`;
  if (dec.accion === "consultar") return `• ¿Qué fue ${gasto}? ${dec.pregunta}`;
  if (dec.accion === "reclasificar") {
    return `• ${gasto}: moverlo del grupo "${d.grupo}" a uno de tipo ${dec.tipoPE}${dec.categoriaDestino ? ` (${dec.categoriaDestino})` : ""}.`;
  }
  return `• ${gasto}: está bien donde está.`;
}
