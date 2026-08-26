/**
 * El portafolio de productos, resumido PARA UNA REUNIÓN.
 *
 * Pedido de Jahnn (24-ago-2026): que el Deck de la reunión exponga el
 * análisis de portafolio "considerando dos variables: rentabilidad
 * (cuánto margen deja) y popularidad (cuántas unidades vende)… saber
 * qué productos mantener, promocionar, reemplazar".
 *
 * ─── Esto NO piensa: solo elige qué mostrar ───
 *
 * El análisis ya existe y está probado en `intelligence.ts`: clasifica
 * cada producto por rentabilidad × popularidad (menu engineering),
 * calcula tendencias y emite un veredicto. Este módulo NO vuelve a
 * clasificar nada — recibe esa inteligencia y decide qué cabe en una
 * lámina y en qué orden. Un segundo cerebro que opinara distinto sería
 * exactamente lo que rompe la confianza en la reunión.
 *
 * ─── Los cuatro cuadrantes, en el idioma de Jahnn ───
 *
 * La literatura los llama star / plow horse / puzzle / dog. En la
 * reunión eso no significa nada, así que cada uno se nombra por LA
 * DECISIÓN que implica, que es lo que se va a discutir:
 *
 *   star       → Mantener y proteger   (vende y deja margen)
 *   plow_horse → Revisar precio o costo (vende mucho, deja poco)
 *   puzzle     → Promocionar            (deja margen, casi nadie lo pide)
 *   dog        → Candidato a reemplazo  (ni vende ni deja)
 *
 * "Candidato a reemplazo" y no "eliminar": la decisión es de Jahnn en
 * la reunión, no del sistema. Un plato puede ser un perro en números y
 * seguir en la carta porque sostiene la imagen de la panadería.
 *
 * ─── La advertencia que va SIEMPRE ───
 *
 * Hoy la mitad de la venta no tiene costo asignado (productos sin
 * receta o sin alias). Un cuadrante calculado sobre la mitad del
 * negocio y presentado como si fuera todo es peor que no mostrarlo: se
 * toman decisiones de carta con datos que no cubren lo que se vende.
 * Por eso la cobertura viaja pegada al análisis, no en una nota al pie.
 */

import type {
  PortfolioIntelligence, ProductIntel, MenuEngQuadrant,
} from "./types";
import type { ProductMover, PortfolioProjection } from "./history";

/** Cómo se llama cada cuadrante en la reunión, y qué decisión implica. */
export const CUADRANTES: {
  q: MenuEngQuadrant;
  titulo: string;
  decision: string;
  /** La regla en una línea, para que nadie tenga que creer a ciegas. */
  regla: string;
}[] = [
  {
    q: "star",
    titulo: "Mantener y proteger",
    decision: "No tocar el precio. Cuidar que nunca falte ni baje de calidad.",
    regla: "Vende por encima del promedio y deja margen por encima del promedio",
  },
  {
    q: "plow_horse",
    titulo: "Revisar precio o costo",
    decision: "Sube el precio con cuidado, o baja el costo de la receta.",
    regla: "Vende mucho pero deja menos margen que el promedio",
  },
  {
    q: "puzzle",
    titulo: "Promocionar",
    decision: "Darle visibilidad: vitrina, sugerencia del mozo, combo.",
    regla: "Deja buen margen pero casi nadie lo pide",
  },
  {
    q: "dog",
    titulo: "Candidato a reemplazo",
    decision: "Evaluar sacarlo de la carta o reformularlo.",
    regla: "Ni vende ni deja margen",
  },
];

export type ProductoEnCuadrante = {
  key: string;
  nombre: string;
  unidades: number;
  venta: number;
  /** Margen por unidad en soles. */
  contribucionUnitaria: number | null;
  margenPct: number | null;
  /** Crecimiento vs los meses anteriores. null = sin historia. */
  crecimientoPct: number | null;
};

export type Cuadrante = {
  q: MenuEngQuadrant;
  titulo: string;
  decision: string;
  regla: string;
  productos: ProductoEnCuadrante[];
  /** Cuántos hay en total (la lámina muestra solo los primeros). */
  total: number;
  /** Cuánta venta representa el cuadrante entero. */
  venta: number;
};

export type CoberturaPortafolio = {
  /** % de la VENTA que tiene costo conocido — el número que manda. */
  ventaCubiertaPct: number;
  productosConCosto: number;
  productosTotal: number;
  ventaSinCosto: number;
  /** Los que más venden sin costo: la tarea concreta para cerrar el hueco. */
  faltantes: { nombre: string; venta: number }[];
  /** Frase lista para la lámina. Nunca se omite. */
  advertencia: string;
  /** true = la cobertura es tan baja que el análisis no debe dirigir decisiones. */
  insuficiente: boolean;
};

export type BoardPortfolio = {
  mes: string;
  mesLabel: string;
  /** true = el mes todavía no cierra: la tendencia va a subestimar. */
  mesEnCurso: boolean;
  cuadrantes: Cuadrante[];
  /** Los 3 movimientos que valen una conversación. */
  suben: ProductMover[];
  bajan: ProductMover[];
  proyeccion: PortfolioProjection | null;
  cobertura: CoberturaPortafolio;
  /** Salud del portafolio, ya calculada por el cerebro. */
  salud: { total: number; nivel: string };
  concentracion: { top3Share: number; severidad: string };
  /** Las decisiones que el cerebro propone llevar a la mesa (≤3). */
  decisiones: { decision: string; impacto: number }[];
  /** Preguntas abiertas para la reunión (≤3). */
  preguntas: { pregunta: string; contexto: string }[];
};

/** Por debajo de esto, el análisis ilustra pero no dirige. */
export const COBERTURA_MINIMA = 60;

/**
 * Un movimiento tiene que mover PLATA para entrar a la reunión.
 *
 * `computeMovers` ordena por porcentaje, y en porcentaje gana siempre lo
 * chico: un producto que pasa de S/20 a S/260 marca +1200% y encabeza la
 * lista, aunque en la caja se noten S/240. Es verdad y es irrelevante
 * para una reunión de una hora. Se exige además un cambio absoluto de
 * S/300, y se ordena por PLATA movida — no por porcentaje — para que
 * arriba salga lo que de verdad cambia el mes.
 *
 * El PIC de cada sede sigue viendo TODOS los movers: ahí se investiga,
 * acá se decide.
 */
export const CAMBIO_MINIMO_SOLES = 300;

/** Movimientos que de verdad mueven plata, en orden de impacto en S/. */
export function movimientosRelevantes(ms: ProductMover[], top: number): ProductMover[] {
  return ms
    .filter((m) => Math.abs(m.lastRevenue - m.firstRevenue) >= CAMBIO_MINIMO_SOLES)
    .sort((a, b) => Math.abs(b.lastRevenue - b.firstRevenue) - Math.abs(a.lastRevenue - a.firstRevenue))
    .slice(0, top);
}

/** Cuántos productos entran por cuadrante en la lámina (cabe eso). */
export const MAX_POR_CUADRANTE = 5;

function aProducto(p: ProductIntel): ProductoEnCuadrante {
  return {
    key: p.key,
    nombre: p.name,
    unidades: p.units,
    venta: p.revenue,
    contribucionUnitaria: p.unitContribution,
    margenPct: p.marginPct,
    crecimientoPct: p.growthPct,
  };
}

/**
 * Ordena dentro del cuadrante por lo que hace la decisión URGENTE, que
 * no es lo mismo en cada uno:
 *
 *  · Mantener/Revisar precio → por venta: mover el que más plata mueve.
 *  · Promocionar → por margen unitario: promocionar el que más deja.
 *  · Reemplazar → por venta ASCENDENTE: el más chico duele menos sacarlo.
 */
function ordenarCuadrante(q: MenuEngQuadrant, ps: ProductoEnCuadrante[]): ProductoEnCuadrante[] {
  const xs = [...ps];
  if (q === "puzzle") {
    xs.sort((a, b) => (b.contribucionUnitaria ?? 0) - (a.contribucionUnitaria ?? 0));
  } else if (q === "dog") {
    xs.sort((a, b) => a.venta - b.venta);
  } else {
    xs.sort((a, b) => b.venta - a.venta);
  }
  return xs;
}

export function construirCobertura(intel: PortfolioIntelligence): CoberturaPortafolio {
  const dq = intel.dataQuality;
  const pct = Math.round(dq.costCoveragePct);
  const insuficiente = pct < COBERTURA_MINIMA;

  // La advertencia cambia de TONO según cuánto tape el hueco, pero
  // nunca desaparece: incluso al 95% hay que saber qué quedó fuera.
  let advertencia: string;
  if (dq.productsTotal === 0) {
    advertencia = "Sin ventas cargadas para este mes.";
  } else if (pct >= 95) {
    advertencia = `Cubre el ${pct}% de la venta. Análisis sólido.`;
  } else if (!insuficiente) {
    advertencia =
      `Cubre el ${pct}% de la venta. Los ${dq.productsTotal - dq.productsWithCost} productos ` +
      `sin costo (S/${Math.round(dq.uncostedRevenue).toLocaleString("es-PE")}) quedan fuera del cuadrante.`;
  } else {
    advertencia =
      `⚠ Solo cubre el ${pct}% de la venta: S/${Math.round(dq.uncostedRevenue).toLocaleString("es-PE")} ` +
      `en ${dq.productsTotal - dq.productsWithCost} productos no tienen costo cargado. ` +
      `Sirve para ver tendencias, NO para decidir la carta.`;
  }

  if (dq.costsAreApproximated) {
    advertencia += " Los costos son una aproximación: no hay historial anterior a jul-2026.";
  }

  return {
    ventaCubiertaPct: pct,
    productosConCosto: dq.productsWithCost,
    productosTotal: dq.productsTotal,
    ventaSinCosto: dq.uncostedRevenue,
    faltantes: dq.topUncosted.map((u) => ({ nombre: u.name, venta: u.revenue })),
    advertencia,
    insuficiente,
  };
}

export function construirCuadrantes(intel: PortfolioIntelligence): Cuadrante[] {
  return CUADRANTES.map((c) => {
    const dentro = intel.products.filter((p) => p.menuEng === c.q);
    const ordenados = ordenarCuadrante(c.q, dentro.map(aProducto));
    return {
      ...c,
      productos: ordenados.slice(0, MAX_POR_CUADRANTE),
      total: dentro.length,
      venta: Math.round(dentro.reduce((s, p) => s + p.revenue, 0) * 100) / 100,
    };
  });
}

export function construirBoardPortfolio(input: {
  intel: PortfolioIntelligence;
  mes: string;
  mesLabel: string;
  mesEnCurso: boolean;
  movers: { risers: ProductMover[]; fallers: ProductMover[] };
  proyeccion: PortfolioProjection | null;
}): BoardPortfolio {
  const { intel, movers } = input;
  return {
    mes: input.mes,
    mesLabel: input.mesLabel,
    mesEnCurso: input.mesEnCurso,
    cuadrantes: construirCuadrantes(intel),
    suben: movimientosRelevantes(movers.risers, 4),
    bajan: movimientosRelevantes(movers.fallers, 4),
    proyeccion: input.proyeccion,
    cobertura: construirCobertura(intel),
    salud: { total: intel.health.total, nivel: intel.health.level },
    concentracion: {
      top3Share: intel.concentration.top3Share,
      severidad: intel.concentration.severity,
    },
    decisiones: intel.boardDecisions.slice(0, 3).map((d) => ({
      decision: d.decision, impacto: d.impact,
    })),
    preguntas: intel.boardQuestions.slice(0, 3).map((q) => ({
      pregunta: q.question, contexto: q.context,
    })),
  };
}

/**
 * La frase de apertura de la lámina: qué mirar primero.
 *
 * Prioriza el cuadrante con la decisión más rentable disponible, no el
 * más poblado: en una reunión de una hora lo que importa es dónde está
 * la plata que se puede mover esta semana.
 */
export function tituloDeAtencion(bp: BoardPortfolio): string {
  if (bp.cobertura.productosTotal === 0) return "Sin datos de productos para este mes.";
  if (bp.cobertura.insuficiente) {
    return `Cobertura de costos al ${bp.cobertura.ventaCubiertaPct}%: primero hay que costear lo que falta.`;
  }
  const porQ = (q: MenuEngQuadrant) => bp.cuadrantes.find((c) => c.q === q);
  const puzzles = porQ("puzzle");
  const plow = porQ("plow_horse");
  if (puzzles && puzzles.total > 0) {
    return `${puzzles.total} producto${puzzles.total === 1 ? "" : "s"} deja${puzzles.total === 1 ? "" : "n"} buen margen y casi nadie lo pide: promocionarlos es la ganancia más rápida.`;
  }
  if (plow && plow.total > 0) {
    return `${plow.total} producto${plow.total === 1 ? "" : "s"} de mucha rotación deja${plow.total === 1 ? "" : "n"} menos margen que el promedio: revisar precio o receta.`;
  }
  return "El portafolio no muestra desequilibrios de margen relevantes este mes.";
}
