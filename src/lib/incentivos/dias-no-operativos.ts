/**
 * Días no operativos: los que NO cuentan para la meta del equipo.
 *
 * Pedido de Jahnn (22-ago-2026): "hoy por un problema eléctrico no hubo
 * atención en Centro… yo debería poder pausar ese día para que no les
 * cuente y baje el ticket promedio… que las sedes no se perjudiquen por
 * situaciones que escapan a la responsabilidad de los colaboradores".
 *
 * ─── Qué estaba ya resuelto y qué no ───
 *
 * El motor de incentivos filtra `personas > 0 && revenue > 0`, así que
 * un día con CERO atención ya quedaba fuera del ticket promedio, y el
 * piso de tráfico divide entre días CON datos. Eso funcionaba.
 *
 * Lo que no funcionaba:
 *
 *   1. Ese día quedaba como "KPI sin registrar" en el panel del admin y
 *      en el control de dirección, en rojo y para siempre. El sistema no
 *      podía distinguir "no abrimos" de "se les olvidó".
 *   2. El día PARCIAL no estaba cubierto: si abren y cierran a media
 *      tarde hay venta y hay personas, así que el día SÍ entra al
 *      promedio y lo arrastra. Es el caso que más se va a repetir con
 *      feriados y cortes de luz a media jornada.
 *   3. La proyección del pozo reparte sobre TODOS los días del mes,
 *      incluido el cerrado, inflando el cálculo.
 *
 * ─── Por qué la venta sí cuenta y el ticket no ───
 *
 * Un día pausado con venta parcial conserva su plata en ventas, caja y
 * reportes: ese dinero entró de verdad y esconderlo sería falsear el
 * mes. Lo que se excluye es su efecto sobre el TICKET PROMEDIO y el
 * PISO DE TRÁFICO, que no miden cuánto se vendió sino qué tan bien
 * trabajó el equipo — y por media jornada sin luz nadie puede
 * responder.
 *
 * ─── Quién puede marcarlo ───
 *
 * Solo dirección. NUNCA el administrador: esto mueve el bono, y si
 * quien cobra pudiera borrar sus propios días flojos el número deja de
 * ser creíble. El admin lo pide, dirección decide (misma lógica que las
 * propuestas de Highlight).
 */

export type DiaNoOperativo = {
  businessId: number;
  fecha: string;
  motivo: string;
  marcadoPor: string;
};

export const MAX_MOTIVO_DIA = 200;

/**
 * El motivo es obligatorio. Sin él, dentro de tres meses nadie sabe por
 * qué ese día no contó — y un día excluido sin explicación es
 * exactamente lo que haría dudar del bono.
 */
export function validarMotivoDia(
  motivo: string,
): { ok: true; motivo: string } | { ok: false; error: string } {
  const m = (motivo ?? "").trim().replace(/\s+/g, " ");
  if (!m) {
    return { ok: false, error: "Escribe por qué este día no cuenta (corte de luz, feriado, etc.)." };
  }
  if (m.length > MAX_MOTIVO_DIA) {
    return { ok: false, error: `El motivo no debe pasar de ${MAX_MOTIVO_DIA} caracteres.` };
  }
  return { ok: true, motivo: m };
}

/** Índice rápido "sede+fecha" para preguntar si un día está pausado. */
export function indicePausados(dias: { businessId: number; fecha: string }[]): Set<string> {
  return new Set(dias.map((d) => `${d.businessId}|${d.fecha}`));
}

export const estaPausado = (
  indice: Set<string>,
  businessId: number,
  fecha: string,
): boolean => indice.has(`${businessId}|${fecha}`);

/**
 * Saca de la lista los días pausados, antes de que el motor calcule.
 *
 * Se filtra ACÁ y no dentro del motor a propósito: el motor no tiene por
 * qué saber de cortes de luz ni de feriados. Recibe los días que cuentan
 * y hace su trabajo — así su lógica (ya probada) no se toca.
 */
export function sinDiasPausados<T extends { date: string }>(
  dailies: T[],
  pausados: Set<string>,
  businessId: number,
): T[] {
  return dailies.filter((d) => !estaPausado(pausados, businessId, d.date));
}

/**
 * Días del mes que SÍ se esperaba operar, para la proyección del pozo.
 * Sin esto, un mes con 3 días cerrados proyecta como si hubieran sido
 * 3 días normales de venta.
 */
export function diasOperativosDelMes(
  diasDelMes: number,
  mes: string,
  pausados: { businessId: number; fecha: string }[],
  businessId: number,
): number {
  const cerrados = pausados.filter(
    (p) => p.businessId === businessId && p.fecha.slice(0, 7) === mes,
  ).length;
  return Math.max(1, diasDelMes - cerrados);
}
