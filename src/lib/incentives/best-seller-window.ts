/**
 * Mejor vendedor: la ÚNICA definición de "qué reporte se usa y quién
 * es elegible".
 *
 * Incidente jul-2026: el Panel de Sede exigía 60 mesas y el panel del
 * Grupo 15 (copiado a mano al escribirlo). Resultado: el admin de
 * Fonavi veía a Jefferson y la dirección veía a Abigail — dos ganadores
 * para el mismo desayuno. Cualquier pantalla que muestre el mejor
 * vendedor DEBE pasar por aquí; nada de constantes copiadas.
 */

/** Mínimo de mesas atendidas para entrar al ranking (política jun-2026).
 * Evita que alguien con 5 mesas de mucho ticket "gane" por ruido. */
export const MIN_MESAS_MEJOR_VENDEDOR = 60;

/**
 * Cómo se elige el reporte de trabajadores dentro de una ventana:
 *  - "inicia-en-ventana": el reporte EMPIEZA dentro de la ventana
 *    (regla histórica del Panel de Sede para el mes).
 *  - "contenido": el reporte cabe COMPLETO en la ventana — para rangos
 *    cortos (semana piloto): un acumulado del 1 al 17 no puede
 *    representar la semana 1.
 */
export type WorkerWindowMode = "inicia-en-ventana" | "contenido";

export type WorkerRow = {
  nombre: string;
  mesas: number;
  total: number;
  period_start?: string | null;
  period_end?: string | null;
};

/** Filtra las filas ya traídas de BD según el modo de ventana. */
export function filterWorkersByWindow(
  rows: WorkerRow[],
  from: string,
  to: string,
  mode: WorkerWindowMode,
): WorkerRow[] {
  return rows.filter((r) => {
    const ps = r.period_start ?? null;
    const pe = r.period_end ?? null;
    if (mode === "contenido") {
      return ps !== null && pe !== null && ps >= from && pe <= to;
    }
    return ps !== null && ps >= from && ps <= to;
  });
}

/** Cuántos quedaron FUERA del ranking por no llegar al mínimo de mesas.
 * Se muestra en pantalla: un excluido invisible genera desconfianza
 * ("¿por qué no aparece Abi si vendió más caro?"). */
export function contarNoElegibles(rows: { mesas: number }[]): number {
  return rows.filter((r) => r.mesas > 0 && r.mesas < MIN_MESAS_MEJOR_VENDEDOR).length;
}
