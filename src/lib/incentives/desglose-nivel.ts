/**
 * Cuánto se reparte en un nivel y cómo se calcula · lógica PURA.
 *
 * Lo usan el reporte (PDF y Excel, dirección) y el panel de cada sede
 * (administrador), para que digan exactamente lo mismo y se pueda explicar el
 * número paso a paso:
 *
 *   total = bonos por horas + administración + premio al mejor vendedor
 *
 *   · bonos por horas: las horas del mes de cada persona × el valor por hora
 *     del nivel (el bono de un medio turno ÷ 94 h), redondeado al sol por persona;
 *   · administración: un monto fijo por puesto;
 *   · premio: un monto fijo para una sola persona.
 *
 * Por eso dos sedes con la misma tabla reparten montos distintos: depende de
 * las horas de su equipo.
 */

import { bonoDeColaborador, tarifaHoraBono, HORAS_MES_MEDIO_TURNO, type IncentiveLevel, type StaffMember } from "./engine";

export type PersonaDelDesglose = {
  name: string;
  jornada: StaffMember["jornada"];
  /** Horas del mes con las que se calcula (null = sin horas: cae a la tabla fija). */
  horasMes: number | null;
};

export type DesgloseNivel = {
  /** Lo que vale una hora de bono en este nivel. */
  valorHora: number;
  /** Suma de horas del equipo (sin la administración, que cobra monto fijo). */
  horasEquipo: number;
  personasPorHoras: number;
  bonosPorHoras: number;
  administracion: number;
  premio: number;
  total: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function desgloseDeNivel(personas: PersonaDelDesglose[], level: IncentiveLevel, month: string): DesgloseNivel {
  let horasEquipo = 0;
  let personasPorHoras = 0;
  let bonosPorHoras = 0;
  let administracion = 0;
  for (const p of personas) {
    const bono = bonoDeColaborador({ name: p.name, jornada: p.jornada, area: "", active: true, horasMesTrabajadas: p.horasMes }, level, month);
    if (p.jornada === "administrador") {
      administracion += bono;
    } else {
      bonosPorHoras += bono;
      personasPorHoras += 1;
      horasEquipo += p.horasMes ?? 0;
    }
  }
  return {
    valorHora: Math.round(tarifaHoraBono(level) * 10000) / 10000,
    horasEquipo: r2(horasEquipo),
    personasPorHoras,
    bonosPorHoras,
    administracion,
    premio: level.premio_mv,
    total: r2(bonosPorHoras + administracion + level.premio_mv),
  };
}

/** Ejemplos para entender el valor por hora: un medio turno de 94 h y un tiempo completo de 192 h. */
export function ejemplosDeBono(level: IncentiveLevel): { medioTurno: number; tiempoCompleto: number } {
  const t = tarifaHoraBono(level);
  return { medioTurno: Math.round(HORAS_MES_MEDIO_TURNO * t), tiempoCompleto: Math.round(192 * t) };
}
