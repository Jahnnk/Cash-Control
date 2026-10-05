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
 * No entran: acompañamientos, productos nuevos (menos de 2 meses) ni los que ya
 * dejaron de venderse (esos están en «Candidatos a reemplazo»); los que no tienen
 * costo se cuentan aparte, porque sin costo no hay eje vertical.
 */

import type { Familia } from "./panorama";
import type { ProductoEnSede } from "./candidatos";
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
  serie: PuntoDia[];
};

export type ProductoMatriz = { clave: string; nombre: string; familia: Familia; sedes: ProductoMatrizSede[] };

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
  /** Los que no se juzgan (nuevos, sin ventas, de una sola sede cuando se filtra). */
  fuera: number;
};

export type AlcanceMatriz = { sedeId: number | null; familia: Familia | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

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
  let fuera = 0;
  for (const p of productos) {
    if (alcance.familia !== null && p.familia !== alcance.familia) continue;
    const sedes = p.sedes.filter((s) => idsAlcance.has(s.businessId));
    if (sedes.length === 0) continue;
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
      tendencia, serie, lectura: lecturaDe(cuadrante, tendencia.clase),
    };
  });

  const totalVenta = puntos.reduce((t, x) => t + x.ventaMes, 0) || 1;
  const totalGanancia = puntos.reduce((t, x) => t + x.gananciaMes, 0) || 1;
  const cuadrantes = Object.fromEntries(ORDEN_CUADRANTES.map((c) => {
    const xs = puntos.filter((x) => x.cuadrante === c);
    const ventaMes = xs.reduce((t, x) => t + x.ventaMes, 0), gananciaMes = xs.reduce((t, x) => t + x.gananciaMes, 0);
    return [c, { n: xs.length, ventaMes, gananciaMes, pctVenta: Math.round((ventaMes / totalVenta) * 100), pctGanancia: Math.round((gananciaMes / totalGanancia) * 100) }];
  })) as Record<Cuadrante, ResumenCuadrante>;

  return { puntos, cortes, cuadrantes, sinCosto, fuera };
}
