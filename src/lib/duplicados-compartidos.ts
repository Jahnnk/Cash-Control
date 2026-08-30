/**
 * Detecta el gasto que el Excel de Kelly trae y el sistema YA tiene
 * registrado a mano de una forma que el Excel no sabe expresar.
 *
 * ─── El caso que lo originó ───
 *
 * El alquiler de Atelier de agosto 2026 quedó cargado dos veces:
 *
 *   3-ago  S/2,700  [manual]  "Alquiler del mes"  compartido 1800/900
 *   4-ago  S/2,700  [excel]   "ALQUILER AGOSTO 2026 (HUGO DÍAS)"
 *
 * Es el mismo pago. Atelier terminó con S/4,500 de alquiler en el mes
 * cuando le corresponden S/1,800.
 *
 * ─── Por qué pasa ───
 *
 * Al importar, el sistema archiva los movimientos manuales del mes para
 * reemplazarlos por los del Excel. Pero PROTEGE a propósito los gastos
 * compartidos, los préstamos del socio y las transferencias internas:
 * el Excel no sabe expresar que S/2,700 de alquiler se parten entre dos
 * sedes, así que archivarlos perdería el reparto.
 *
 * La protección es correcta. Lo que faltaba es la otra mitad: si el
 * Excel trae ESE MISMO pago como una fila común, hay que reconocerlo y
 * no insertarlo, porque el gasto ya está — con más información.
 *
 * ─── Qué tan desconfiada es la detección ───
 *
 * Descartar una fila del Excel por error significa perder un gasto real
 * sin que nadie lo note, así que se exigen las cuatro cosas a la vez:
 *
 *   · misma sede
 *   · misma categoría (ya resuelta a su nombre canónico)
 *   · mismo monto exacto, al céntimo
 *   · fechas a menos de una semana
 *
 * Y cada gasto protegido puede tapar UNA sola fila del Excel: si el
 * archivo trae dos alquileres de S/2,700, uno se descarta y el otro
 * entra, porque el segundo puede ser real.
 *
 * Cuando hay varias candidatas gana la de fecha más cercana.
 *
 * Aun así el resultado NUNCA se aplica en silencio: la pantalla de
 * importación lo muestra para que Jahnn lo vea antes de confirmar. Un
 * falso positivo tiene que ser visible, no invisible.
 */

import { normalizeCategory } from "./category-normalize";

/** Un gasto que ya está en el sistema y el import no archiva. */
export type GastoProtegido = {
  fecha: string;             // YYYY-MM-DD
  monto: number;             // el monto COMPLETO, no la parte de la sede
  categoria: string;
  concepto: string | null;
  /** Por qué está protegido, en palabras. Se muestra tal cual. */
  motivo: string;
};

/** Una fila de egreso que viene del Excel. */
export type EgresoDelExcel = {
  excelRow: number;
  fecha: string;
  monto: number;
  categoria: string;
  nota: string;
};

export type DuplicadoDetectado = {
  excelRow: number;
  fecha: string;
  monto: number;
  categoria: string;
  nota: string;
  /** El gasto que ya estaba y hace que esta fila sobre. */
  contra: { fecha: string; concepto: string; motivo: string };
};

/** Días de diferencia que se toleran entre el pago y su registro. */
export const TOLERANCIA_DIAS = 5;

function diasEntre(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`));
  return Math.round(ms / 86_400_000);
}

/** Compara montos al céntimo, sin sustos de coma flotante. */
function mismoMonto(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function detectarDuplicadosCompartidos(
  egresos: EgresoDelExcel[],
  protegidos: GastoProtegido[],
): DuplicadoDetectado[] {
  const detectados: DuplicadoDetectado[] = [];
  // Un protegido tapa una sola fila: se van marcando los ya usados.
  const usados = new Set<number>();

  for (const e of egresos) {
    let mejor: { idx: number; dias: number } | null = null;

    for (let i = 0; i < protegidos.length; i++) {
      if (usados.has(i)) continue;
      const p = protegidos[i];
      if (!mismoMonto(p.monto, e.monto)) continue;
      if (normalizeCategory(p.categoria) !== normalizeCategory(e.categoria)) continue;
      const dias = diasEntre(p.fecha, e.fecha);
      if (dias > TOLERANCIA_DIAS) continue;
      if (mejor === null || dias < mejor.dias) mejor = { idx: i, dias };
    }

    if (mejor === null) continue;
    usados.add(mejor.idx);
    const p = protegidos[mejor.idx];
    detectados.push({
      excelRow: e.excelRow,
      fecha: e.fecha,
      monto: e.monto,
      categoria: e.categoria,
      nota: e.nota,
      contra: {
        fecha: p.fecha,
        concepto: p.concepto ?? "(sin concepto)",
        motivo: p.motivo,
      },
    });
  }

  return detectados;
}

/** Las filas de Excel a descartar, por número de fila. */
export function filasADescartar(detectados: DuplicadoDetectado[]): Set<number> {
  return new Set(detectados.map((d) => d.excelRow));
}
