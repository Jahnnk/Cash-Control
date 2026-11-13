/**
 * Comparativo por sede y categoría en un periodo de meses elegido (pedido de Jahnn, 13-nov-2026): «en pastelería
 * trabajaron 2 personas hasta agosto y 1 desde septiembre; ¿eso influye en la baja de ventas de pastelería?». Lógica pura.
 *
 * Sale del mismo historial del buscador de producto (lib/productos/historial-producto.ts: reportes de rotación de Byte,
 * sede por sede y mes a mes) y de las categorías que se deducen del nombre (lib/productos/panorama.ts).
 *
 *   · Todo se compara POR DÍA: un mes a medias o con menos días cargados no parece una caída.
 *   · Un mes cuyo reporte no cuadra con Byte se muestra marcado y NO entra al «antes y después».
 *   · Cada categoría va junto a «% de la sede»: si la categoría baja pero su parte de la venta no, bajó toda la sede,
 *     no la categoría. Esa es la pregunta que separa «pasó algo en pastelería» de «se vendió menos de todo».
 */

import { familiaDeProducto, FAMILIAS, type Familia } from "./panorama";
import type { HistorialProductos, ProductoHistorial } from "./historial-producto";

export const TODAS = "Todas" as const;
export type FiltroFamilia = Familia | typeof TODAS;

const dias = (desde: string | null, hasta: string | null) =>
  desde && hasta ? Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1 : 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export type CeldaMes = {
  mes: string;
  venta: number; unidades: number;
  /** Días que cubre el reporte de la sede en ese mes (0 = sin reporte). */
  dias: number;
  ventaDia: number; unidadesDia: number;
  /** Qué parte de la venta de la sede es (null en la fila del total o sin venta). */
  pctSede: number | null;
  confiable: boolean;
  /** El mes en curso: todavía no termina. */
  aMedias: boolean;
};

export type FilaComparativo = { sedeId: number; sede: string; familia: FiltroFamilia; serie: CeldaMes[] };

export type Comparativo = {
  meses: string[];
  /** Una fila por sede y categoría con venta en el periodo (categoría «Todas» = el total de la sede). */
  filas: FilaComparativo[];
};

const familiaDe = new Map<string, Familia>();
function familia(p: ProductoHistorial): Familia {
  let f = familiaDe.get(p.clave);
  if (!f) { f = familiaDeProducto(p.nombre); familiaDe.set(p.clave, f); }
  return f;
}

/** Los meses del historial entre `desde` y `hasta` (los dos incluidos, en cualquier orden). */
export function mesesDelRango(h: HistorialProductos, desde: string, hasta: string): string[] {
  const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  return h.meses.filter((m) => m >= a && m <= b);
}

export function comparativo(h: HistorialProductos, desde: string, hasta: string): Comparativo {
  const meses = mesesDelRango(h, desde, hasta);
  const mesActual = h.hoy.slice(0, 7);
  const filas: FilaComparativo[] = [];
  for (const s of h.sedes) {
    const info = new Map(s.meses.map((m) => [m.mes, m]));
    // sede → familia → mes → {u, r}
    const porFamilia = new Map<FiltroFamilia, Map<string, { u: number; r: number }>>();
    const sumar = (f: FiltroFamilia, mes: string, u: number, r: number) => {
      let m = porFamilia.get(f); if (!m) { m = new Map(); porFamilia.set(f, m); }
      const c = m.get(mes) ?? { u: 0, r: 0 }; c.u += u; c.r += r; m.set(mes, c);
    };
    for (const p of h.productos) {
      const v = p.ventas[s.id];
      if (!v) continue;
      for (const mes of meses) { const c = v[mes]; if (c) { sumar(familia(p), mes, c.u, c.r); sumar(TODAS, mes, c.u, c.r); } }
    }
    const total = porFamilia.get(TODAS);
    if (!total) continue;
    for (const f of [TODAS, ...FAMILIAS] as FiltroFamilia[]) {
      const datos = porFamilia.get(f);
      if (!datos) continue;
      filas.push({
        sedeId: s.id, sede: s.nombre, familia: f,
        serie: meses.map((mes): CeldaMes => {
          const c = datos.get(mes) ?? { u: 0, r: 0 };
          const mi = info.get(mes);
          const d = dias(mi?.desde ?? null, mi?.hasta ?? null);
          const t = total.get(mes)?.r ?? 0;
          return {
            mes, venta: r2(c.r), unidades: c.u, dias: d, ventaDia: d > 0 ? c.r / d : 0, unidadesDia: d > 0 ? c.u / d : 0,
            pctSede: f !== TODAS && t > 0 ? r1((c.r / t) * 100) : null, confiable: mi?.confiable ?? true, aMedias: mes >= mesActual && d > 0,
          };
        }),
      });
    }
  }
  return { meses, filas };
}

export type Tramo = { meses: string[]; dias: number; ventaDia: number; unidadesDia: number; /** Parte de la venta de la sede en el tramo. */ pctSede: number | null };

export type AntesDespues = {
  antes: Tramo; despues: Tramo;
  /** Cambio de la venta por día y de las unidades por día (null = falta un lado). */
  cambioVentaPct: number | null;
  cambioUnidadesPct: number | null;
  /** Cambio de su parte de la venta de la sede, en puntos. */
  cambioPctSede: number | null;
};

function tramo(serie: CeldaMes[], total: CeldaMes[] | null): Tramo {
  const ok = serie.filter((c) => c.confiable && c.dias > 0);
  const d = ok.reduce((t, c) => t + c.dias, 0), venta = ok.reduce((t, c) => t + c.venta, 0), u = ok.reduce((t, c) => t + c.unidades, 0);
  const ventaSede = total ? total.filter((c) => ok.some((x) => x.mes === c.mes)).reduce((t, c) => t + c.venta, 0) : 0;
  return { meses: ok.map((c) => c.mes), dias: d, ventaDia: d > 0 ? venta / d : 0, unidadesDia: d > 0 ? u / d : 0, pctSede: total && ventaSede > 0 ? r1((venta / ventaSede) * 100) : null };
}

const cambio = (a: number, b: number, hay: boolean) => (hay && a > 0 ? r1(((b - a) / a) * 100) : null);

/**
 * La fila partida en dos: los meses ANTES de `corte` y los meses desde `corte` (incluido). `total` = la fila «Todas» de la
 * misma sede (para la parte de la venta); null si la fila ya es el total.
 */
export function antesDespues(serie: CeldaMes[], corte: string, total: CeldaMes[] | null): AntesDespues {
  const a = tramo(serie.filter((c) => c.mes < corte), total), d = tramo(serie.filter((c) => c.mes >= corte), total);
  const hay = a.dias > 0 && d.dias > 0;
  return {
    antes: a, despues: d,
    cambioVentaPct: cambio(a.ventaDia, d.ventaDia, hay), cambioUnidadesPct: cambio(a.unidadesDia, d.unidadesDia, hay),
    cambioPctSede: hay && a.pctSede !== null && d.pctSede !== null ? r1(d.pctSede - a.pctSede) : null,
  };
}

export type ProductoCambio = { clave: string; nombre: string; antesDia: number; despuesDia: number; /** despuesDia − antesDia, en S/ por día. */ cambioDia: number };

/** Los productos de una sede y categoría, del que más bajó su venta por día al que más subió. */
export function productosQueCambian(h: HistorialProductos, sedeId: number, f: FiltroFamilia, desde: string, hasta: string, corte: string): ProductoCambio[] {
  const s = h.sedes.find((x) => x.id === sedeId);
  if (!s) return [];
  const meses = mesesDelRango(h, desde, hasta);
  const info = new Map(s.meses.map((m) => [m.mes, m]));
  const validos = meses.filter((m) => { const mi = info.get(m); return mi && mi.confiable && dias(mi.desde, mi.hasta) > 0; });
  const diasDe = (l: string[]) => l.reduce((t, m) => t + dias(info.get(m)!.desde, info.get(m)!.hasta), 0);
  const mA = validos.filter((m) => m < corte), mD = validos.filter((m) => m >= corte);
  const dA = diasDe(mA), dD = diasDe(mD);
  if (dA === 0 || dD === 0) return [];
  const out: ProductoCambio[] = [];
  for (const p of h.productos) {
    const v = p.ventas[sedeId];
    if (!v || (f !== TODAS && familia(p) !== f)) continue;
    const suma = (l: string[]) => l.reduce((t, m) => t + (v[m]?.r ?? 0), 0);
    const antesDia = suma(mA) / dA, despuesDia = suma(mD) / dD;
    if (antesDia === 0 && despuesDia === 0) continue;
    out.push({ clave: p.clave, nombre: p.nombre, antesDia: r2(antesDia), despuesDia: r2(despuesDia), cambioDia: r2(despuesDia - antesDia) });
  }
  return out.sort((a, b) => a.cambioDia - b.cambioDia);
}
