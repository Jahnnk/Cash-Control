/**
 * Semanas de venta por producto a partir del historial de cargas · MOTOR (puro).
 *
 * Cada sábado la sede sube el reporte de rotación de Byte "del 01 del mes a
 * hoy" (acumulado). Desde el 24-sep-2026 cada carga se guarda tal cual en
 * `rotacion_cortes`. Una semana es la DIFERENCIA entre dos cargas acumuladas
 * seguidas del mismo mes: lo del 01 al 26 menos lo del 01 al 19 = del 20 al 26.
 *
 * Si alguien sube un archivo que no empieza el 01 (una semana suelta), ese
 * período cuenta por sí mismo. De cada fecha de corte vale la ÚLTIMA carga
 * (re-subir el mismo día la corrige). Manda la carga de la sede (la semanal);
 * la de dirección solo si la sede no subió nada ese mes.
 */

import { diasEntre } from "./panorama";
import type { SemanaCandidatos } from "./candidatos";

export type Corte = {
  origen: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  cargadoEl: string;
  nombre: string;
  unidades: number;
  ingresos: number;
};

const MAX_SEMANAS = 8;
/** Un período de más de 10 días no es una semana (es el mes o medio mes cargado de golpe). */
const MAX_DIAS_SEMANA = 10;

function sumar(filas: Corte[]): Map<string, { unidades: number; ingresos: number }> {
  const m = new Map<string, { unidades: number; ingresos: number }>();
  for (const f of filas) {
    const x = m.get(f.nombre) ?? { unidades: 0, ingresos: 0 };
    x.unidades += f.unidades; x.ingresos += f.ingresos;
    m.set(f.nombre, x);
  }
  return m;
}

export function semanasDeCortes(cortes: Corte[]): SemanaCandidatos[] {
  const semanas: SemanaCandidatos[] = [];
  const meses = [...new Set(cortes.map((c) => c.month))].sort();
  for (const month of meses) {
    const delMes = cortes.filter((c) => c.month === month);
    const origen = delMes.some((c) => c.origen === "sede") ? "sede" : "direccion";
    const usados = delMes.filter((c) => c.origen === origen);

    // Por período: la última carga (cargado_el más reciente) de cada rango.
    const periodos = new Map<string, Corte[]>();
    for (const c of usados) {
      const k = `${c.periodStart}|${c.periodEnd}`;
      const ya = periodos.get(k);
      if (!ya || c.cargadoEl > ya[0].cargadoEl) periodos.set(k, usados.filter((x) => x.periodStart === c.periodStart && x.periodEnd === c.periodEnd && x.cargadoEl === c.cargadoEl));
    }
    const inicioMes = `${month}-01`;
    const acumulados = [...periodos.values()].filter((p) => p[0].periodStart === inicioMes).sort((a, b) => a[0].periodEnd.localeCompare(b[0].periodEnd));
    const sueltos = [...periodos.values()].filter((p) => p[0].periodStart !== inicioMes);

    let anterior: { hasta: string; suma: Map<string, { unidades: number; ingresos: number }> } | null = null;
    for (const p of acumulados) {
      const suma = sumar(p);
      const hasta = p[0].periodEnd;
      const desde = anterior ? siguienteDia(anterior.hasta) : inicioMes;
      const productos = [...suma.entries()].map(([nombre, x]) => {
        const antes = anterior?.suma.get(nombre) ?? { unidades: 0, ingresos: 0 };
        return { nombre, unidades: Math.max(0, x.unidades - antes.unidades), ingresos: Math.max(0, Math.round((x.ingresos - antes.ingresos) * 100) / 100) };
      }).filter((x) => x.unidades > 0 || x.ingresos > 0);
      const dias = diasEntre(desde, hasta);
      if (dias > 0) semanas.push({ desde, hasta, dias, productos });
      anterior = { hasta, suma };
    }
    for (const p of sueltos) {
      const dias = diasEntre(p[0].periodStart, p[0].periodEnd);
      if (dias > 0) semanas.push({ desde: p[0].periodStart, hasta: p[0].periodEnd, dias, productos: [...sumar(p).entries()].map(([nombre, x]) => ({ nombre, ...x })) });
    }
  }
  return semanas.filter((x) => x.dias <= MAX_DIAS_SEMANA).sort((a, b) => a.desde.localeCompare(b.desde)).slice(-MAX_SEMANAS);
}

function siguienteDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
