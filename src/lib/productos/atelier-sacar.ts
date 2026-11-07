/**
 * «Qué sacar» de ATELIER · MOTOR (puro). Pedido de Jahnn (7-nov-2026): lo de las cafeterías (B2C, lo que ve el cliente) y lo
 * de Atelier (B2B, nadie ve un menú) se miran por separado.
 *
 * La demanda de un producto de Atelier viene de dos canales que Byte distingue por el prefijo del nombre (confirmado por Luis,
 * 22-oct-2026): «Y-» = lo que piden las cafeterías, «P-» = otros clientes B2B, sin prefijo = sub-recetas (no se deciden aquí).
 * Aquí se juntan los dos canales de un mismo producto para decidir si vale la pena PRODUCIRLO: lo que se produce cuesta
 * insumos, tiempo y energía, y se pierde si no se vende.
 *
 * Reglas (las mismas que las cafeterías, con los 3 meses más recientes y la caída del último mes):
 *   vende poco 35 · deja poco 25 (pierde 30) · cayendo ≥40% 25 / ≥20% 15 · rota <3 por semana 15. ≥55 sacar, 35–54 revisar.
 * Producto nuevo (menos de 2 meses con ventas) no se juzga.
 */

import { claveByte, enlazarCosto, parecido, type CostoCarta } from "./costos-carta";
import { insumoPerecible, pesoDeMantener, DIAS_MES_COMPLETO } from "./candidatos";
import { calcularTendencia, type Tendencia } from "./tendencia";
import { canalDeLinea } from "../product-matching";

export type MesAtelier = {
  month: string;
  dias: number;
  /** Un mes cuyo reporte no cuadra con la venta diaria de Byte no cuenta (ver trimestral.ts). */
  sospechoso: boolean;
  filas: { nombre: string; unidades: number; ingresos: number }[];
};

export type VeredictoAtelier = "sacar" | "revisar" | "bien" | "nuevo";

export type ItemAtelier = {
  clave: string;
  nombre: string;
  veredicto: VeredictoAtelier;
  puntos: number;
  /** Unidades por semana en la ventana: total y de cada canal. */
  semana: { total: number; cafeterias: number; b2b: number };
  /** De dónde viene la demanda (% de las unidades que piden las cafeterías). */
  pctCafeterias: number | null;
  precio: number | null;
  costo: number | null;
  /** Ganancia de un mes (30 días) entre los dos canales; null si falta el costo. */
  gananciaMes: number | null;
  variacion: number | null;
  tendencia: Tendencia;
  porMes: { month: string; completo: boolean; cafeterias: number; b2b: number }[];
  insumosExclusivos: string[];
  compras: { insumo: string; otros: string[] }[];
  esfuerzo: number;
  porQue: string;
};

export type ResultadoAtelier = {
  items: ItemAtelier[];
  meses: string[];
  /** Productos con costo conocido / total de unidades (para decir cuánto se sabe de rentabilidad). */
  coberturaCosto: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** El nombre sin el prefijo de canal ni la marca de eliminado: «Y-BROWNIE» y «P-BROWNIE» son el mismo producto. */
export const nombreSinCanal = (nombre: string) =>
  nombre.replace(/^\s*\[[^\]]*\]\s*/, "").replace(/^\s*[YP]\s*-\s*/i, "").trim();

function percentil(v: number, todos: number[]): number {
  if (todos.length === 0) return 0.5;
  return todos.filter((x) => x < v).length / todos.length;
}

/**
 * @param meses los meses cargados de Atelier (del más antiguo al más reciente)
 * @param costos la lista de costos_carta (origen Atelier lleva sus insumos); `costoInsumos` ya puesto en los AT-
 */
export function armarAtelier(meses: MesAtelier[], costos: CostoCarta[], vinculos: Map<string, string>): ResultadoAtelier {
  const validos = meses.filter((m) => !m.sospechoso && m.dias > 0 && m.filas.length > 0);
  const ventana = validos.slice(-3);
  const diasVentana = ventana.reduce((s, m) => s + m.dias, 0);

  type Acum = { nombre: string; mejor: number; porMes: Map<string, { y: number; p: number; ingY: number; ingP: number }> };
  const productos = new Map<string, Acum>();
  for (const m of validos) {
    for (const f of m.filas) {
      const canal = canalDeLinea(f.nombre);
      if (!canal) continue; // sub-recetas: no se deciden aquí
      const limpio = nombreSinCanal(f.nombre);
      const k = claveByte(limpio);
      if (!k || /\beliminado\b/i.test(f.nombre)) continue;
      const a = productos.get(k) ?? { nombre: limpio, mejor: 0, porMes: new Map() };
      const x = a.porMes.get(m.month) ?? { y: 0, p: 0, ingY: 0, ingP: 0 };
      if (canal === "Y") { x.y += f.unidades; x.ingY += f.ingresos; } else { x.p += f.unidades; x.ingP += f.ingresos; }
      a.porMes.set(m.month, x);
      if (f.ingresos > a.mejor) { a.nombre = limpio; a.mejor = f.ingresos; }
      productos.set(k, a);
    }
  }

  const listaAtelier = costos.filter((c) => (c.origen ?? "").toLowerCase().startsWith("atelier"));
  const usan = new Map<string, Set<string>>();
  for (const c of costos) for (const i of c.insumos ?? []) usan.set(i.nombre, (usan.get(i.nombre) ?? new Set()).add(c.nombre));

  const base = [...productos.entries()].map(([clave, a]) => {
    const porMes = validos.map((m) => {
      const x = a.porMes.get(m.month) ?? { y: 0, p: 0, ingY: 0, ingP: 0 };
      return { month: m.month, completo: m.dias >= DIAS_MES_COMPLETO, dias: m.dias, y: x.y, p: x.p, ing: x.ingY + x.ingP };
    });
    const enVentana = porMes.slice(-ventana.length);
    const uY = enVentana.reduce((s, x) => s + x.y, 0), uP = enVentana.reduce((s, x) => s + x.p, 0);
    const ing = enVentana.reduce((s, x) => s + x.ing, 0);
    const unidades = uY + uP;
    const unidadesDia = diasVentana > 0 ? unidades / diasVentana : 0;
    const precio = unidades > 0 ? ing / unidades : null;
    const enlace = enlazarCosto(a.nombre, listaAtelier, vinculos, null);
    const costo = enlace?.item.costoInsumos ?? null;
    const margen = precio !== null && costo !== null ? precio - costo : null;
    const mesesVendiendo = porMes.filter((x) => x.y + x.p > 0).length;
    return { clave, a, porMes, uY, uP, unidades, unidadesDia, precio, costo, margen, enlace, mesesVendiendo };
  }).filter((b) => b.unidades > 0);

  const ventas = base.map((b) => b.unidadesDia);
  const ganancias = base.filter((b) => b.margen !== null).map((b) => b.unidadesDia * b.margen!);
  const mediana = (v: number[]) => { const s = [...v].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const tipicaVenta = mediana(ventas), tipicaGanancia = mediana(ganancias);

  let total = 0, conCosto = 0;
  const items: ItemAtelier[] = base.map((b) => {
    total += b.unidades;
    if (b.costo !== null) conCosto += b.unidades;
    const gananciaDia = b.margen !== null ? b.unidadesDia * b.margen : null;
    const percentilVenta = percentil(b.unidadesDia, ventas);
    const percentilGanancia = gananciaDia !== null ? percentil(gananciaDia, ganancias) : null;

    const serie = b.porMes.map((x) => ({ month: x.month, completo: x.completo, porDia: (x.y + x.p) / x.dias }));
    const ultimo = b.porMes[b.porMes.length - 1];
    const previos = b.porMes.slice(-3, -1);
    const promPrevio = previos.length ? previos.reduce((s, x) => s + (x.y + x.p) / x.dias, 0) / previos.length : 0;
    const unidadesMesPrevio = promPrevio * 30;
    const variacion = previos.length > 0 && promPrevio > 0 && ultimo && unidadesMesPrevio >= 6
      ? Math.round((((ultimo.y + ultimo.p) / ultimo.dias - promPrevio) / promPrevio) * 100) : null;

    let puntos = 0;
    if (percentilVenta <= 0.2 && b.unidadesDia < tipicaVenta * 0.5) puntos += 35;
    else if (percentilVenta <= 0.35 && b.unidadesDia < tipicaVenta) puntos += 15;
    if (b.margen !== null && b.margen <= 0) puntos += 30;
    else if (percentilGanancia !== null && percentilGanancia <= 0.2 && gananciaDia! < tipicaGanancia * 0.5) puntos += 25;
    else if (percentilGanancia !== null && percentilGanancia <= 0.35 && gananciaDia! < tipicaGanancia) puntos += 12;
    if (variacion !== null && variacion <= -40) puntos += 25; else if (variacion !== null && variacion <= -20) puntos += 15;
    const semana = b.unidadesDia * 7;
    if (semana < 3) puntos += 15; else if (semana < 7) puntos += 8;
    puntos = Math.min(100, puntos);

    const nuevo = b.mesesVendiendo < 2;
    const veredicto: VeredictoAtelier = nuevo ? "nuevo" : puntos >= 55 ? "sacar" : puntos >= 35 ? "revisar" : "bien";

    const insumos = b.enlace?.item.insumos ?? [];
    const exclusivos = insumos.filter((i) => i.exclusivo).map((i) => i.nombre);
    const propios = new Set([claveByte(b.a.nombre), claveByte(b.enlace?.item.nombre ?? "")]);
    const compras = insumos.filter((i) => insumoPerecible(i.nombre)).map((i) => ({
      insumo: i.nombre, otros: [...(usan.get(i.nombre) ?? [])].filter((n) => !propios.has(claveByte(n))).slice(0, 6),
    }));
    const pctCafeterias = b.unidades > 0 ? Math.round((b.uY / b.unidades) * 100) : null;
    const porSemana = (u: number) => (diasVentana > 0 ? r2((u / diasVentana) * 7) : 0);

    const partes: string[] = [];
    if (veredicto === "sacar" || veredicto === "revisar") {
      partes.push(`Se vende ${r2(semana)} por semana`);
      if (pctCafeterias !== null) partes.push(pctCafeterias >= 70 ? "casi todo lo piden las cafeterías (se decide con su carta)" : pctCafeterias <= 30 ? "casi todo es B2B externo" : `${pctCafeterias}% lo piden las cafeterías y el resto es B2B`);
      if (variacion !== null && variacion <= -20) partes.push(`el último mes cayó ${Math.abs(variacion)}%`);
    }
    return {
      clave: b.clave, nombre: b.a.nombre, veredicto, puntos,
      semana: { total: porSemana(b.unidades), cafeterias: porSemana(b.uY), b2b: porSemana(b.uP) },
      pctCafeterias, precio: b.precio !== null ? r2(b.precio) : null, costo: b.costo !== null ? r2(b.costo) : null,
      gananciaMes: gananciaDia !== null ? Math.round(gananciaDia * 30) : null,
      variacion, tendencia: calcularTendencia(serie.map((x) => ({ month: x.month, completo: x.completo, porDia: x.porDia })), []),
      porMes: b.porMes.map((x) => ({ month: x.month, completo: x.completo, cafeterias: (x.y / x.dias) * 7, b2b: (x.p / x.dias) * 7 })),
      insumosExclusivos: exclusivos, compras, esfuerzo: 2 + Math.min(exclusivos.length, 2) * 0.5,
      porQue: partes.join(" · ") + (partes.length ? "." : ""),
    };
  });

  items.sort((a, b) => {
    const orden: Record<VeredictoAtelier, number> = { sacar: 0, revisar: 1, nuevo: 2, bien: 3 };
    return orden[a.veredicto] - orden[b.veredicto]
      || (a.veredicto === "sacar" ? pesoDeMantener(b) - pesoDeMantener(a) : 0)
      || b.puntos - a.puntos;
  });
  return { items, meses: validos.map((m) => m.month), coberturaCosto: total > 0 ? Math.round((conCosto / total) * 100) : 0 };
}

/**
 * Lo que pasa en Atelier si una cafetería deja de vender un producto que Atelier hace: cuántas unidades por semana
 * dejarían de pedirle las cafeterías y cuántas seguiría vendiendo B2B. null si no se encuentra el producto en Atelier.
 */
export function efectoEnAtelier(nombreCafeteria: string, items: ItemAtelier[]): { nombre: string; cafeterias: number; b2b: number } | null {
  let mejor: { it: ItemAtelier; p: number } | null = null;
  for (const it of items) {
    const p = parecido(nombreCafeteria, it.nombre);
    if (p >= 0.8 && (!mejor || p > mejor.p)) mejor = { it, p };
  }
  return mejor ? { nombre: mejor.it.nombre, cafeterias: mejor.it.semana.cafeterias, b2b: mejor.it.semana.b2b } : null;
}
