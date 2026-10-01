/**
 * Las horas del mes que PLANILLA tiene pactadas en el horario de una persona.
 *
 * Es un espejo de `horasProgramadasMes` del sistema de Planilla
 * (`src/lib/asistencias/horas-programadas.ts`), porque Cash Control no puede
 * llamar su código. Si Planilla cambia su regla, hay que cambiar esta también.
 * Está verificado contra tres casos que Jahnn confirmó mirando Planilla en
 * octubre de 2026 (Centro): Annika 110 h, Junior 202 h, Diego 52 h.
 *
 * ─── La regla ───
 *
 * Se suman los turnos de UNA semana y se multiplica por 4 (no se cuentan los
 * días del calendario: es la convención de Chari y Kelly, un full time de 48 h
 * son 192 al mes aunque el mes traiga 26 días laborables).
 *
 * Hay dos formas de tener horario y la del día manda sobre la general:
 *   · horario por día (`horarios_dia`): un turno propio para cada día; un día
 *     sin fila no se trabaja;
 *   · patrón único (`horarios_trabajador`): el mismo turno en los días marcados.
 *
 * Por qué esto y no `horas_semanales × 4`: esa es la cifra del CONTRATO. Lo
 * pactado en el horario puede ser más (Annika tiene contrato de 23.5 h y su
 * horario suma 27.5) y es lo que Planilla paga.
 */

export type BloquesDia = {
  entradaAm: string | null;
  salidaAm: string | null;
  entradaPm: string | null;
  salidaPm: string | null;
};

export type FilaHorarioDia = BloquesDia & { dia: number }; // 0 = domingo … 6 = sábado

export type PatronUnico = {
  tipoTurno: "simple" | "partido";
  entradaAm: string;
  salidaAm: string | null;
  entradaPm: string | null;
  salidaPm: string;
  /** Claves lun…dom, como las guarda Planilla. */
  diasSemana: Record<string, boolean>;
};

const CLAVE_DIA = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;
const SEMANAS_POR_MES = 4;

const aMinutos = (hora: string): number => {
  const [h, m] = hora.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};

/** Duración de un bloque; 0 si falta un extremo o queda al revés. */
const bloque = (desde?: string | null, hasta?: string | null): number => {
  if (!desde || !hasta) return 0;
  const min = aMinutos(hasta) - aMinutos(desde);
  return min > 0 ? min : 0;
};

/** Minutos que dura el turno de un día de horario por día. */
function minutosDeUnDia(b: BloquesDia): number {
  const entrada = b.entradaAm ?? b.entradaPm;
  const salida = b.salidaPm ?? b.salidaAm;
  if (!entrada || !salida) return 0; // fila incompleta: Planilla tampoco la cuenta
  const esPartido = !!(b.entradaAm && b.salidaAm && b.entradaPm && b.salidaPm);
  return esPartido ? bloque(b.entradaAm, b.salidaAm) + bloque(b.entradaPm, b.salidaPm) : bloque(entrada, salida);
}

function minutosDelPatron(p: PatronUnico): number {
  return p.tipoTurno === "partido"
    ? bloque(p.entradaAm, p.salidaAm) + bloque(p.entradaPm, p.salidaPm)
    : bloque(p.entradaAm, p.salidaPm);
}

/** Horas que su horario suma en una semana. null = no tiene horario cargado. */
export function horasProgramadasSemana(dias: FilaHorarioDia[], patron: PatronUnico | null): number | null {
  if (dias.length > 0) {
    return dias.reduce((t, d) => t + minutosDeUnDia(d), 0) / 60;
  }
  if (!patron) return null;
  const diasQueTrabaja = CLAVE_DIA.filter((c) => patron.diasSemana[c] === true).length;
  return (diasQueTrabaja * minutosDelPatron(patron)) / 60;
}

/** Las horas del mes: la semana × 4, redondeada a centésimas. null = sin horario. */
export function horasProgramadasMes(dias: FilaHorarioDia[], patron: PatronUnico | null): number | null {
  const semana = horasProgramadasSemana(dias, patron);
  return semana === null ? null : Math.round(semana * SEMANAS_POR_MES * 100) / 100;
}
