/**
 * Lectura (solo lectura) de la base de PLANILLA para los bonos.
 *
 * Son dos bases Neon distintas. Aquí vive el acceso a la de Planilla para
 * que la sincronización del roster, la de horas y el reporte de bonos lean
 * lo MISMO y de una sola manera. Nunca escribe en Planilla.
 *
 * No es un archivo "use server": son funciones internas que usan las
 * actions, no puntos de entrada públicos.
 */

import { neon } from "@neondatabase/serverless";
import { horasDelMesDesdePlanilla, type FilaPlanilla, type HorasDelMes } from "./horas-planilla";

/** Cash Control ↔ Planilla: qué empresa de Planilla es cada sede. */
export const PATRON_EMPRESA: Record<number, RegExp> = {
  1: /atelier/i,
  2: /fonavi/i,
  3: /centro/i,
};

/** La conexión a Planilla, o null si no está configurada. */
export function conexionPlanilla() {
  const url = process.env.PLANILLA_DATABASE_URL?.trim().replace(/^["']|["']$/g, "");
  return url ? neon(url) : null;
}

/**
 * Las horas del mes de TODAS las personas activas de una sede en Planilla,
 * con el desglose de dónde sale cada una (ver horas-planilla.ts).
 *
 * Devuelve null si Planilla no está configurada. Una persona sin forma de
 * calcular sus horas simplemente no aparece (la regla del todo-o-nada de
 * horas-trabajadas.ts decide qué hacer con ella).
 */
export async function leerHorasPlanilla(bId: number, month: string): Promise<HorasDelMes[] | null> {
  const planilla = conexionPlanilla();
  if (!planilla) {
    console.error("[horas-sync] PLANILLA_DATABASE_URL no está definida");
    return null;
  }
  const patron = PATRON_EMPRESA[bId];
  if (!patron) return null;

  const empresas = (await planilla`SELECT id, nombre FROM empresas`) as { id: string; nombre: string }[];
  const emp = empresas.find((e) => patron.test(e.nombre));
  if (!emp) {
    console.error(`[horas-sync] sede ${bId}: ninguna empresa de Planilla calza con ${patron}`);
    return [];
  }

  const anio = Number(month.slice(0, 4));
  const mes = Number(month.slice(5, 7));

  // Tres fuentes, cada una en su subconsulta (unirlas en una sola
  // multiplicaría filas). Los registros diarios son del MES CALENDARIO: el
  // bono se mide sobre ventas del 1 al 31, no sobre el ciclo de planilla.
  const rows = (await planilla`
    SELECT t.dni,
           t.horas_semanales::float AS semanales,
           (SELECT a.horas_trabajadas::float FROM ajustes_mes a
             WHERE a.trabajador_id = t.id AND a.anio = ${anio} AND a.mes = ${mes}) AS registradas,
           (SELECT SUM(r.horas_trabajadas)::float FROM resumen_dia r
             WHERE r.trabajador_id = t.id AND to_char(r.fecha, 'YYYY-MM') = ${month}) AS reloj,
           COALESCE((SELECT SUM(x.minutos) FROM registros_tiempo x
             WHERE x.trabajador_id = t.id AND x.tipo = 'falta' AND to_char(x.fecha, 'YYYY-MM') = ${month}), 0)::int AS min_falta,
           COALESCE((SELECT SUM(x.minutos) FROM registros_tiempo x
             WHERE x.trabajador_id = t.id AND x.tipo = 'tardanza' AND to_char(x.fecha, 'YYYY-MM') = ${month}), 0)::int AS min_tardanza,
           COALESCE((SELECT SUM(x.minutos) FROM registros_tiempo x
             WHERE x.trabajador_id = t.id AND x.tipo = 'tiempo_extra' AND to_char(x.fecha, 'YYYY-MM') = ${month}), 0)::int AS min_extra,
           COALESCE((SELECT SUM(x.minutos) FROM registros_tiempo x
             WHERE x.trabajador_id = t.id AND x.tipo = 'hora_no_marcada' AND to_char(x.fecha, 'YYYY-MM') = ${month}), 0)::int AS min_no_marcadas
    FROM trabajadores t
    WHERE t.empresa_id = ${emp.id} AND t.estado = 'activo' AND t.dni IS NOT NULL
  `) as {
    dni: string; semanales: number | null; registradas: number | null; reloj: number | null;
    min_falta: number; min_tardanza: number; min_extra: number; min_no_marcadas: number;
  }[];

  const out: HorasDelMes[] = [];
  for (const r of rows) {
    const fila: FilaPlanilla = {
      dni: String(r.dni),
      horasSemanales: r.semanales,
      horasRegistradas: r.registradas,
      horasReloj: r.reloj,
      minFalta: r.min_falta,
      minTardanza: r.min_tardanza,
      minTiempoExtra: r.min_extra,
      minNoMarcadas: r.min_no_marcadas,
    };
    const h = horasDelMesDesdePlanilla(fila);
    if (h) out.push(h);
  }
  return out;
}
