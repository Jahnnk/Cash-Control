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
import { horasProgramadasMes, type FilaHorarioDia, type PatronUnico } from "./horario-programado";

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

/** Una persona de Planilla con sus horas del mes y los datos para decidir si entra al bono. */
export type PersonaPlanilla = HorasDelMes & {
  nombre: string;
  estado: "activo" | "cesado" | string;
  /** Fecha de ingreso (YYYY-MM-DD). */
  fechaIngreso: string | null;
  /** Fecha de cese (YYYY-MM-DD); null si no la cargaron. */
  fechaCese: string | null;
};

/**
 * Las horas del mes de las personas de una sede en Planilla, con el desglose
 * de dónde sale cada una (ver horas-planilla.ts).
 *
 * Entran las personas ACTIVAS y las CESADAS QUE HICIERON EL MES COMPLETO:
 * alguien que se fue el 30 de septiembre cobra su parte del bono aunque hoy
 * figure cesado (caso de Junior, Centro, septiembre 2026). Se sabe que hizo el
 * mes completo por su fecha de cese (el último día del mes o después) o, si
 * nadie la cargó, por tener tiempo registrado en los últimos tres días. Quien
 * se fue a mitad de mes no entra: no completó el mes.
 *
 * Devuelve null si Planilla no está configurada. Una persona sin forma de
 * calcular sus horas simplemente no aparece (la regla del todo-o-nada de
 * horas-trabajadas.ts decide qué hacer con ella).
 */
export async function leerHorasPlanilla(bId: number, month: string): Promise<PersonaPlanilla[] | null> {
  const planilla = conexionPlanilla();
  if (!planilla) {
    console.error("[horas-sync] PLANILLA_DATABASE_URL no está definida");
    return null;
  }
  const patron = PATRON_EMPRESA[bId];
  if (!patron) return null;

  const empresas = (await planilla`SELECT id, nombre, base_horas::text AS base_horas FROM empresas`) as { id: string; nombre: string; base_horas: string }[];
  const emp = empresas.find((e) => patron.test(e.nombre));
  if (!emp) {
    console.error(`[horas-sync] sede ${bId}: ninguna empresa de Planilla calza con ${patron}`);
    return [];
  }

  const anio = Number(month.slice(0, 4));
  const mes = Number(month.slice(5, 7));
  const finMes = `${month}-${String(new Date(anio, mes, 0).getDate()).padStart(2, "0")}`;

  // Los registros diarios son del MES CALENDARIO: el bono se mide sobre ventas
  // del 1 al 31, no sobre el ciclo de planilla. Cada fuente va en su
  // subconsulta (unirlas en una sola multiplicaría filas).
  const rows = (await planilla`
    SELECT t.id::text AS id, t.dni, t.nombre_completo AS nombre, t.estado::text AS estado,
           t.fecha_ingreso::text AS ingreso, t.fecha_cese::text AS cese,
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
    WHERE t.empresa_id = ${emp.id} AND t.dni IS NOT NULL
      AND (
        t.estado = 'activo'
        OR (t.estado = 'cesado' AND (
              t.fecha_cese >= ${finMes}::date
              OR (t.fecha_cese IS NULL AND EXISTS (
                    SELECT 1 FROM registros_tiempo x
                    WHERE x.trabajador_id = t.id AND x.fecha BETWEEN (${finMes}::date - 2) AND ${finMes}::date))
        ))
      )
  `) as {
    id: string; dni: string; nombre: string; estado: string; ingreso: string | null; cese: string | null;
    semanales: number | null; registradas: number | null; reloj: number | null;
    min_falta: number; min_tardanza: number; min_extra: number; min_no_marcadas: number;
  }[];
  if (rows.length === 0) return [];

  // Los horarios, de todos de una vez.
  const ids = rows.map((r) => r.id);
  const porDia = (await planilla`
    SELECT trabajador_id::text AS tid, dia, entrada_am::text AS entrada_am, salida_am::text AS salida_am,
           entrada_pm::text AS entrada_pm, salida_pm::text AS salida_pm
    FROM horarios_dia WHERE trabajador_id::text = ANY(${ids})
  `) as { tid: string; dia: number; entrada_am: string | null; salida_am: string | null; entrada_pm: string | null; salida_pm: string | null }[];
  const patrones = (await planilla`
    SELECT trabajador_id::text AS tid, tipo_turno::text AS tipo, entrada_am::text AS entrada_am, salida_am::text AS salida_am,
           entrada_pm::text AS entrada_pm, salida_pm::text AS salida_pm, dias_semana
    FROM horarios_trabajador WHERE trabajador_id::text = ANY(${ids})
  `) as { tid: string; tipo: string; entrada_am: string; salida_am: string | null; entrada_pm: string | null; salida_pm: string; dias_semana: Record<string, boolean> }[];

  const diasDe = new Map<string, FilaHorarioDia[]>();
  for (const d of porDia) {
    const lista = diasDe.get(d.tid) ?? [];
    lista.push({ dia: d.dia, entradaAm: d.entrada_am, salidaAm: d.salida_am, entradaPm: d.entrada_pm, salidaPm: d.salida_pm });
    diasDe.set(d.tid, lista);
  }
  const patronDe = new Map<string, PatronUnico>();
  for (const h of patrones) {
    patronDe.set(h.tid, {
      tipoTurno: h.tipo === "partido" ? "partido" : "simple",
      entradaAm: h.entrada_am, salidaAm: h.salida_am, entradaPm: h.entrada_pm, salidaPm: h.salida_pm,
      diasSemana: h.dias_semana ?? {},
    });
  }

  const out: PersonaPlanilla[] = [];
  for (const r of rows) {
    const fila: FilaPlanilla = {
      dni: String(r.dni),
      horasProgramadas: horasProgramadasMes(diasDe.get(r.id) ?? [], patronDe.get(r.id) ?? null),
      horasSemanales: r.semanales,
      horasRegistradas: r.registradas,
      // El reloj solo cuenta en las sedes que liquidan por reloj: en las demás
      // `resumen_dia` es un resto de pruebas y no manda.
      horasReloj: emp.base_horas === "reloj" ? r.reloj : null,
      minFalta: r.min_falta,
      minTardanza: r.min_tardanza,
      minTiempoExtra: r.min_extra,
      minNoMarcadas: r.min_no_marcadas,
    };
    const h = horasDelMesDesdePlanilla(fila);
    if (h) out.push({ ...h, nombre: r.nombre, estado: r.estado, fechaIngreso: r.ingreso, fechaCese: r.cese });
  }
  return out;
}
