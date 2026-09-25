/**
 * El clasificador experto de egresos · MOTOR (puro).
 *
 * ─── Para qué ───
 *
 * Pedido de Jahnn (25-sep-2026): "el sistema será un clasificador experto
 * capaz de identificar cada egreso y clasificarlo donde corresponda… de aquí
 * saldrán los dos reportes cruciales: el punto de equilibrio de cada sede y
 * la categorización de gastos, y de ahí el presupuesto". Todo parte de
 * clasificar bien cada egreso.
 *
 * ─── Cómo decide ───
 *
 * Un egreso se mira desde varias opiniones independientes:
 *
 *   · decisión  — Jahnn ya dijo qué es ESTE gasto (bandeja Por definir).
 *   · aprendida — una regla que Jahnn enseñó al decidir otro gasto
 *                 ("todos los que dicen TAPA DE LOMO son INSUMOS").
 *   · excel     — el grupo que puso Kelly en su Excel (si no es un bolsón).
 *   · registro  — la categoría con la que se registró a mano (gastos que
 *                 no vinieron del Excel).
 *   · reglas    — las palabras clave de la lista única (reglas-gasto.ts).
 *
 * Y les pone nivel de confianza:
 *
 *   · alta  — lo decidió Jahnn (él o una regla suya), o dos opiniones
 *             coinciden.
 *   · media — una sola opinión, sin nadie que la contradiga; o dos que
 *             difieren en la categoría pero no en el tipo (el punto de
 *             equilibrio no cambia).
 *   · baja  — las opiniones se contradicen en el tipo (fijo, variable,
 *             inversión…), nadie sabe qué es, o la categoría ya no existe
 *             en la lista única. Va a la bandeja para que Jahnn decida.
 *
 * Mientras no se decida, el gasto cuenta con la mejor sugerencia (la
 * categoría con la que está guardado): decisión de Jahnn, 25-sep-2026 —
 * sacarlo del punto de equilibrio lo haría ver mejor de lo que es.
 */

import { CATEGORIAS_GASTO, POR_ACLARAR, clasificarGasto, tipoDeCategoria, type TipoCategoria } from "./reglas-gasto";
import { resolverCategoria } from "./categoria-resolver";
import { esGrupoBolson } from "./categoria-alias";
import { textoDeRegla } from "./texto-regla";

export type Confianza = "alta" | "media" | "baja";
export type FuenteOpinion = "decision" | "aprendida" | "excel" | "registro" | "reglas";

export type Opinion = { fuente: FuenteOpinion; categoria: string; tipo: TipoCategoria | null };

/** Una regla que Jahnn enseñó: los conceptos que contienen `texto` van en `categoria`. */
export type ReglaAprendida = { texto: string; categoria: string };

export type GastoAClasificar = {
  concepto: string | null;
  /** La categoría con la que está guardado hoy. */
  categoria: string;
  /** El texto de la columna Grupo del Excel (null si se registró a mano). */
  grupoExcel: string | null;
  /** ¿Vino del Excel? (si no, la categoría guardada es la opinión de quien lo registró). */
  deExcel: boolean;
  /** ¿Jahnn ya decidió este gasto (o el grupo al que pertenece)? */
  decidido: boolean;
};

export type Clasificacion = {
  /** La categoría con la que cuenta (la guardada, salvo que una regla de Jahnn diga otra). */
  categoria: string;
  tipo: TipoCategoria | null;
  confianza: Confianza;
  opiniones: Opinion[];
  /** Por qué, en una línea, para la bandeja. */
  motivo: string;
  /** Categorías entre las que hay que elegir (solo con confianza baja). */
  sugerencias: string[];
};

const EN_LISTA = new Set(CATEGORIAS_GASTO.map((c) => c.nombre));
export const enListaUnica = (c: string) => EN_LISTA.has(c);

export const NOMBRE_FUENTE: Record<FuenteOpinion, string> = {
  decision: "Tu decisión",
  aprendida: "Regla que enseñaste",
  excel: "Excel",
  registro: "Registro a mano",
  reglas: "Reglas del sistema",
};

const opinion = (fuente: FuenteOpinion, categoria: string): Opinion => ({ fuente, categoria, tipo: tipoDeCategoria(categoria) });

/** La regla aprendida más específica (el texto más largo) que coincide con el concepto. */
export function reglaAprendidaDe(concepto: string | null, reglas: ReglaAprendida[]): ReglaAprendida | null {
  const texto = textoDeRegla(concepto);
  let mejor: ReglaAprendida | null = null;
  for (const r of reglas) {
    const t = textoDeRegla(r.texto);
    if (t.length > 0 && texto.includes(t) && (!mejor || t.length > textoDeRegla(mejor.texto).length)) mejor = r;
  }
  return mejor;
}

/** Lo que dice el grupo del Excel, si dice algo concreto (no un bolsón ni algo desconocido). */
function categoriaDelGrupo(grupo: string | null): string | null {
  if (!grupo || !grupo.trim() || esGrupoBolson(grupo)) return null;
  const r = resolverCategoria(grupo);
  if (r.confianza === "desconocida" || !EN_LISTA.has(r.canonica) || r.canonica === POR_ACLARAR) return null;
  return r.canonica;
}

export function clasificarEgreso(g: GastoAClasificar, aprendidas: ReglaAprendida[] = []): Clasificacion {
  const actual = g.categoria;
  if (g.decidido) {
    const op = opinion("decision", actual);
    return { categoria: actual, tipo: op.tipo, confianza: "alta", opiniones: [op], motivo: "Lo decidiste tú.", sugerencias: [] };
  }

  const opiniones: Opinion[] = [];
  const apr = reglaAprendidaDe(g.concepto, aprendidas);
  if (apr) opiniones.push(opinion("aprendida", apr.categoria));
  if (g.deExcel && g.grupoExcel?.trim()) {
    const k = categoriaDelGrupo(g.grupoExcel);
    if (k) opiniones.push(opinion("excel", k));
  } else if (g.deExcel && EN_LISTA.has(actual) && actual !== POR_ACLARAR) {
    // Cargas viejas del Excel (antes de sep-2026) no guardaron el grupo: la
    // categoría guardada ES la que venía en el Excel.
    opiniones.push(opinion("excel", actual));
  } else if (EN_LISTA.has(actual) && actual !== POR_ACLARAR) {
    opiniones.push(opinion("registro", actual));
  }
  // El sistema guarda el proveedor entre paréntesis ("VARIOS (METRO)"); en el
  // Excel va en su propia columna. Sin los signos, las reglas lo encuentran igual.
  const porReglas = clasificarGasto((g.concepto ?? "").replace(/[()[\]]/g, " "));
  if (porReglas !== POR_ACLARAR) opiniones.push(opinion("reglas", porReglas));

  // Una regla de Jahnn manda: es su criterio, ya aplicado a gastos parecidos.
  if (apr) {
    return { categoria: apr.categoria, tipo: tipoDeCategoria(apr.categoria), confianza: "alta", opiniones, motivo: `Regla que enseñaste: «${apr.texto}».`, sugerencias: [] };
  }

  const cats = [...new Set(opiniones.map((o) => o.categoria))];
  const baja = (motivo: string): Clasificacion => ({
    categoria: actual, tipo: tipoDeCategoria(actual), confianza: "baja", opiniones, motivo,
    sugerencias: [...new Set([...cats, ...(EN_LISTA.has(actual) && actual !== POR_ACLARAR ? [actual] : [])])],
  });

  if (!EN_LISTA.has(actual)) return baja(`«${actual}» ya no está en la lista única de categorías.`);
  if (opiniones.length === 0) return baja("Nadie sabe qué es: ni el Excel ni las reglas lo reconocen.");
  if (cats.length === 1) {
    if (cats[0] !== actual && tipoDeCategoria(cats[0]) === tipoDeCategoria(actual)) {
      return {
        categoria: actual, tipo: tipoDeCategoria(actual), confianza: "media", opiniones,
        motivo: `Está guardado como ${actual}; ${opiniones.map((o) => NOMBRE_FUENTE[o.fuente].toLowerCase()).join(" y ")} dice ${cats[0]}, del mismo tipo: el punto de equilibrio no cambia.`,
        sugerencias: [],
      };
    }
    if (cats[0] !== actual) return baja(`Está guardado como ${actual}, pero ${opiniones.map((o) => NOMBRE_FUENTE[o.fuente].toLowerCase()).join(" y ")} dice${opiniones.length > 1 ? "n" : ""} ${cats[0]}.`);
    return {
      categoria: actual, tipo: tipoDeCategoria(actual), confianza: opiniones.length >= 2 ? "alta" : "media", opiniones,
      motivo: opiniones.length >= 2 ? "El Excel y las reglas coinciden." : `Solo lo reconoce: ${NOMBRE_FUENTE[opiniones[0].fuente].toLowerCase()}.`,
      sugerencias: [],
    };
  }
  const tipos = new Set(opiniones.map((o) => o.tipo));
  if (tipos.size === 1 && tipoDeCategoria(actual) === opiniones[0].tipo) {
    return {
      categoria: actual, tipo: tipoDeCategoria(actual), confianza: "media", opiniones,
      motivo: `Difieren en la categoría (${cats.join(" / ")}) pero no en el tipo: el punto de equilibrio no cambia.`,
      sugerencias: [],
    };
  }
  return baja(`Se contradicen: ${opiniones.map((o) => `${NOMBRE_FUENTE[o.fuente].toLowerCase()} dice ${o.categoria} (${o.tipo ?? "sin tipo"})`).join("; ")}.`);
}

/** Cuánta plata del periodo está clasificada con cada nivel de confianza. */
export type CalidadClasificacion = { total: number; alta: number; media: number; baja: number; filasBaja: number };

export function calidadClasificacion(gastos: { monto: number; confianza: Confianza }[]): CalidadClasificacion {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const q = { total: 0, alta: 0, media: 0, baja: 0, filasBaja: 0 };
  for (const g of gastos) {
    q.total += g.monto;
    q[g.confianza] += g.monto;
    if (g.confianza === "baja") q.filasBaja++;
  }
  return { total: r2(q.total), alta: r2(q.alta), media: r2(q.media), baja: r2(q.baja), filasBaja: q.filasBaja };
}

/** % del gasto que NO está en duda (alta + media), redondeado hacia abajo para no prometer de más. */
export function porcentajeSeguro(q: CalidadClasificacion): number | null {
  if (q.total <= 0) return null;
  return Math.floor(((q.alta + q.media) / q.total) * 1000) / 10;
}
