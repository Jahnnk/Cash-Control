/**
 * Matriz de la carta (BCG / ingeniería de menú) · MOTOR (puro).
 *
 * Pedido de Jahnn (5-oct-2026): con los reportes de abril a setiembre, ubicar cada
 * producto en la matriz de 4 cajas —estrella, vaca, interrogante, perro— para ver
 * qué potenciar, qué mantener, qué probar y qué reemplazar.
 *
 *   Eje horizontal — VENTAS: unidades por semana (la demanda real; el precio no la distorsiona).
 *   Eje vertical   — ATRACTIVO: lo que deja cada venta (precio − costo, en S/).
 *
 * Corte = la MEDIANA de lo que se está mirando (la carta entera, una familia o una
 * sede): mitad arriba, mitad abajo. Es relativo a propósito: un café y una torta no
 * se miden contra lo mismo cuando se filtra por familia.
 *
 *   ESTRELLA       vende mucho y deja mucho    → Potenciar
 *   VACA           vende mucho, deja poco      → Mantener y rentabilizar (precio o costo)
 *   INTERROGANTE   vende poco, deja mucho      → Probar / impulsar (vitrina, oferta)
 *   PERRO          vende poco y deja poco      → Reemplazar / retirar
 *
 * La TENDENCIA (tendencia.ts) no es un eje: es la prueba que confirma o frena la
 * decisión. Un perro que además viene cayendo se reemplaza con seguridad; una
 * estrella que cae es una alarma; un perro que sube se observa.
 *
 * No entran: acompañamientos, ni los que ya dejaron de venderse (esos están en
 * «Candidatos a reemplazo»); los que no tienen costo se cuentan aparte, porque sin
 * costo no hay eje vertical.
 *
 * PRODUCTOS NUEVOS (regla de Jahnn, 5-oct-2026): un producto que salió hace menos de
 * 3 meses está «en prueba»: no se le pone caja ni se le dice «reemplazar» (no es lo
 * mismo uno que en 6 meses no vende que uno de 2 semanas). Se muestra aparte, con
 * cuántos días lleva, a qué ritmo vende contra lo típico de su familia y qué señal
 * da: muy pronto / va muy bien / buena / regular / poca acogida. El veredicto llega a
 * los 90 días. Lo bueno se ve antes que lo malo: un ritmo alto se puede creer a las
 * 2 semanas (un nuevo que vende más que lo típico de su familia «va muy bien» y se
 * destaca); un ritmo bajo puede ser solo el arranque y espera al mes. Así un producto
 * nuevo que pega no queda escondido detrás de «no se juzga».
 */

import type { Familia } from "./panorama";
import type { ProductoEnSede, PruebaProducto } from "./candidatos";
import { calcularTendencia, type PuntoDia, type Tendencia } from "./tendencia";

export type CartaSede = { businessId: number; sede: string; serie: PuntoDia[] };

export type ProductoMatrizSede = {
  businessId: number;
  sede: string;
  estado: ProductoEnSede["estado"];
  unidadesDia: number;
  unidadesSemana: number;
  ventaDia: number;
  precio: number | null;
  costo: number | null;
  gananciaDia: number | null;
  /** Producto nuevo en su período de prueba (null = ya se puede juzgar). */
  prueba: PruebaProducto | null;
  serie: PuntoDia[];
};

export type ProductoMatriz = {
  clave: string; nombre: string; familia: Familia;
  /** Fecha exacta de lanzamiento anotada por Jahnn (null = no anotada). */
  lanzamiento: string | null;
  sedes: ProductoMatrizSede[];
};

export type Cuadrante = "estrella" | "vaca" | "interrogante" | "perro";

export const CUADRANTES: Record<Cuadrante, { nombre: string; accion: string; ventas: "altas" | "bajas"; atractivo: "alto" | "bajo" }> = {
  estrella: { nombre: "Estrella", accion: "Potenciar", ventas: "altas", atractivo: "alto" },
  vaca: { nombre: "Vaca", accion: "Mantener y rentabilizar", ventas: "altas", atractivo: "bajo" },
  interrogante: { nombre: "Interrogante", accion: "Probar / impulsar", ventas: "bajas", atractivo: "alto" },
  perro: { nombre: "Perro", accion: "Reemplazar / retirar", ventas: "bajas", atractivo: "bajo" },
};

export const ORDEN_CUADRANTES: Cuadrante[] = ["estrella", "vaca", "interrogante", "perro"];

export type PuntoMatriz = {
  clave: string;
  nombre: string;
  familia: Familia;
  cuadrante: Cuadrante;
  /** Unidades por semana (suma de las sedes elegidas). */
  unidadesSemana: number;
  /** Lo que deja cada venta, en S/ (precio − costo). */
  margenUnidad: number;
  margenPct: number | null;
  precio: number | null;
  /** Ganancia y venta de un mes de 30 días. */
  gananciaMes: number;
  ventaMes: number;
  tendencia: Tendencia;
  /** Fecha exacta de lanzamiento anotada (null = no anotada). */
  lanzamiento: string | null;
  /** Unidades por día, mes a mes (suma de las sedes elegidas), para el gráfico. */
  serie: PuntoDia[];
  lectura: string;
};

export type ResumenCuadrante = { n: number; ventaMes: number; gananciaMes: number; pctVenta: number; pctGanancia: number };

export type Matriz = {
  puntos: PuntoMatriz[];
  /** Mediana de unidades por semana y de S/ por unidad: donde se cruzan los ejes. */
  cortes: { unidadesSemana: number; margenUnidad: number };
  cuadrantes: Record<Cuadrante, ResumenCuadrante>;
  /** Productos que se venden pero no tienen costo: no se pueden ubicar. */
  sinCosto: { clave: string; nombre: string; unidadesSemana: number }[];
  /** Los que no se juzgan (sin ventas, de una sola sede cuando se filtra). */
  fuera: number;
  /** Productos nuevos en su período de prueba: sin caja, con su señal de acogida. */
  enPrueba: PuntoPrueba[];
};

export type SenalPrueba = "pronto" | "destaca" | "buena" | "regular" | "poca";

export type PuntoPrueba = {
  clave: string;
  nombre: string;
  familia: Familia;
  /** Día de la prueba en que va y de cuántos (90). */
  dia: number;
  de: number;
  inicio: string;
  /** La fecha de salida es la exacta que anotó Jahnn (si no, es una estimación). */
  fechaAnotada: boolean;
  /** Desde cuándo se puede juzgar (inicio + 90 días). */
  evaluarEl: string;
  unidadesSemana: number;
  margenUnidad: number | null;
  gananciaMes: number | null;
  /** Lo que aporta como % de lo típico (mediana) de su familia: ganancia al mes si hay costo, si no unidades. */
  ritmoPct: number | null;
  /** Lo que deja por venta comparado con lo típico de su familia. */
  margen: "bien" | "poco" | null;
  senal: SenalPrueba;
  /** En qué caja caería si ya se juzgara (null si no tiene costo). */
  cajaProvisional: Cuadrante | null;
  /** Una frase para leer de corrido. */
  texto: string;
  serie: PuntoDia[];
};

/** Antes de este día de prueba (un mes) lo flojo no se opina: puede ser solo el arranque. */
export const DIAS_MINIMOS_SENAL = 30;
/** Lo bueno sí se ve desde las 2 semanas: un ritmo alto no es casualidad de arranque. */
export const DIAS_SENAL_POSITIVA = 14;
/** Vende/aporta al menos lo típico de su familia: «va muy bien». */
export const ACOGIDA_DESTACA = 100;
/** Señal de acogida: lo que aporta contra lo típico de su familia (mediana de lo ya juzgado). */
export const ACOGIDA_BUENA = 60;
export const ACOGIDA_REGULAR = 30;

export type AlcanceMatriz = { sedeId: number | null; familia: Familia | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const soles = (n: number) => `S/${n.toFixed(2)}`;
const sumarDiasISO = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Qué hacer con un producto según su caja y su tendencia (una frase corta, accionable). */
export function lecturaDe(c: Cuadrante, t: Tendencia["clase"]): string {
  switch (c) {
    case "perro":
      if (t === "cayendo") return "Reemplazar: vende poco, deja poco y además viene cayendo.";
      if (t === "poco-siempre") return "Retirar: vende muy poco desde siempre y deja poco.";
      if (t === "subiendo") return "Observar: es flojo pero viene subiendo; dale un mes más.";
      return "Reemplazar o probar un cambio (precio, vitrina): vende poco y deja poco, sin mejora a la vista.";
    case "interrogante":
      if (t === "cayendo") return "Se vende cada vez menos, aunque deja bien: impúlsalo un mes (vitrina, oferta) y, si no despega, reemplázalo.";
      if (t === "subiendo") return "Impulsar: ya despega y deja bien.";
      return "Probar / impulsar: deja bien cada venta pero se vende poco (vitrina, oferta, combo).";
    case "vaca":
      if (t === "cayendo") return "Alerta: se vende mucho pero deja poco y ya empieza a caer.";
      return "Mantener y rentabilizar: se vende mucho, deja poco. Revisa precio o costo.";
    case "estrella":
      if (t === "cayendo") return "Alerta: una estrella que se apaga. Averigua qué cambió antes de perderla.";
      if (t === "subiendo") return "Potenciar: vende más cada mes y deja bien.";
      return "Potenciar: vende mucho y deja bien. Cuídala y destácala.";
  }
}

/** Suma las series de varias sedes (un mes es completo solo si lo es en todas las sedes que lo tienen). */
function sumarSeries(series: PuntoDia[][]): PuntoDia[] {
  const meses = [...new Set(series.flatMap((s) => s.map((p) => p.month)))].sort();
  return meses.map((month) => {
    const ps = series.map((s) => s.find((p) => p.month === month));
    return { month, completo: ps.every((p) => p?.completo === true), porDia: ps.reduce((t, p) => t + (p?.porDia ?? 0), 0) };
  });
}

export function armarMatriz(productos: ProductoMatriz[], cartas: CartaSede[], alcance: AlcanceMatriz): Matriz {
  const sedesAlcance = cartas.filter((c) => alcance.sedeId === null || c.businessId === alcance.sedeId);
  const idsAlcance = new Set(sedesAlcance.map((c) => c.businessId));
  const cartaSerie = sumarSeries(sedesAlcance.map((c) => c.serie));

  type Base = { p: ProductoMatriz; sedes: ProductoMatrizSede[]; unidadesSemana: number; ventaDia: number; gananciaDia: number | null; unidadesDia: number };
  const juzgables: Base[] = [];
  const nuevos: { p: ProductoMatriz; sedes: ProductoMatrizSede[] }[] = [];
  let fuera = 0;
  for (const p of productos) {
    if (alcance.familia !== null && p.familia !== alcance.familia) continue;
    const sedes = p.sedes.filter((s) => idsAlcance.has(s.businessId));
    if (sedes.length === 0) continue;
    // Nuevo en todas las sedes donde se vende: está en prueba, no se juzga.
    if (sedes.some((s) => s.prueba !== null) && !sedes.some((s) => s.prueba === null && (s.estado === "candidato" || s.estado === "observar" || s.estado === "bien"))) {
      nuevos.push({ p, sedes });
      continue;
    }
    // Se juzga lo que está vivo en alguna de las sedes elegidas.
    const vivas = sedes.filter((s) => s.estado === "candidato" || s.estado === "observar" || s.estado === "bien");
    if (vivas.length === 0) { fuera++; continue; }
    const conVenta = sedes.filter((s) => s.ventaDia > 0);
    const unidadesDia = conVenta.reduce((t, s) => t + s.unidadesDia, 0);
    const ganancia = conVenta.every((s) => s.gananciaDia !== null) && conVenta.length > 0
      ? conVenta.reduce((t, s) => t + s.gananciaDia!, 0) : null;
    juzgables.push({ p, sedes, unidadesDia, unidadesSemana: unidadesDia * 7, ventaDia: conVenta.reduce((t, s) => t + s.ventaDia, 0), gananciaDia: ganancia });
  }

  const sinCosto = juzgables.filter((b) => b.gananciaDia === null || b.unidadesDia <= 0)
    .map((b) => ({ clave: b.p.clave, nombre: b.p.nombre, unidadesSemana: r2(b.unidadesSemana) }))
    .sort((a, b) => b.unidadesSemana - a.unidadesSemana);
  const conCosto = juzgables.filter((b) => b.gananciaDia !== null && b.unidadesDia > 0);

  const margenDe = (b: Base) => b.gananciaDia! / b.unidadesDia;
  const cortes = { unidadesSemana: r2(mediana(conCosto.map((b) => b.unidadesSemana))), margenUnidad: r2(mediana(conCosto.map(margenDe))) };

  const puntos: PuntoMatriz[] = conCosto.map((b) => {
    const margen = margenDe(b);
    const cuadrante: Cuadrante = b.unidadesSemana >= cortes.unidadesSemana
      ? (margen >= cortes.margenUnidad ? "estrella" : "vaca")
      : (margen >= cortes.margenUnidad ? "interrogante" : "perro");
    const serie = sumarSeries(b.sedes.map((s) => s.serie));
    const tendencia = calcularTendencia(serie.map((x) => ({ month: x.month, completo: x.completo, porDia: x.porDia })), cartaSerie);
    const precio = b.ventaDia > 0 && b.unidadesDia > 0 ? b.ventaDia / b.unidadesDia : null;
    return {
      clave: b.p.clave, nombre: b.p.nombre, familia: b.p.familia, cuadrante,
      unidadesSemana: r2(b.unidadesSemana), margenUnidad: r2(margen),
      margenPct: precio ? Math.round((margen / precio) * 100) : null, precio: precio !== null ? r2(precio) : null,
      gananciaMes: Math.round(b.gananciaDia! * 30), ventaMes: Math.round(b.ventaDia * 30),
      tendencia, serie, lanzamiento: b.p.lanzamiento, lectura: lecturaDe(cuadrante, tendencia.clase),
    };
  });

  // Lo típico de cada familia entre lo ya juzgado (si hay menos de 3, de toda la carta).
  const tipico = (familia: Familia, f: (x: PuntoMatriz) => number) => {
    const de = puntos.filter((x) => x.familia === familia);
    return mediana((de.length >= 3 ? de : puntos).map(f));
  };
  const enPrueba: PuntoPrueba[] = nuevos.map(({ p, sedes }) => {
    const conPrueba = sedes.filter((x) => x.prueba !== null);
    const unidadesSemana = r2(conPrueba.reduce((t, x) => t + x.prueba!.unidadesSemana, 0));
    const dia = Math.max(...conPrueba.map((x) => x.prueba!.dia));
    const inicio = conPrueba.map((x) => x.prueba!.inicio).sort()[0];
    const evaluarEl = sumarDiasISO(inicio, conPrueba[0].prueba!.de);
    const conCosto = sedes.find((x) => x.precio !== null && x.costo !== null);
    const margenUnidad = conCosto ? r2(conCosto.precio! - conCosto.costo!) : null;
    const gananciaMes = margenUnidad !== null ? Math.round((unidadesSemana / 7) * 30 * margenUnidad) : null;
    const tipicoVenta = puntos.length > 0 ? tipico(p.familia, (x) => x.unidadesSemana) : 0;
    const tipicoMargen = puntos.length > 0 ? tipico(p.familia, (x) => x.margenUnidad) : 0;
    const tipicoGanancia = puntos.length > 0 ? tipico(p.familia, (x) => x.gananciaMes) : 0;
    // Se mide por lo que aporta al mes (una torta entera vende pocas, pero deja mucho cada una); sin costo, por unidades.
    const ritmoPct = gananciaMes !== null && tipicoGanancia > 0 ? Math.round((gananciaMes / tipicoGanancia) * 100)
      : tipicoVenta > 0 ? Math.round((unidadesSemana / tipicoVenta) * 100) : null;
    const margen: PuntoPrueba["margen"] = margenUnidad === null || tipicoMargen <= 0 ? null : margenUnidad >= tipicoMargen ? "bien" : "poco";
    const senal: SenalPrueba = dia < DIAS_SENAL_POSITIVA || ritmoPct === null ? "pronto"
      : ritmoPct >= ACOGIDA_DESTACA ? "destaca"
      : dia < DIAS_MINIMOS_SENAL ? "pronto"
      : ritmoPct >= ACOGIDA_BUENA ? "buena" : ritmoPct >= ACOGIDA_REGULAR ? "regular" : "poca";
    const cajaProvisional: Cuadrante | null = margenUnidad === null ? null
      : unidadesSemana >= cortes.unidadesSemana ? (margenUnidad >= cortes.margenUnidad ? "estrella" : "vaca")
      : (margenUnidad >= cortes.margenUnidad ? "interrogante" : "perro");
    const cajaTxt = cajaProvisional !== null && (senal === "destaca" || senal === "buena") ? ` Si ya se juzgara caería en «${CUADRANTES[cajaProvisional].nombre}»: ${CUADRANTES[cajaProvisional].accion.toLowerCase()}.` : "";
    const vende = `Vende ~${unidadesSemana >= 10 ? unidadesSemana.toFixed(0) : unidadesSemana.toFixed(1)} por semana`;
    const ritmoTxt = gananciaMes !== null && tipicoGanancia > 0
      ? `${vende} y aporta ~S/${gananciaMes.toLocaleString("es-PE")} de ganancia al mes (${ritmoPct}% de lo típico de su familia).`
      : `${vende}${ritmoPct !== null ? ` (${ritmoPct}% de lo típico de su familia, en unidades)` : ""}.`;
    const margenTxt = margen === null ? "" : margen === "bien" ? ` Deja bien por venta (${soles(margenUnidad!)}).` : ` Deja poco por venta (${soles(margenUnidad!)}).`;
    const texto = senal === "pronto"
      ? `Lleva ${dia} días: es muy pronto para opinar. ${ritmoTxt}${margenTxt}`
      : `${senal === "destaca" ? "Va muy bien desde el inicio" : senal === "buena" ? "Buena acogida" : senal === "regular" ? "Acogida regular" : "Poca acogida por ahora"}. ${ritmoTxt}${margenTxt}${cajaTxt}`;
    return {
      clave: p.clave, nombre: p.nombre, familia: p.familia, dia, de: conPrueba[0].prueba!.de, inicio, fechaAnotada: conPrueba.every((x) => x.prueba!.origen === "anotada"), evaluarEl,
      unidadesSemana, margenUnidad, gananciaMes,
      ritmoPct, margen, senal, cajaProvisional, texto, serie: sumarSeries(sedes.map((x) => x.serie)),
    };
  }).sort((a, b) => Number(b.senal === "destaca") - Number(a.senal === "destaca") || b.dia - a.dia);

  const totalVenta = puntos.reduce((t, x) => t + x.ventaMes, 0) || 1;
  const totalGanancia = puntos.reduce((t, x) => t + x.gananciaMes, 0) || 1;
  const cuadrantes = Object.fromEntries(ORDEN_CUADRANTES.map((c) => {
    const xs = puntos.filter((x) => x.cuadrante === c);
    const ventaMes = xs.reduce((t, x) => t + x.ventaMes, 0), gananciaMes = xs.reduce((t, x) => t + x.gananciaMes, 0);
    return [c, { n: xs.length, ventaMes, gananciaMes, pctVenta: Math.round((ventaMes / totalVenta) * 100), pctGanancia: Math.round((gananciaMes / totalGanancia) * 100) }];
  })) as Record<Cuadrante, ResumenCuadrante>;

  return { puntos, cortes, cuadrantes, sinCosto, fuera, enPrueba };
}

/**
 * Las escalas del gráfico de puntos (la usan la pantalla y la lámina del deck, para que
 * dibujen lo mismo). Horizontal: unidades por semana en escala logarítmica (hay productos
 * de 0.2 y de 80 por semana). Vertical: lo que deja cada venta; llega hasta cerca del
 * percentil 95 y los pocos que dejan más (tortas enteras) se dibujan en el borde de arriba.
 */
export type EscalasMatriz = {
  /** 0 = borde izquierdo, 1 = borde derecho. */
  xFrac: (unidadesSemana: number) => number;
  /** 0 = abajo, 1 = arriba (los que pasan el tope quedan en 1). */
  yFrac: (margenUnidad: number) => number;
  xTicks: number[];
  yTicks: number[];
  /** Hasta dónde llega el eje vertical (S/ por venta). */
  yMax: number;
  /** Cuántos productos dejan más que yMax. */
  arriba: number;
};

export function escalasMatriz(puntos: Pick<PuntoMatriz, "unidadesSemana" | "margenUnidad">[], cortes: Matriz["cortes"]): EscalasMatriz {
  const us = puntos.map((p) => p.unidadesSemana).filter((v) => v > 0);
  const ms = puntos.map((p) => p.margenUnidad);
  const xMin = Math.max(0.1, Math.min(...us, cortes.unidadesSemana) * 0.7), xMax = Math.max(...us, cortes.unidadesSemana) * 1.25;
  const orden = [...ms].sort((a, b) => a - b);
  const p95 = orden[Math.min(orden.length - 1, Math.floor(orden.length * 0.95))] ?? 0;
  const yMin = Math.min(0, ...ms);
  const yMax = Math.min(Math.max(...ms, cortes.margenUnidad) * 1.1, Math.max(p95 * 1.2, cortes.margenUnidad * 2.2));
  const lmin = Math.log10(xMin), lmax = Math.log10(xMax);
  const paso = yMax > 40 ? 10 : yMax > 15 ? 5 : 2;
  const yTicks: number[] = [];
  for (let t = Math.ceil(yMin / paso) * paso; t <= yMax; t += paso) yTicks.push(t);
  return {
    xFrac: (v) => (Math.log10(Math.max(v, xMin)) - lmin) / (lmax - lmin || 1),
    yFrac: (v) => (Math.min(v, yMax) - yMin) / (yMax - yMin || 1),
    xTicks: [0.5, 1, 2, 5, 10, 20, 50, 100].filter((t) => t >= xMin && t <= xMax),
    yTicks, yMax, arriba: ms.filter((v) => v > yMax).length,
  };
}
