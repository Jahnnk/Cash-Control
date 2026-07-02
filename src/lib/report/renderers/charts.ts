/**
 * EIRS · Gráficos propios en canvas (sin dependencias): línea y barras.
 * Devuelven dataURL PNG para incrustar en PDF/PPT. En entornos sin DOM
 * (tests/SSR) devuelven null y los renderers degradan a solo-texto.
 */

import { BRAND } from "./design-system";

export type LineSeries = { name: string; values: number[]; color: string };

function mkCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function niceRange(values: number[]): { min: number; max: number } {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = (hi - lo || 1) * 0.12;
  return { min: lo - pad, max: hi + pad };
}

/** Gráfico de líneas multi-serie con etiquetas de meses. */
export function lineChart(
  labels: string[],
  series: LineSeries[],
  width = 900,
  height = 380,
): string | null {
  const canvas = mkCanvas(width, height);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d")!;
  const padL = 90, padR = 30, padT = 40, padB = 56;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  const all = series.flatMap((s) => s.values);
  const { min, max } = niceRange(all);
  const x = (i: number) => padL + (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * plotH;

  // Gridlines + eje Y
  ctx.strokeStyle = "#E5E7EB";
  ctx.fillStyle = BRAND.gray;
  ctx.font = "20px Helvetica";
  ctx.textAlign = "right";
  for (let g = 0; g <= 4; g++) {
    const v = min + ((max - min) * g) / 4;
    const yy = y(v);
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(width - padR, yy);
    ctx.stroke();
    ctx.fillText(Math.round(v).toLocaleString("es-PE"), padL - 10, yy + 6);
  }
  // Línea de cero si el rango la cruza
  if (min < 0 && max > 0) {
    ctx.strokeStyle = "#9CA3AF";
    ctx.beginPath();
    ctx.moveTo(padL, y(0));
    ctx.lineTo(width - padR, y(0));
    ctx.stroke();
  }
  // Etiquetas X
  ctx.textAlign = "center";
  labels.forEach((l, i) => ctx.fillText(l, x(i), height - 22));

  // Series
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    s.values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
    ctx.stroke();
    ctx.fillStyle = s.color;
    s.values.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(x(i), y(v), 6, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Leyenda
  let lx = padL;
  ctx.textAlign = "left";
  for (const s of series) {
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, 12, 18, 18);
    ctx.fillStyle = BRAND.ink;
    ctx.fillText(s.name, lx + 24, 27);
    lx += 24 + ctx.measureText(s.name).width + 30;
  }
  return canvas.toDataURL("image/png");
}

/** Barras simples con etiqueta y valor (ej. 3 escenarios de proyección). */
export function barChart(
  items: { label: string; value: number; color: string }[],
  width = 900,
  height = 340,
): string | null {
  const canvas = mkCanvas(width, height);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d")!;
  const padL = 40, padR = 40, padT = 30, padB = 60;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  const { min, max } = niceRange(items.map((i) => i.value));
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * plotH;
  const bw = Math.min(140, (plotW / items.length) * 0.55);

  // Línea de cero
  ctx.strokeStyle = "#9CA3AF";
  ctx.beginPath();
  ctx.moveTo(padL, y(0));
  ctx.lineTo(width - padR, y(0));
  ctx.stroke();

  ctx.font = "20px Helvetica";
  ctx.textAlign = "center";
  items.forEach((it, i) => {
    const cx = padL + ((i + 0.5) / items.length) * plotW;
    const y0 = y(Math.max(0, it.value));
    const hgt = Math.abs(y(it.value) - y(0));
    ctx.fillStyle = it.color;
    ctx.fillRect(cx - bw / 2, y0, bw, Math.max(2, hgt));
    ctx.fillStyle = BRAND.ink;
    ctx.fillText(it.label, cx, height - 30);
    ctx.fillText(
      `S/ ${Math.round(it.value).toLocaleString("es-PE")}`,
      cx,
      y(it.value) + (it.value >= 0 ? -10 : 26),
    );
  });
  return canvas.toDataURL("image/png");
}
