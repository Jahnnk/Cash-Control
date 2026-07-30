/**
 * Motor del Sistema de Dirección: convierte un "número que manda" y su
 * meta en un semáforo auditable.
 *
 * Regla de oro: el semáforo se calcula SIEMPRE sobre el % de
 * cumplimiento de la meta, y la dirección la marca `higherIsBetter`.
 * Hay números donde MÁS es mejor (ventas, margen, NPS) y otros donde
 * más es PEOR (tiempo de entrega, mermas). Confundirlos pinta de verde
 * una mala noticia — el error más caro que puede cometer un tablero.
 *
 * Función PURA: no toca la BD.
 */

import type { DireccionItem, NumeroResuelto } from "./types";

/** Desde este % de cumplimiento el número está en verde. */
export const VERDE_DESDE = 100;
/** Bajo este % está en rojo; entre ambos, ámbar. */
export const AMBAR_DESDE = 90;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * % de cumplimiento de una meta.
 *  - "más es mejor": valor ÷ meta (vender 90 de 100 = 90%).
 *  - "menos es mejor": meta ÷ valor (entregar en 25 min con meta 20
 *    = 80%; entregar en 15 = 133%).
 */
export function cumplimiento(
  value: number,
  target: number,
  higherIsBetter: boolean,
): number | null {
  if (higherIsBetter) {
    if (target === 0) return null;
    return r2((value / target) * 100);
  }
  if (value === 0) return target === 0 ? 100 : null;
  return r2((target / value) * 100);
}

export function semaforoDe(cumplimientoPct: number | null): "verde" | "ambar" | "rojo" | null {
  if (cumplimientoPct === null) return null;
  if (cumplimientoPct >= VERDE_DESDE) return "verde";
  if (cumplimientoPct >= AMBAR_DESDE) return "ambar";
  return "rojo";
}

/**
 * Resuelve un número: toma el valor automático si la métrica está
 * enlazada al sistema, o el escrito a mano, y lo evalúa contra su meta.
 */
export function resolverNumero(
  item: DireccionItem,
  metricas: Partial<Record<string, number | null>>,
): NumeroResuelto {
  const automatico = item.metricKey !== null;
  const value = automatico ? (metricas[item.metricKey!] ?? null) : item.manualValue;
  const cumplimientoPct =
    value !== null && item.targetValue !== null
      ? cumplimiento(value, item.targetValue, item.higherIsBetter)
      : null;
  return {
    ...item,
    value,
    automatico,
    cumplimientoPct,
    semaforo: semaforoDe(cumplimientoPct),
  };
}

/** Formato del valor según la unidad de la meta (S/, %, pts, días…). */
export function formatValor(value: number | null, unit: string | null): string {
  if (value === null) return "—";
  const u = (unit ?? "").trim();
  if (u === "S/") {
    return `S/${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (u === "%") return `${r2(value)}%`;
  const n = Number.isInteger(value) ? String(value) : String(r2(value));
  return u ? `${n} ${u}` : n;
}

/**
 * Resumen del bloque de salud: cuántas piezas del sistema funcionan
 * solas. Es el número que responde "¿esto camina sin mí?".
 */
export function resumenSalud(items: DireccionItem[]): {
  bien: number; atencion: number; roto: number; total: number; pct: number | null;
} {
  const bien = items.filter((i) => i.status === "bien").length;
  const atencion = items.filter((i) => i.status === "atencion").length;
  const roto = items.filter((i) => i.status === "roto").length;
  const total = items.length;
  return { bien, atencion, roto, total, pct: total > 0 ? Math.round((bien / total) * 100) : null };
}
