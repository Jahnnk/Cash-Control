/**
 * Tendencia de la demanda de un producto · MOTOR (puro).
 *
 * Pedido de Jahnn (5-oct-2026): «si el sistema identifica que el matcha es un
 * candidato a reemplazo, que salga un gráfico de cómo ha sido su demanda en los
 * últimos meses; si históricamente hay una tendencia negativa, ya sabemos a
 * ciencia cierta que debemos sacarlo».
 *
 * La regla es simple y se ve: se compara lo que vendía por semana en los meses
 * de ANTES contra los últimos 3 meses de AHORA (solo meses completos: un mes a
 * medias parecería una caída). Cuatro respuestas posibles:
 *
 *   · CAYENDO      — ahora vende ≥25% menos que antes, y también cae contra la carta
 *                    completa (≥15% peor): una caída general de la sede no cuenta como
 *                    caída del producto.
 *   · SUBIENDO     — ahora vende ≥25% más que antes.
 *   · ESTABLE      — se mueve menos que eso.
 *   · POCO SIEMPRE — vendía y vende menos de ~6 al mes: no hay tendencia que medir,
 *                    nunca despegó (1 unidad al mes no es una caída, es ruido).
 *
 * Con menos de 4 meses completos no se opina.
 */

/** Un mes de ventas de un producto (o de toda la carta) como unidades por día. */
export type PuntoDia = { month: string; /** El mes está completo (no es uno a medias). */ completo: boolean; porDia: number };

export type ClaseTendencia = "cayendo" | "subiendo" | "estable" | "poco-siempre" | "sin-datos";

export type Tendencia = {
  clase: ClaseTendencia;
  /** Unidades por semana en los meses de antes y de ahora (null si no se pudo medir). */
  antes: number | null;
  ahora: number | null;
  /** Cambio de ahora contra antes, en %. */
  cambioPct: number | null;
  /** Lo mismo para toda la carta de la sede (null si no se dio). */
  cartaPct: number | null;
  /** Meses seguidos de baja al terminar la serie. */
  mesesBajando: number;
  /** Meses usados para «antes» y «ahora» (AAAA-MM). */
  tramoAntes: string[];
  tramoAhora: string[];
  /** Una frase para leer de corrido. */
  resumen: string;
};

export const MIN_MESES_TENDENCIA = 4;
export const CAMBIO_SIGNIFICATIVO = 25;
export const CAIDA_VS_CARTA = 15;
/** Menos de esto por semana (~6 al mes) no se considera una demanda que pueda caer. */
export const SEMANAL_MINIMO = 1.4;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const mes = (m: string) => MESES[Number(m.slice(5, 7)) - 1];
const tramoTexto = (ms: string[]) => (ms.length === 0 ? "" : ms.length === 1 ? mes(ms[0]) : `${mes(ms[0])}–${mes(ms[ms.length - 1])}`);
const r1 = (n: number) => Math.round(n * 10) / 10;

const SIN_DATOS = (resumen: string): Tendencia => ({
  clase: "sin-datos", antes: null, ahora: null, cambioPct: null, cartaPct: null, mesesBajando: 0, tramoAntes: [], tramoAhora: [], resumen,
});

/** Cómo se parte la serie: los últimos 3 meses son «ahora» (con menos de 6 meses, la mitad); lo anterior es «antes». */
function partir<T>(xs: T[]): { antes: T[]; ahora: T[] } {
  const k = xs.length >= 6 ? 3 : Math.ceil(xs.length / 2);
  const ahora = xs.slice(-k);
  return { antes: xs.slice(Math.max(0, xs.length - k - k), xs.length - k), ahora };
}

const promedioSemanal = (xs: PuntoDia[]) => (xs.length === 0 ? 0 : (xs.reduce((s, x) => s + x.porDia, 0) / xs.length) * 7);

export function calcularTendencia(serie: PuntoDia[], carta?: PuntoDia[]): Tendencia {
  const completos = serie.filter((p) => p.completo).sort((a, b) => a.month.localeCompare(b.month));
  if (completos.length < MIN_MESES_TENDENCIA) {
    return SIN_DATOS(completos.length === 0 ? "Todavía no hay meses completos para medir su demanda." : `Hay solo ${completos.length} ${completos.length === 1 ? "mes completo" : "meses completos"}: hacen falta ${MIN_MESES_TENDENCIA} para ver una tendencia.`);
  }
  const { antes, ahora } = partir(completos);
  const sAntes = promedioSemanal(antes), sAhora = promedioSemanal(ahora);
  const tramoAntes = antes.map((p) => p.month), tramoAhora = ahora.map((p) => p.month);

  let mesesBajando = 0;
  for (let i = completos.length - 1; i > 0 && completos[i].porDia < completos[i - 1].porDia; i--) mesesBajando++;

  // Misma partición para la carta, por los mismos meses.
  let cartaPct: number | null = null;
  if (carta) {
    const delMes = (ms: string[]) => carta.filter((c) => c.completo && ms.includes(c.month));
    const cA = promedioSemanal(delMes(tramoAntes)), cH = promedioSemanal(delMes(tramoAhora));
    cartaPct = cA > 0 ? Math.round(((cH - cA) / cA) * 100) : null;
  }

  const base = { antes: r1(sAntes), ahora: r1(sAhora), cartaPct, mesesBajando, tramoAntes, tramoAhora };
  if (sAntes < SEMANAL_MINIMO && sAhora < SEMANAL_MINIMO) {
    const alMes = Math.round(Math.max(sAntes, sAhora) * 30 / 7);
    return { ...base, clase: "poco-siempre", cambioPct: null, resumen: `Vende muy poco desde siempre (a lo sumo ~${alMes} al mes): no es una caída, nunca despegó.` };
  }
  const cambioPct = sAntes > 0 ? Math.round(((sAhora - sAntes) / sAntes) * 100) : null;
  const rango = `entre ${tramoTexto(tramoAntes)} y ${tramoTexto(tramoAhora)}`;
  const cartaTxt = cartaPct === null ? "" : ` La carta completa ${cartaPct >= 0 ? "subió" : "bajó"} ${Math.abs(cartaPct)}% en ese tiempo.`;
  if (cambioPct === null) {
    // No vendía antes y ahora sí: despega.
    return { ...base, clase: "subiendo", cambioPct: null, resumen: `Antes no vendía y ahora vende ~${r1(sAhora)} por semana (${tramoTexto(tramoAhora)}).` };
  }
  const peorQueCarta = cartaPct === null ? true : ((1 + cambioPct / 100) / (1 + cartaPct / 100) - 1) * 100 <= -CAIDA_VS_CARTA;
  if (cambioPct <= -CAMBIO_SIGNIFICATIVO && peorQueCarta) {
    const seguidos = mesesBajando >= 2 ? ` Lleva ${mesesBajando} meses seguidos bajando.` : "";
    return { ...base, clase: "cayendo", cambioPct, resumen: `Viene cayendo: de ${r1(sAntes)} a ${r1(sAhora)} por semana (${cambioPct}%) ${rango}.${seguidos}${cartaTxt}` };
  }
  if (cambioPct >= CAMBIO_SIGNIFICATIVO) {
    return { ...base, clase: "subiendo", cambioPct, resumen: `Viene subiendo: de ${r1(sAntes)} a ${r1(sAhora)} por semana (+${cambioPct}%) ${rango}.${cartaTxt}` };
  }
  const explica = cambioPct <= -CAMBIO_SIGNIFICATIVO ? ` Bajó ${Math.abs(cambioPct)}%, pero casi igual que toda la carta: no es solo de este producto.` : "";
  return { ...base, clase: "estable", cambioPct, resumen: `Se mantiene en ~${r1(sAhora)} por semana (${cambioPct > 0 ? "+" : ""}${cambioPct}% ${rango}).${explica}` };
}

export const TEXTO_TENDENCIA: Record<ClaseTendencia, { corto: string; tono: "rojo" | "verde" | "ambar" | "gris" }> = {
  cayendo: { corto: "cae", tono: "rojo" },
  subiendo: { corto: "sube", tono: "verde" },
  estable: { corto: "estable", tono: "gris" },
  "poco-siempre": { corto: "poco, siempre", tono: "ambar" },
  "sin-datos": { corto: "sin historia", tono: "gris" },
};

/**
 * La recta que mejor sigue los puntos (mínimos cuadrados), para dibujarla sobre el gráfico.
 * Devuelve el valor en cada posición 0..n−1 (null si hay menos de 2 puntos).
 */
export function rectaDeTendencia(valores: number[]): number[] | null {
  const n = valores.length;
  if (n < 2) return null;
  const mx = (n - 1) / 2, my = valores.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  valores.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  const b = den === 0 ? 0 : num / den;
  return valores.map((_, i) => Math.max(0, my + b * (i - mx)));
}

export type Evidencia = { tono: "rojo" | "verde" | "ambar" | "gris"; titulo: string };

/**
 * Qué dice la historia de las sedes juntas sobre un candidato: la frase que
 * confirma (o frena) la decisión de sacarlo.
 */
export function evidenciaDe(items: { sede: string; tendencia: Tendencia }[]): Evidencia {
  const con = items.filter((x) => x.tendencia.clase !== "sin-datos");
  if (con.length === 0) return { tono: "gris", titulo: "Todavía no hay historia suficiente para ver una tendencia." };
  const lista = (xs: { sede: string }[]) => xs.map((x) => x.sede).join(" y ");
  const cae = con.filter((x) => x.tendencia.clase === "cayendo");
  const sube = con.filter((x) => x.tendencia.clase === "subiendo");
  const poco = con.filter((x) => x.tendencia.clase === "poco-siempre");
  if (sube.length > 0) return { tono: "verde", titulo: `Ojo: viene subiendo en ${lista(sube)}. Piénsalo antes de sacarlo.` };
  if (cae.length === con.length) {
    return { tono: "rojo", titulo: con.length > 1 ? "Tendencia negativa confirmada en las dos sedes: la demanda baja desde hace meses." : `Tendencia negativa confirmada en ${con[0].sede}: la demanda baja desde hace meses.` };
  }
  if (cae.length > 0) return { tono: "ambar", titulo: `Cae en ${lista(cae)}; en el resto no hay una caída clara.` };
  if (poco.length === con.length) return { tono: "ambar", titulo: "Vende poco desde siempre: no es una caída, nunca despegó." };
  return { tono: "gris", titulo: "Sin caída clara: la demanda se mantiene." };
}
