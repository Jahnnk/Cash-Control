/**
 * Las horas REALMENTE trabajadas del mes, para el bono por ticket.
 *
 * ─── Por qué cambió ───
 *
 * El bono se pagaba con las horas de CONTRATO. Funcionó para el caso que
 * lo motivó —Diego tiene contrato de 13 h/semana por sus estudios y
 * cobraba lo mismo que Teresa con 23.5— pero dejaba dos huecos:
 *
 *   · Quien hace turnos de MÁS no cobraba más. En agosto Annika trabajó
 *     110 h contra un contrato de 94, y su bono fue el mismo que el de
 *     alguien que hizo exactamente sus 94.
 *   · Quien falta media semana cobraba igual que quien no faltó.
 *
 * El Excel de bonos de Kelly (agosto 2026) ya usaba horas trabajadas, y
 * su tarifa por hora resultó ser la MISMA que la del sistema
 * (S/0.5107 contra S/0.5106): los dos métodos coincidían, solo diferían
 * en qué horas medían. Decisión de Jahnn (8-sep-2026): que las horas
 * salgan de Planilla, que es donde viven.
 *
 * ─── La regla del todo-o-nada (lo importante de este archivo) ───
 *
 * Si Planilla tiene las horas de SOLO ALGUNOS del equipo, NO se mezcla.
 * Se paga a todos con las horas de contrato y se avisa.
 *
 * Mezclar sería lo peor de los dos mundos: quien tiene sus horas
 * cargadas cobra por lo que hizo, y a quien no se las cargaron le toca
 * su contrato — dos varas distintas dentro del mismo equipo y del mismo
 * mes, y la diferencia no la decide su trabajo sino si alguien llenó su
 * asistencia. En un pago entre compañeros que se ven todos los días,
 * eso se nota y no se perdona.
 */

/** Una persona del roster, con las dos horas posibles. */
export type PersonaConHoras = {
  /** DNI: la llave estable entre Planilla y Cash Control. */
  dni: string | null;
  name: string;
  active: boolean;
  /** Horas SEMANALES del contrato (lo que ya sincronizaba el roster). */
  horasSemanales?: number | null;
};

export type ResueltoHoras<T> = {
  /** El equipo, con `horasMesTrabajadas` puesto (o null si se usa contrato). */
  staff: (T & { horasMesTrabajadas: number | null })[];
  /** true = se pagó con horas trabajadas; false = con las de contrato. */
  usaTrabajadas: boolean;
  /** Quiénes no tienen horas en Planilla (por eso no se pudo usar). */
  faltantes: string[];
};

/**
 * Decide con qué horas se paga el mes.
 *
 * `horasPorDni` viene de Planilla (resumen de asistencia del mes). Solo
 * se usan si están TODAS las personas activas; si falta una sola, todo
 * el equipo va con las horas de contrato.
 */
export function resolverHorasDelMes<T extends PersonaConHoras>(
  staff: T[],
  horasPorDni: Map<string, number>,
): ResueltoHoras<T> {
  const activos = staff.filter((s) => s.active);

  // Una persona "tiene horas" solo con un número positivo. Un 0 no es un
  // dato: es alguien a quien no le cargaron nada, y pagarle S/0 de bono
  // por un vacío de registro sería exactamente el error que este archivo
  // evita. Si de verdad no trabajó, eso se corrige dándole de baja en
  // Planilla, no dejándole la asistencia en blanco.
  const horasDe = (s: T): number | null => {
    if (!s.dni) return null;
    const h = horasPorDni.get(s.dni.trim());
    return h != null && Number.isFinite(h) && h > 0 ? h : null;
  };

  const faltantes = activos.filter((s) => horasDe(s) === null).map((s) => s.name);
  const usaTrabajadas = activos.length > 0 && faltantes.length === 0;

  return {
    staff: staff.map((s) => ({
      ...s,
      horasMesTrabajadas: usaTrabajadas ? horasDe(s) : null,
    })),
    usaTrabajadas,
    faltantes,
  };
}

/**
 * El aviso que va al acta cuando NO se pudieron usar las horas reales.
 * Nombra a quién le falta: sin eso, "faltan horas" es un callejón sin
 * salida para quien tiene que arreglarlo.
 */
export function avisoHorasIncompletas(faltantes: string[]): string {
  const MAX = 5;
  const lista =
    faltantes.length <= MAX
      ? faltantes.join(", ")
      : `${faltantes.slice(0, MAX).join(", ")} y ${faltantes.length - MAX} más`;
  return (
    `Planilla no tiene las horas trabajadas de ${faltantes.length} persona(s) este mes ` +
    `(${lista}). Para no pagar con dos varas distintas, TODO el equipo se calculó con ` +
    `las horas de contrato. Carga la asistencia en Planilla y vuelve a abrir la liquidación.`
  );
}
