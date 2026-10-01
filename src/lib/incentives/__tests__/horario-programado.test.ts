import { describe, it, expect } from "vitest";
import { horasProgramadasMes, horasProgramadasSemana, type FilaHorarioDia, type PatronUnico } from "../horario-programado";

const dia = (d: number, am: string | null, sam: string | null, pm: string | null, spm: string | null): FilaHorarioDia =>
  ({ dia: d, entradaAm: am, salidaAm: sam, entradaPm: pm, salidaPm: spm });

describe("horas programadas del mes (espejo de Planilla)", () => {
  it("Annika (Centro): contrato de 23.5 h pero su horario suma 27.5 h → 110 h al mes", () => {
    const dias = [
      dia(2, "08:00", "12:30", null, null),            // martes: solo mañana, 4.5
      dia(5, "08:00", "12:30", "15:30", "22:30"),      // viernes: partido, 4.5 + 7
      dia(6, "08:00", "12:30", "15:30", "22:30"),      // sábado: partido, 4.5 + 7
    ];
    expect(horasProgramadasSemana(dias, null)).toBe(27.5);
    expect(horasProgramadasMes(dias, null)).toBe(110);
  });

  it("Junior (Centro): seis días, partidos → 202 h; con los 75 min de tiempo extra Planilla muestra 203.25", () => {
    const dias = [
      dia(1, "08:00", "12:30", "15:30", "22:30"),
      dia(2, "08:00", "12:30", "15:30", "22:30"),
      dia(3, "08:00", "12:30", "08:00", "10:30"),
      dia(4, "08:00", "12:30", "18:00", "22:30"),
      dia(5, "10:00", "12:30", "20:00", "22:30"),
      dia(6, "08:00", "12:30", "08:30", "10:30"),
    ];
    expect(horasProgramadasMes(dias, null)).toBe(202);
    expect(horasProgramadasMes(dias, null)! + 75 / 60).toBe(203.25);
  });

  it("Diego (Centro): turnos cortos que no coinciden con el contrato → 52 h", () => {
    const dias = [dia(1, null, null, "17:00", "19:00"), dia(5, null, null, "05:00", "10:00"), dia(6, null, null, "04:30", "10:30")];
    expect(horasProgramadasMes(dias, null)).toBe(52);
  });

  it("sin horario por día, usa el patrón único en los días marcados", () => {
    const patron: PatronUnico = {
      tipoTurno: "partido", entradaAm: "08:00", salidaAm: "12:30", entradaPm: "15:30", salidaPm: "22:30",
      diasSemana: { lun: true, mar: true, mie: true, jue: true, vie: true, sab: true, dom: false },
    };
    expect(horasProgramadasMes([], patron)).toBe(11.5 * 6 * 4);
  });

  it("el horario por día manda sobre el patrón único", () => {
    const patron: PatronUnico = { tipoTurno: "simple", entradaAm: "08:00", salidaAm: null, entradaPm: null, salidaPm: "17:00", diasSemana: { lun: true } };
    expect(horasProgramadasMes([dia(1, "09:00", "13:00", null, null)], patron)).toBe(16);
  });

  it("sin ningún horario devuelve null (no inventa horas)", () => {
    expect(horasProgramadasMes([], null)).toBeNull();
  });

  it("una fila incompleta no suma", () => {
    expect(horasProgramadasSemana([dia(1, "08:00", null, null, null)], null)).toBe(0);
  });
});
