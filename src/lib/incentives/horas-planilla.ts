/**
 * Las horas del mes de una persona, tal como las tiene PLANILLA · lógica PURA.
 *
 * ─── Por qué existe (1-oct-2026) ───
 *
 * Al preparar el reporte de septiembre para Kelly se vio que el bono NUNCA
 * había usado las horas reales de Planilla en Fonavi ni en Centro: la
 * sincronización leía `resumen_dia`, la tabla del RELOJ de Byte, y esas dos
 * sedes no liquidan por reloj (Centro por horario, Fonavi manual). La tabla
 * estaba vacía, así que la regla del todo-o-nada caía siempre a las horas de
 * contrato y el acta solo avisaba "Planilla no tiene las horas".
 *
 * Planilla sí tiene las horas de cada quien, en este orden de fuentes:
 *
 *   1. RELOJ        suma de `resumen_dia` (solo sedes que liquidan por reloj).
 *   2. REGISTRADA   `ajustes_mes.horas_trabajadas`: las horas del mes que el
 *                   administrador cargó en «Control del mes». Es lo que
 *                   Planilla usa para prorratear el sueldo de un part time.
 *   3. HORARIO      lo pactado en su horario: los turnos de una semana × 4
 *                   (ver horario-programado.ts). Planilla da por hecho que la
 *                   persona trabajó su horario (Centro).
 *   4. CONTRATO     `horas_semanales × 4`, solo si no tiene horario cargado.
 *
 * Primera versión (1-oct): usaba el contrato (4) donde debía usar el horario
 * (3). Jahnn lo notó con Annika de Centro: Planilla muestra 110 h + 70 min de
 * tiempo extra = 111.17 h pagadas, y el sistema contaba 94 h (su contrato).
 *
 * Y encima, lo que el administrador registró día por día:
 *
 *   · falta                 → resta (ese turno no se trabajó)
 *   · tiempo extra y horas no marcadas → suman (estuvo de más)
 *   · tardanza              → NO resta: son minutos sueltos que Planilla ya
 *                             descuenta en dinero, y las «horas pagadas» que
 *                             Planilla muestra no los quitan (Annika tiene 22
 *                             min de tardanza y sus horas son 111.17).
 *   · feriado               → NO suma: son horas que ya estaban en su
 *                             horario, Planilla solo les pone el recargo del
 *                             200%. Sumarlas contaría esas horas dos veces.
 *
 * El módulo es puro a propósito: recibe lo que se leyó de Planilla y devuelve
 * el desglose. Así el reporte puede mostrarle a Kelly de dónde sale cada hora
 * y las pruebas no necesitan base de datos.
 */

export const SEMANAS_POR_MES = 4;

export type FilaPlanilla = {
  dni: string;
  /** Horas del mes que suma su horario (turnos de una semana × 4). null = sin horario cargado. */
  horasProgramadas: number | null;
  /** Horas semanales del CONTRATO: solo se usan si no tiene horario. */
  horasSemanales: number | null;
  /** Horas del mes que el administrador registró en Control del mes. */
  horasRegistradas: number | null;
  /** Horas que sumó el reloj (solo sedes que liquidan por reloj). */
  horasReloj: number | null;
  minFalta: number;
  /** Se lee pero no resta (ver arriba); queda para quien quiera mostrarlo. */
  minTardanza: number;
  minTiempoExtra: number;
  minNoMarcadas: number;
};

export type OrigenHoras = "reloj" | "registrada" | "horario" | "contrato";

export type HorasDelMes = {
  dni: string;
  origen: OrigenHoras;
  /** Horas del mes antes de los ajustes diarios. */
  horasBase: number;
  /** Faltas, en horas (siempre ≥ 0). */
  horasMenos: number;
  /** Tiempo extra y horas no marcadas, en horas (siempre ≥ 0). */
  horasMas: number;
  /** Las horas del bono: base − menos + más, nunca por debajo de 0. */
  horas: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const positivo = (n: number | null): n is number => n != null && Number.isFinite(n) && n > 0;

/**
 * El desglose de horas de una persona. null si Planilla no da con qué
 * calcularlas (sin reloj, sin horas registradas y sin horario): el llamador
 * decide, y la regla del todo-o-nada se encarga de no mezclar varas.
 */
export function horasDelMesDesdePlanilla(f: FilaPlanilla): HorasDelMes | null {
  let origen: OrigenHoras;
  let horasBase: number;
  if (positivo(f.horasReloj)) {
    origen = "reloj";
    horasBase = f.horasReloj;
  } else if (positivo(f.horasRegistradas)) {
    origen = "registrada";
    horasBase = f.horasRegistradas;
  } else if (positivo(f.horasProgramadas)) {
    origen = "horario";
    horasBase = f.horasProgramadas;
  } else if (positivo(f.horasSemanales)) {
    origen = "contrato";
    horasBase = f.horasSemanales * SEMANAS_POR_MES;
  } else {
    return null;
  }

  // El reloj ya descuenta las faltas por su cuenta: aplicarlas otra vez sería
  // restar dos veces. Solo se le suma lo que Byte nunca vio.
  const horasMenos = origen === "reloj" ? 0 : r2(Math.max(0, f.minFalta) / 60);
  const horasMas = r2((Math.max(0, f.minTiempoExtra) + Math.max(0, f.minNoMarcadas)) / 60);

  return {
    dni: f.dni.trim(),
    origen,
    horasBase: r2(horasBase),
    horasMenos,
    horasMas,
    horas: r2(Math.max(0, horasBase - horasMenos + horasMas)),
  };
}

export const ORIGEN_HORAS_LABEL: Record<OrigenHoras, string> = {
  reloj: "Reloj de Byte",
  registrada: "Horas del mes registradas",
  horario: "Horario de Planilla",
  contrato: "Horas del contrato",
};
