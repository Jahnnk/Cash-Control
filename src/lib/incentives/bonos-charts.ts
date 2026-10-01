/**
 * Gráficos del reporte de Bonos e Incentivos · SVG PURO.
 *
 * Cada función devuelve el texto de un SVG con medidas fijas. Se dibujan así
 * (y no con una librería de gráficos) por dos razones:
 *
 *   · El mismo dibujo sirve para el PDF y para el Excel: en el navegador se
 *     convierte a imagen (svg-to-png.ts) y se pega en los dos.
 *   · Son funciones puras: se prueban sin navegador y se ven igual siempre.
 *
 * Tipografía Arial (la del deck y los reportes) y solo caracteres que
 * cualquier sistema dibuja bien.
 */

// Las metas van en tonos pizarra para no confundirse con el color de cada sede
// (verde y ámbar): la línea de la sede es la protagonista, las metas son la regla.
export const COLOR_NIVEL = ["#94A3B8", "#475569", "#1E293B"] as const;
export const COLOR_BASE = "#9CA3AF";
export const COLOR_META_VENTAS = "#1E293B";
const TINTA = "#111827";
const GRIS = "#6B7280";
const REJILLA = "#E5E7EB";
const FUENTE = "Arial, Helvetica, sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const soles = (n: number, dec = 2) =>
  `S/${n.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const r1 = (n: number) => Math.round(n * 10) / 10;

export type Dibujo = { svg: string; width: number; height: number };

function envolver(width: number, height: number, cuerpo: string): Dibujo {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FUENTE}">` +
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>${cuerpo}</svg>`;
  return { svg, width, height };
}

/** Marcas "bonitas" para un eje: pasos de 1/2/5 × 10^n. */
function marcas(min: number, max: number, cuantas = 5): number[] {
  const rango = max - min || 1;
  const bruto = rango / cuantas;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 5, 10].map((f) => f * pot).find((p) => p >= bruto) ?? bruto;
  const out: number[] = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) out.push(Math.round(v / paso) * paso);
  return out;
}

export type LineaGuia = { y: number; etiqueta: string; color: string; punteada?: boolean };
export type SerieLinea = { nombre: string; color: string; puntos: (number | null)[]; grosor?: number; marcadores?: boolean; tenue?: boolean };

/**
 * Líneas por día del mes con líneas guía horizontales (metas).
 * `puntos[i]` es el valor del día i+1; null = sin dato ese día.
 */
export function graficoLineas(o: {
  titulo: string;
  subtitulo?: string;
  dias: number;
  series: SerieLinea[];
  guias?: LineaGuia[];
  /** Diagonal punteada de (día 0, 0) a (último día, valor): el ritmo necesario. */
  ritmo?: { hasta: number; etiqueta: string; color: string };
  formato: (n: number) => string;
  yMin?: number;
  yMax?: number;
  width?: number;
  height?: number;
}): Dibujo {
  const W = o.width ?? 880;
  const H = o.height ?? 330;
  const m = { l: 62, r: 150, t: 64, b: 36 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;

  const valores = [
    ...o.series.flatMap((s) => s.puntos.filter((v): v is number => v !== null)),
    ...(o.guias ?? []).map((g) => g.y),
    ...(o.ritmo ? [o.ritmo.hasta] : []),
  ];
  let yMin = o.yMin ?? Math.min(...valores);
  let yMax = o.yMax ?? Math.max(...valores);
  if (o.yMin === undefined || o.yMax === undefined) {
    const pad = (yMax - yMin || 1) * 0.12;
    if (o.yMin === undefined) yMin -= pad;
    if (o.yMax === undefined) yMax += pad;
  }
  const x = (dia: number) => m.l + (pw * (dia - 1)) / Math.max(1, o.dias - 1);
  const y = (v: number) => m.t + ph - (ph * (v - yMin)) / (yMax - yMin || 1);

  let c = "";
  c += `<text x="${m.l}" y="22" font-size="15" font-weight="bold" fill="${TINTA}">${esc(o.titulo)}</text>`;
  if (o.subtitulo) c += `<text x="${m.l}" y="40" font-size="11" fill="${GRIS}">${esc(o.subtitulo)}</text>`;

  for (const v of marcas(yMin, yMax)) {
    c += `<line x1="${m.l}" x2="${m.l + pw}" y1="${y(v)}" y2="${y(v)}" stroke="${REJILLA}"/>`;
    c += `<text x="${m.l - 8}" y="${y(v) + 4}" font-size="10.5" fill="${GRIS}" text-anchor="end">${esc(o.formato(v))}</text>`;
  }
  const paso = o.dias > 20 ? 5 : 1;
  for (let d = 1; d <= o.dias; d++) {
    if (d === 1 || d % paso === 0 || d === o.dias) {
      c += `<text x="${x(d)}" y="${H - 14}" font-size="10.5" fill="${GRIS}" text-anchor="middle">${d}</text>`;
    }
  }
  c += `<text x="${m.l + pw}" y="${H - 2}" font-size="10" fill="${GRIS}" text-anchor="end">día del mes</text>`;

  for (const g of o.guias ?? []) {
    c += `<line x1="${m.l}" x2="${m.l + pw}" y1="${y(g.y)}" y2="${y(g.y)}" stroke="${g.color}" stroke-width="1.6"${g.punteada ? ' stroke-dasharray="6 4"' : ""}/>`;
    c += `<text x="${m.l + pw + 8}" y="${y(g.y) + 4}" font-size="10.5" font-weight="bold" fill="${g.color}">${esc(g.etiqueta)}</text>`;
  }
  if (o.ritmo) {
    c += `<line x1="${x(1)}" y1="${y(0)}" x2="${x(o.dias)}" y2="${y(o.ritmo.hasta)}" stroke="${o.ritmo.color}" stroke-width="1.4" stroke-dasharray="3 4"/>`;
    c += `<line x1="${m.l}" x2="${m.l + 26}" y1="52" y2="52" stroke="${o.ritmo.color}" stroke-width="1.6" stroke-dasharray="3 4"/>`;
    c += `<text x="${m.l + 32}" y="56" font-size="10.5" fill="${GRIS}">${esc(o.ritmo.etiqueta)}</text>`;
  }

  for (const s of o.series) {
    const tramos: string[] = [];
    let actual = "";
    s.puntos.forEach((v, i) => {
      if (v === null) { if (actual) { tramos.push(actual); actual = ""; } return; }
      actual += `${actual ? "L" : "M"}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`;
    });
    if (actual) tramos.push(actual);
    for (const t of tramos) {
      c += `<path d="${t}" fill="none" stroke="${s.color}" stroke-width="${s.grosor ?? 2.6}"${s.tenue ? ' opacity="0.45"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (s.marcadores) {
      s.puntos.forEach((v, i) => {
        if (v !== null) c += `<circle cx="${x(i + 1).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${s.color}"${s.tenue ? ' opacity="0.5"' : ""}/>`;
      });
    }
    // El último valor, escrito junto a la línea.
    let ult = -1;
    s.puntos.forEach((v, i) => { if (v !== null) ult = i; });
    if (ult >= 0 && !s.tenue) {
      const v = s.puntos[ult] as number;
      c += `<circle cx="${x(ult + 1)}" cy="${y(v)}" r="4.5" fill="${s.color}"/>`;
      // Pegado al borde derecho chocaría con las etiquetas de las metas: va a la izquierda y debajo del punto
      // (arriba suele haber una línea de meta).
      const alBorde = ult + 1 >= o.dias - 2;
      c += alBorde
        ? `<text x="${x(ult + 1) - 8}" y="${y(v) + 20}" font-size="11.5" font-weight="bold" fill="${s.color}" text-anchor="end">${esc(o.formato(v))}</text>`
        : `<text x="${x(ult + 1) + 8}" y="${y(v) - 8}" font-size="11.5" font-weight="bold" fill="${s.color}">${esc(o.formato(v))}</text>`;
    }
  }
  return envolver(W, H, c);
}

export type BarraH = { etiqueta: string; valor: number; color: string; detalle?: string };

/** Barras horizontales (ej. cuánto se transfiere a cada persona). */
export function graficoBarras(o: {
  titulo: string;
  subtitulo?: string;
  barras: BarraH[];
  formato: (n: number) => string;
  width?: number;
}): Dibujo {
  const W = o.width ?? 880;
  const fila = 20;
  const m = { l: 170, r: 150, t: 54, b: 12 };
  const H = m.t + m.b + Math.max(1, o.barras.length) * fila;
  const pw = W - m.l - m.r;
  const max = Math.max(1, ...o.barras.map((b) => b.valor));

  let c = `<text x="${m.l - 150}" y="22" font-size="15" font-weight="bold" fill="${TINTA}">${esc(o.titulo)}</text>`;
  if (o.subtitulo) c += `<text x="${m.l - 150}" y="40" font-size="11" fill="${GRIS}">${esc(o.subtitulo)}</text>`;
  o.barras.forEach((b, i) => {
    const yy = m.t + i * fila;
    const w = Math.max(b.valor > 0 ? 3 : 0, (pw * b.valor) / max);
    c += `<text x="${m.l - 8}" y="${yy + 15}" font-size="11.5" fill="${TINTA}" text-anchor="end">${esc(b.etiqueta)}</text>`;
    c += `<rect x="${m.l}" y="${yy + 3}" width="${w.toFixed(1)}" height="${fila - 8}" rx="3" fill="${b.color}"/>`;
    c += `<text x="${m.l + w + 8}" y="${yy + 15}" font-size="11.5" font-weight="bold" fill="${TINTA}">${esc(o.formato(b.valor))}` +
      (b.detalle ? `<tspan font-weight="normal" fill="${GRIS}" font-size="10.5">  ${esc(b.detalle)}</tspan>` : "") + `</text>`;
  });
  return envolver(W, H, c);
}

export type GrupoAvance = { etiqueta: string; valores: { sede: string; color: string; pct: number | null }[] };

/**
 * Comparativo entre sedes: qué tan cerca (o pasado) está cada una de cada meta.
 * 100% = meta cumplida; la línea vertical marca ese punto.
 */
export function graficoAvanceMetas(o: { titulo: string; subtitulo?: string; grupos: GrupoAvance[]; width?: number }): Dibujo {
  const W = o.width ?? 880;
  const m = { l: 200, r: 120, t: 66, b: 30 };
  const altoBarra = 14;
  const altoGrupo = o.grupos[0]?.valores.length ? o.grupos[0].valores.length * (altoBarra + 3) + 16 : 40;
  const H = m.t + m.b + o.grupos.length * altoGrupo;
  const pw = W - m.l - m.r;
  const tope = Math.max(120, Math.min(220, Math.ceil(Math.max(...o.grupos.flatMap((g) => g.valores.map((v) => v.pct ?? 0))) / 20) * 20 + 20));
  const x = (pct: number) => m.l + (pw * Math.min(pct, tope)) / tope;

  let c = `<text x="24" y="22" font-size="15" font-weight="bold" fill="${TINTA}">${esc(o.titulo)}</text>`;
  if (o.subtitulo) c += `<text x="24" y="40" font-size="11" fill="${GRIS}">${esc(o.subtitulo)}</text>`;

  // Leyenda de sedes
  const sedes = o.grupos[0]?.valores ?? [];
  sedes.forEach((s, i) => {
    const lx = m.l + i * 120;
    c += `<rect x="${lx}" y="48" width="12" height="12" rx="2" fill="${s.color}"/><text x="${lx + 18}" y="58.5" font-size="11.5" fill="${TINTA}">${esc(s.sede)}</text>`;
  });
  for (let p = 0; p <= tope; p += 20) {
    c += `<line x1="${x(p)}" x2="${x(p)}" y1="${m.t}" y2="${H - m.b}" stroke="${p === 100 ? TINTA : REJILLA}" stroke-width="${p === 100 ? 1.6 : 1}"${p === 100 ? ' stroke-dasharray="5 3"' : ""}/>`;
    c += `<text x="${x(p)}" y="${H - 10}" font-size="10" fill="${p === 100 ? TINTA : GRIS}" text-anchor="middle" font-weight="${p === 100 ? "bold" : "normal"}">${p}%</text>`;
  }
  o.grupos.forEach((g, gi) => {
    const y0 = m.t + gi * altoGrupo;
    c += `<text x="${m.l - 10}" y="${y0 + altoGrupo / 2 + 3}" font-size="11.5" fill="${TINTA}" text-anchor="end">${esc(g.etiqueta)}</text>`;
    g.valores.forEach((v, vi) => {
      const yy = y0 + 6 + vi * (altoBarra + 3);
      if (v.pct === null) {
        c += `<text x="${m.l + 4}" y="${yy + 11}" font-size="10.5" fill="${GRIS}">sin dato</text>`;
        return;
      }
      const w = Math.max(2, x(v.pct) - m.l);
      c += `<rect x="${m.l}" y="${yy}" width="${w.toFixed(1)}" height="${altoBarra}" rx="2" fill="${v.color}"${v.pct >= 100 ? "" : ' opacity="0.78"'}/>`;
      c += `<text x="${m.l + w + 6}" y="${yy + 11}" font-size="10.5" font-weight="bold" fill="${v.pct >= 100 ? "#0E7A55" : TINTA}">${Math.round(v.pct)}%${v.pct >= 100 ? " cumplida" : ""}</text>`;
    });
  });
  return envolver(W, H, c);
}

export { soles, r1 };
