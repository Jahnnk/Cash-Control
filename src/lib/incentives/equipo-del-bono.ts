/**
 * El equipo que entra al bono de un mes en una sede · lectura de datos.
 *
 * UNA sola definición para la liquidación (el pago) y para el panel de cada
 * sede (la proyección que ve el administrador): si cada uno armara su equipo
 * por su lado, la pantalla prometería lo que la liquidación no paga.
 *
 * Reglas (ver elegibilidad-bono.ts): el equipo activo de Cash Control, más
 * quien figura cesado en Planilla pero hizo el mes completo, menos quien está
 * en periodo de prueba o fue excluido por la dirección. La administración no
 * se excluye por prueba: el bono de administración es por puesto.
 */

import { leerHorasPlanilla, type PersonaPlanilla } from "./planilla-db";
import { leerExcepciones } from "./bono-excepciones-db";
import { elegibilidadDelMes } from "./elegibilidad-bono";
import type { StaffMember } from "./engine";

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<unknown>;

export type FilaEquipo = {
  name: string;
  dni: string | null;
  jornada: StaffMember["jornada"];
  area: string;
  horasSemanales: number | null;
};

export type EquipoDelBono = {
  staff: FilaEquipo[];
  excluidos: { dni: string; name: string; motivo: string; origen: "automatico" | "manual"; reglaId: number | null }[];
  incluidosPorExcepcion: { dni: string; name: string; motivo: string; reglaId: number }[];
  /** Observaciones en palabras simples para el acta y el reporte. */
  avisos: string[];
  /** Lo que se leyó de Planilla (null si no respondió): de aquí salen las horas del mes. */
  deLaPlanilla: PersonaPlanilla[] | null;
  excepcionesDisponibles: boolean;
};

export async function equipoDelBono(sql: Sql, bId: number, month: string): Promise<EquipoDelBono> {
  let deLaPlanilla: PersonaPlanilla[] | null = null;
  try {
    deLaPlanilla = await leerHorasPlanilla(bId, month);
  } catch (err) {
    console.error(`[equipo-del-bono] sede ${bId}: no pude leer quién trabajó el mes en Planilla —`, err);
  }
  const excepciones = await leerExcepciones(sql, bId);
  const elegibles = elegibilidadDelMes(deLaPlanilla ?? [], month, excepciones.reglas);
  const cesados = elegibles.cesadosQueCobran;

  const staffTodos = (await sql`
    SELECT name, dni, jornada, area, horas_semanales::float AS "horasSemanales"
      FROM staff
     WHERE business_id = ${bId} AND (active = true OR dni::text = ANY(${cesados.map((p) => p.dni)}::text[]))
     ORDER BY jornada, name
  `) as FilaEquipo[];

  const staff = staffTodos.filter((s) => !(s.dni && elegibles.excluidos.has(s.dni.trim())));
  const avisos: string[] = [];
  const excluidos: EquipoDelBono["excluidos"] = [];
  for (const s of staffTodos) {
    const ex = s.dni ? elegibles.excluidos.get(s.dni.trim()) : undefined;
    if (ex && s.dni) {
      excluidos.push({ dni: s.dni.trim(), name: s.name, motivo: ex.motivo, origen: ex.origen, reglaId: ex.reglaId });
      avisos.push(`${s.name} no entra al bono de este mes: ${ex.motivo}.`);
    }
  }
  const incluidosPorExcepcion = elegibles.incluidosPorExcepcion.map((i) => ({
    dni: i.dni, name: staffTodos.find((s) => s.dni?.trim() === i.dni)?.name ?? i.nombre ?? i.dni, motivo: i.motivo, reglaId: i.reglaId,
  }));
  for (const i of incluidosPorExcepcion) avisos.push(`${i.name} cobra por decisión de la dirección (${i.motivo}), aunque ingresó durante el mes.`);
  for (const c of cesados) {
    const s = staff.find((x) => x.dni?.trim() === c.dni);
    if (s) avisos.push(`${s.name} ya figura cesado en Planilla pero hizo el mes completo: sí recibe su parte del bono.${c.fechaCese ? "" : " (Falta cargar su fecha de cese en Planilla.)"}`);
  }
  return { staff, excluidos, incluidosPorExcepcion, avisos, deLaPlanilla, excepcionesDisponibles: excepciones.disponible };
}
