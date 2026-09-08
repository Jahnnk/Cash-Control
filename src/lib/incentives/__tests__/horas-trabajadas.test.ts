/**
 * Con qué horas se paga el bono, y qué pasa cuando faltan.
 *
 * Los casos son los REALES de Centro en agosto 2026, tomados del Excel
 * de bonos de Kelly: seis personas trabajaron por encima de su contrato
 * (Annika 110 h contra 94; Junior 202 contra 192) y dos hicieron
 * exactamente el suyo. Ese es el hueco que las horas de contrato no
 * veían.
 */
import { describe, it, expect } from "vitest";
import { resolverHorasDelMes, avisoHorasIncompletas } from "../horas-trabajadas";
import { bonoDeColaborador, horasDelMes, type IncentiveLevel, type StaffMember } from "../engine";

const NIVEL2: IncentiveLevel = {
  nombre: "Nivel 2", delta: 3,
  bono_tc: 97, bono_mt: 48, bono_admin: 179, premio_mv: 134,
};

const p = (name: string, dni: string | null, horasSemanales: number | null, active = true) =>
  ({ name, dni, horasSemanales, active, jornada: "medio_turno", area: "salon" }) as const;

/** Centro, agosto 2026: contrato vs lo que de verdad trabajaron. */
const CENTRO = [
  p("Annika", "11111111", 23.5),   // contrato 94 h · trabajó 110
  p("Junior", "22222222", 48),     // contrato 192 h · trabajó 202
  p("Diego", "33333333", 13),      // contrato 52 h · trabajó 52
  p("Mathias", "44444444", 23.5),  // contrato 94 h · trabajó 94
];
const TRABAJADAS = new Map([
  ["11111111", 110], ["22222222", 202], ["33333333", 52], ["44444444", 94],
]);

describe("cuando Planilla tiene las horas de todos", () => {
  it("se usan las trabajadas, no las de contrato", () => {
    const r = resolverHorasDelMes(CENTRO, TRABAJADAS);
    expect(r.usaTrabajadas).toBe(true);
    expect(r.faltantes).toEqual([]);
    expect(r.staff.find((s) => s.name === "Annika")!.horasMesTrabajadas).toBe(110);
  });

  it("quien hizo turnos de más cobra más", () => {
    const r = resolverHorasDelMes(CENTRO, TRABAJADAS);
    const annika = r.staff.find((s) => s.name === "Annika")! as StaffMember;
    const mathias = r.staff.find((s) => s.name === "Mathias")! as StaffMember;
    // Mismo contrato (23.5 h/sem), pero Annika trabajó 16 h más.
    expect(bonoDeColaborador(mathias, NIVEL2, "2026-09")).toBe(48);
    expect(bonoDeColaborador(annika, NIVEL2, "2026-09")).toBe(56);
  });

  it("quien hizo justo su contrato cobra exactamente lo de antes", () => {
    const r = resolverHorasDelMes(CENTRO, TRABAJADAS);
    const diego = r.staff.find((s) => s.name === "Diego")! as StaffMember;
    expect(bonoDeColaborador(diego, NIVEL2, "2026-09")).toBe(27);
  });

  it("coincide con el Excel de Kelly hasta el redondeo", () => {
    // Kelly: Annika S/56.18 · Junior S/103.16 · Diego S/26.56 · Mathias S/48.01
    const r = resolverHorasDelMes(CENTRO, TRABAJADAS);
    const monto = (n: string) =>
      bonoDeColaborador(r.staff.find((s) => s.name === n)! as StaffMember, NIVEL2, "2026-09");
    expect(monto("Annika")).toBe(56);
    expect(monto("Junior")).toBe(103);
    expect(monto("Diego")).toBe(27);
    expect(monto("Mathias")).toBe(48);
  });
});

describe("la regla del todo-o-nada", () => {
  it("si a UNO le faltan horas, TODOS van con las de contrato", () => {
    const parcial = new Map(TRABAJADAS);
    parcial.delete("11111111");           // a Annika no le cargaron la asistencia
    const r = resolverHorasDelMes(CENTRO, parcial);
    expect(r.usaTrabajadas).toBe(false);
    expect(r.faltantes).toEqual(["Annika"]);
    // Junior trabajó 202 h, pero se le paga por sus 192 de contrato:
    // dos varas distintas en el mismo equipo sería peor que esto.
    const junior = r.staff.find((s) => s.name === "Junior")! as StaffMember;
    expect(junior.horasMesTrabajadas).toBeNull();
    expect(bonoDeColaborador(junior, NIVEL2, "2026-09")).toBe(98);
  });

  it("un cero no es un dato: cuenta como faltante", () => {
    // Alguien sin asistencia cargada aparece en 0. Pagarle S/0 de bono
    // por un vacío de registro es el error que la regla evita.
    const conCero = new Map(TRABAJADAS).set("11111111", 0);
    const r = resolverHorasDelMes(CENTRO, conCero);
    expect(r.usaTrabajadas).toBe(false);
    expect(r.faltantes).toEqual(["Annika"]);
  });

  it("sin DNI no hay cómo cruzar con Planilla: también es faltante", () => {
    const sinDni = [...CENTRO, p("Nuevo", null, 23.5)];
    const r = resolverHorasDelMes(sinDni, TRABAJADAS);
    expect(r.usaTrabajadas).toBe(false);
    expect(r.faltantes).toEqual(["Nuevo"]);
  });

  it("quien está de baja no bloquea al resto", () => {
    const conBaja = [...CENTRO, p("Micaela", "99999999", 23.5, false)];
    const r = resolverHorasDelMes(conBaja, TRABAJADAS);
    expect(r.usaTrabajadas).toBe(true);
  });

  it("Planilla vacía = contrato para todos (el caso de hoy)", () => {
    const r = resolverHorasDelMes(CENTRO, new Map());
    expect(r.usaTrabajadas).toBe(false);
    expect(r.faltantes).toHaveLength(4);
  });
});

describe("el aviso nombra a quién le falta", () => {
  it("dice los nombres, no solo cuántos", () => {
    const aviso = avisoHorasIncompletas(["Annika", "Junior"]);
    expect(aviso).toContain("Annika");
    expect(aviso).toContain("Junior");
    expect(aviso).toContain("horas de contrato");
  });

  it("con muchos, corta la lista pero dice el total", () => {
    const aviso = avisoHorasIncompletas(["A", "B", "C", "D", "E", "F", "G"]);
    expect(aviso).toContain("7 persona");
    expect(aviso).toContain("y 2 más");
  });
});

describe("el orden de preferencia de las horas", () => {
  it("trabajadas primero, contrato de red", () => {
    expect(horasDelMes({ name: "X", jornada: "medio_turno", area: "salon", active: true,
      horasSemanales: 23.5, horasMesTrabajadas: 110 })).toBe(110);
    expect(horasDelMes({ name: "X", jornada: "medio_turno", area: "salon", active: true,
      horasSemanales: 23.5, horasMesTrabajadas: null })).toBe(94);
    expect(horasDelMes({ name: "X", jornada: "medio_turno", area: "salon", active: true,
      horasSemanales: null, horasMesTrabajadas: null })).toBeNull();
  });

  it("agosto sigue pagando la tabla fija aunque haya horas trabajadas", () => {
    const annika = { name: "Annika", jornada: "medio_turno", area: "salon", active: true,
      horasSemanales: 23.5, horasMesTrabajadas: 110 } as StaffMember;
    expect(bonoDeColaborador(annika, NIVEL2, "2026-08")).toBe(48);
    expect(bonoDeColaborador(annika, NIVEL2, "2026-09")).toBe(56);
  });
});
