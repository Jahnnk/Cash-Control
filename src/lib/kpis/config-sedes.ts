/**
 * Cómo se espera que reporte cada sede (cafetería o no, qué días, de dónde sale el dato). UNA sola definición para
 * el cuadro semanal de Grupo, el panel de cada admin, el control de cumplimiento y la verificación de datos de la
 * reunión de los lunes (18-oct-2026): si cada uno la tuviera por su lado, dirección vería «falta» y el admin «al día».
 */

import { LUNES_A_SABADO, TODA_LA_SEMANA, type ModoRegistro } from "./llenado";

/** Atelier (1) es producción: no lleva NPS ni tiempos de salón. */
export const ES_CAFETERIA: Record<number, boolean> = { 1: false, 2: true, 3: true };

/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  QUÉ DÍAS SE ESPERA QUE REPORTE CADA SEDE                       │
 * │                                                                 │
 * │  Para que Atelier vuelva a reportar los domingos, cambia su     │
 * │  línea a TODA_LA_SEMANA. No hay que tocar nada más.             │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Atelier libra los domingos (día libre de su administrador, decisión
 * de Jahnn del 16-ago-2026): reclamárselo cada semana sería ruido fijo,
 * y una alerta que siempre está encendida deja de leerse.
 *
 * Si un domingo IGUAL registran, se muestra como cualquier día lleno:
 * el dato real siempre gana sobre lo esperado.
 */
export const DIAS_ESPERADOS: Record<number, number[]> = {
  1: LUNES_A_SABADO,   // Atelier
  2: TODA_LA_SEMANA,   // Fonavi
  3: TODA_LA_SEMANA,   // Centro
};

/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  DE DÓNDE SALE EL DATO DE CADA SEDE                             │
 * │                                                                 │
 * │  Cambia la línea de una sede a "manual" y su aviso pasa a       │
 * │  hablar de teclear el día, no de subir el reporte.              │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Atelier va como "importado" porque su día normal llega con el
 * reporte de Byte — pero su panel YA tiene formulario manual, y por
 * eso el aviso menciona los dos caminos. Esto solo cambia las
 * palabras: el día falta igual, venga de donde venga.
 */
export const MODO_REGISTRO: Record<number, ModoRegistro> = {
  1: "importado",  // Atelier
  2: "manual",     // Fonavi
  3: "manual",     // Centro
};

