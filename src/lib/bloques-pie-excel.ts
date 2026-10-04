/**
 * Los bloques que Kelly arma al pie de la hoja Ing&Gtos · MOTOR (puro).
 *
 * Debajo de los movimientos del mes, Kelly escribe sus propios resúmenes:
 *
 *   · Fila de totales (Centro SEP26, fila 280): SUM de cada columna.
 *   · Primer bloque "INGRESOS / GASTOS" (fila 282) y su resultado (284): el
 *     total del mes según la hoja. Es la cifra que Jahnn lee.
 *   · Bloques siguientes (filas 291–295): su ANÁLISIS DE RENTABILIDAD. Repite
 *     el resumen con ajustes escritos a mano en la fórmula (=L280-10000+6694.34,
 *     =K280-1718.03) para ver la rentabilidad sin el depósito a fondos
 *     mutuos / plazo fijo. Kelly (25-sep-2026): "es un ajuste manual que yo
 *     hago para ver la rentabilidad"; lo deja en la hoja a propósito.
 *
 * Cómo lo usa el sistema (Jahnn, 25-sep-2026: "el sistema debe saber la
 * lógica de lo que ella hace y adaptarse"):
 *
 *   · El PRIMER bloque es el control: tiene que ser igual a lo que el sistema
 *     leyó fila por fila. Si no, a la lectura se le escapó algo (o la hoja
 *     tiene una fila que el sistema no entiende) y se avisa.
 *   · Los bloques SIGUIENTES son el análisis de Kelly: se guardan y se
 *     muestran como referencia, NUNCA como ingresos o gastos del mes (son
 *     montos ajustados a mano, no movimientos).
 *
 * Se busca por la etiqueta ("INGRESOS" y "GASTOS" en la misma fila, con el
 * monto en la celda de la derecha), nunca por número de fila: la fila cambia
 * cada semana a medida que Kelly agrega movimientos.
 */

export type BloquePie = {
  /** Fila del Excel (1 = primera). */
  fila: number;
  ingresos: number;
  gastos: number;
  /**
   * Los márgenes que Kelly calcula dos filas debajo del bloque, en % (19.6 = 19.6%):
   * margen = (ingresos − gastos) ÷ ingresos, y gastos ÷ ingresos. null si la hoja no los trae.
   */
  margenPct: number | null;
  gastosPct: number | null;
};

export type BloquesPie = {
  /** El total del mes según la propia hoja (primer bloque). */
  totalHoja: BloquePie | null;
  /** El análisis de rentabilidad de Kelly (bloques siguientes), si lo armó. */
  analisis: BloquePie[];
};

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function leerBloquesDelPie(rows: unknown[][]): BloquesPie {
  const bloques: BloquePie[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const cI = row.findIndex((c) => norm(c) === "INGRESOS");
    const cG = row.findIndex((c) => norm(c) === "GASTOS");
    if (cI < 0 || cG < 0) continue;
    const ingresos = num(row[cI + 1]);
    const gastos = num(row[cG + 1]);
    if (ingresos === null || gastos === null) continue;
    // Debajo del bloque (1 a 3 filas): margen en la columna de INGRESOS, su monto a la derecha y gastos÷ingresos en la de GASTOS.
    let margenPct: number | null = null, gastosPct: number | null = null;
    for (let k = i + 1; k <= Math.min(i + 3, rows.length - 1); k++) {
      const r = rows[k] ?? [];
      const m = num(r[cI]), monto = num(r[cI + 1]), g = num(r[cG]);
      if (m !== null && monto !== null && g !== null && Math.abs(m) < 100 && Math.abs(monto - (ingresos - gastos)) < 0.05) {
        margenPct = Math.round(m * 10000) / 100;
        gastosPct = Math.round(g * 10000) / 100;
        break;
      }
    }
    bloques.push({ fila: i + 1, ingresos: Math.round(ingresos * 100) / 100, gastos: Math.round(gastos * 100) / 100, margenPct, gastosPct });
  }
  return { totalHoja: bloques[0] ?? null, analisis: bloques.slice(1) };
}

/** Las notas del lote guardan los bloques como "clave=valor" (igual que omitidos_egresos). */
export function bloquesANotas(b: BloquesPie): string[] {
  const out: string[] = [];
  if (b.totalHoja) {
    out.push(`hoja_ingresos=${b.totalHoja.ingresos}`, `hoja_egresos=${b.totalHoja.gastos}`);
    if (b.totalHoja.margenPct !== null) out.push(`hoja_margen_pct=${b.totalHoja.margenPct}`, `hoja_gastos_pct=${b.totalHoja.gastosPct}`);
  }
  const a = b.analisis[b.analisis.length - 1];
  if (a) {
    out.push(`analisis_ingresos=${a.ingresos}`, `analisis_egresos=${a.gastos}`, `analisis_fila=${a.fila}`);
    if (a.margenPct !== null) out.push(`analisis_margen_pct=${a.margenPct}`, `analisis_gastos_pct=${a.gastosPct}`);
  }
  return out;
}

export type HojaDeNotas = { ingresos: number; egresos: number; margenPct: number | null; gastosPct: number | null };
export type AnalisisDeNotas = HojaDeNotas & { fila: number };

export function bloquesDeNotas(notas: string | null): { hoja: HojaDeNotas | null; analisis: AnalisisDeNotas | null } {
  const v = (k: string) => {
    const m = notas?.match(new RegExp(`(?:^|[^a-z_])${k}=(-?[\\d.]+)`));
    return m ? Number(m[1]) : null;
  };
  const hi = v("hoja_ingresos"), he = v("hoja_egresos");
  const ai = v("analisis_ingresos"), ae = v("analisis_egresos"), af = v("analisis_fila");
  return {
    hoja: hi !== null && he !== null ? { ingresos: hi, egresos: he, margenPct: v("hoja_margen_pct"), gastosPct: v("hoja_gastos_pct") } : null,
    analisis: ai !== null && ae !== null ? { ingresos: ai, egresos: ae, fila: af ?? 0, margenPct: v("analisis_margen_pct"), gastosPct: v("analisis_gastos_pct") } : null,
  };
}
