/**
 * Quién entra al bono de un mes, según Planilla · lógica PURA.
 *
 * Dos reglas de Jahnn (1-oct-2026, al revisar septiembre):
 *
 *  · Quien ya figura CESADO pero hizo el mes completo cobra su parte. Junior
 *    (Centro) se fue el 30 de septiembre: aunque hoy figure cesado, trabajó
 *    todo el mes. Quién cuenta como "hizo el mes completo" lo decide la
 *    lectura de Planilla (planilla-db.ts); aquí solo se distingue.
 *  · Quien está en PERIODO DE PRUEBA no cobra ese mes. Ghyan ingresó a Centro
 *    el 30 de septiembre. Se reconoce por su fecha de ingreso: si entró
 *    después del día 1 del mes, no hizo el mes completo.
 *
 * Límite conocido: la prueba dura más de un mes. Esta regla solo deja afuera
 * el mes de ingreso; en octubre Ghyan volvería a entrar aunque siga en prueba.
 * Si se quiere cubrirlo hace falta una lista de exclusiones que decida
 * Jahnn (no se infiere de la fecha: en Fonavi varias fechas de ingreso son de
 * un segundo registro y no del primer día de trabajo).
 */

export type PersonaDelMes = {
  dni: string;
  nombre: string;
  estado: string;
  fechaIngreso: string | null;
  fechaCese: string | null;
};

export type Elegibilidad = {
  /** Figuran cesados pero hicieron el mes completo: sí cobran. */
  cesadosQueCobran: PersonaDelMes[];
  /** Ingresaron después del día 1: no cobran este mes. */
  enPrueba: PersonaDelMes[];
};

export function elegibilidadDelMes(personas: PersonaDelMes[], month: string): Elegibilidad {
  const inicio = `${month}-01`;
  return {
    cesadosQueCobran: personas.filter((p) => p.estado !== "activo"),
    enPrueba: personas.filter((p) => p.fechaIngreso !== null && p.fechaIngreso > inicio),
  };
}
