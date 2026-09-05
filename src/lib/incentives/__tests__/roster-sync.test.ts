/**
 * Planilla manda, Cash Control refleja.
 *
 * El caso que lo originó: en agosto el roster de bonos tenía a Micaela
 * (que ya no trabajaba) y le faltaba Piero (que hizo 80 h). El sistema
 * pagó S/48 a quien no correspondía y S/0 a quien sí.
 */
import { describe, it, expect } from "vitest";
import {
  planificarSync, planVacio, derivarJornada, derivarArea, nombreCorto,
  type TrabajadorPlanilla, type StaffCash,
} from "../roster-sync";

const pl = (dni: string, nombre: string, area: string | null, horas: number | null): TrabajadorPlanilla =>
  ({ dni, nombre, area, horasSemanales: horas });
const cash = (over: Partial<StaffCash> & { id: string; name: string }): StaffCash =>
  ({ dni: null, area: "salon", jornada: "medio_turno", horasSemanales: null, active: true, ...over });

describe("qué jornada le toca a cada quien", () => {
  it("el área de administración manda sobre las horas", () => {
    // Chari tiene 48 h como Junior, pero su tabla de bono es otra
    // (S/179 contra S/98). Si se decidiera solo por horas, cobraría mal.
    expect(derivarJornada("Administrativos", 48)).toBe("administrador");
    expect(derivarJornada("Asesores", 48)).toBe("tiempo_completo");
  });

  it("48 horas es tiempo completo; menos, medio turno", () => {
    expect(derivarJornada("Asesores", 48)).toBe("tiempo_completo");
    expect(derivarJornada("Cocina", 47.5)).toBe("medio_turno");
    expect(derivarJornada("Asesores", 13)).toBe("medio_turno");
  });

  it("sin horas no se asume jornada completa", () => {
    // Ante la duda, medio turno: el motor cae a la tabla fija y nadie
    // cobra de más por un dato que falta.
    expect(derivarJornada("Asesores", null)).toBe("medio_turno");
  });

  it("traduce las áreas de Planilla al vocabulario de Cash Control", () => {
    expect(derivarArea("Asesores")).toBe("salon");
    expect(derivarArea("Cocina")).toBe("cocina");
    expect(derivarArea("Panadería")).toBe("cocina");
    expect(derivarArea("Administrativos")).toBe("administracion");
    expect(derivarArea(null)).toBe("salon");
  });

  it("acorta el nombre como lo usa el equipo", () => {
    expect(nombreCorto("Teresa Elena Briones Suarez")).toBe("Teresa");
    expect(nombreCorto("MILAGROS LUZIANA TERAN ROJAS")).toBe("Milagros");
    expect(nombreCorto("  Renzo   Arteaga  ")).toBe("Renzo");
  });
});

describe("el caso de agosto que originó todo", () => {
  const enPlanilla = [
    pl("72678416", "Teresa Elena Briones Suarez", "Asesores", 23.5),
    pl("73879800", "PIERO RENATO OBANDO ALVAREZ", "Asesores", 20),
  ];
  const enCash = [
    cash({ id: "1", name: "Teresa", dni: "72678416", horasSemanales: 23.5 }),
    cash({ id: "2", name: "Micaela", dni: "99999999" }),
  ];

  it("da de baja a quien ya no está en Planilla", () => {
    const p = planificarSync(enPlanilla, enCash);
    expect(p.bajas).toHaveLength(1);
    expect(p.bajas[0].name).toBe("Micaela");
  });

  it("da de alta a quien trabaja y no estaba en el roster", () => {
    const p = planificarSync(enPlanilla, enCash);
    expect(p.altas).toHaveLength(1);
    expect(p.altas[0]).toMatchObject({ name: "Piero", dni: "73879800", horasSemanales: 20 });
  });

  it("no toca a quien ya está bien", () => {
    const p = planificarSync(enPlanilla, enCash);
    expect(p.cambios.filter((c) => c.name === "Teresa")).toHaveLength(0);
  });
});

describe("cambios de horas", () => {
  it("detecta cuando en Planilla le cambian el horario", () => {
    const p = planificarSync(
      [pl("60879780", "Diego Israel Robles", "Asesores", 20)],
      [cash({ id: "1", name: "Diego", dni: "60879780", horasSemanales: 13 })],
    );
    expect(p.cambios).toHaveLength(1);
    expect(p.cambios[0]).toMatchObject({ name: "Diego", campo: "horasSemanales", de: "13", a: "20" });
  });

  it("detecta cuando alguien pasa a jornada completa", () => {
    const p = planificarSync(
      [pl("111", "Renzo Arteaga", "Asesores", 48)],
      [cash({ id: "1", name: "Renzo", dni: "111", horasSemanales: 23.5, jornada: "medio_turno" })],
    );
    expect(p.cambios.map((c) => c.campo).sort()).toEqual(["horasSemanales", "jornada"]);
  });

  it("reactiva a quien volvió al equipo", () => {
    const p = planificarSync(
      [pl("111", "Renzo Arteaga", "Asesores", 23.5)],
      [cash({ id: "1", name: "Renzo", dni: "111", horasSemanales: 23.5, active: false })],
    );
    expect(p.reactivaciones).toHaveLength(1);
    expect(p.bajas).toHaveLength(0);
  });
});

describe("lo que NO se hace, y por qué", () => {
  it("NUNCA da de baja a alguien sin DNI: lo reporta", () => {
    // Sin DNI no hay forma segura de emparejar. Dejar a alguien sin bono
    // por un dato faltante es peor que pagarle un mes de más.
    const p = planificarSync([], [cash({ id: "1", name: "Fernanda", dni: null })]);
    expect(p.bajas).toHaveLength(0);
    expect(p.sinDni).toHaveLength(1);
    expect(p.sinDni[0].name).toBe("Fernanda");
  });

  it("no vuelve a dar de baja a quien ya está inactivo", () => {
    const p = planificarSync([], [cash({ id: "1", name: "Micaela", dni: "999", active: false })]);
    expect(p.bajas).toHaveLength(0);
  });

  it("no borra el nombre que alguien ya tiene en Cash Control", () => {
    // "Raúl" en el roster es "Luis Raúl Marín Chávez" en Planilla. El
    // nombre corto solo se usa en las ALTAS: cambiarlo reescribiría
    // actas ya firmadas.
    const p = planificarSync(
      [pl("72455426", "Luis Raúl Marín Chávez", "Asesores", 23.5)],
      [cash({ id: "1", name: "Raúl", dni: "72455426", horasSemanales: 23.5 })],
    );
    expect(planVacio(p)).toBe(true);
  });

  it("sin cambios, el plan queda vacío", () => {
    const p = planificarSync(
      [pl("111", "Teresa Briones", "Asesores", 23.5)],
      [cash({ id: "1", name: "Teresa", dni: "111", horasSemanales: 23.5 })],
    );
    expect(planVacio(p)).toBe(true);
  });
});

describe("dos personas con el mismo nombre de pila", () => {
  it("los distingue por apellido — el caso real de los dos Pieros de Fonavi", () => {
    const p = planificarSync(
      [
        pl("73769464", "Piero André Manosalva Alvarez", "Asesores", 26),
        pl("73879800", "PIERO RENATO OBANDO ALVAREZ", "Asesores", 15.5),
      ],
      [],
    );
    const nombres = p.altas.map((a) => a.name);
    expect(new Set(nombres).size).toBe(2);
    expect(nombres[0]).toBe("Piero");
    expect(nombres[1]).toBe("Piero Renato");
  });

  it("tampoco choca con alguien que ya está en el roster", () => {
    const p = planificarSync(
      [pl("999", "Teresa Ramírez Solís", "Asesores", 23.5)],
      [cash({ id: "1", name: "Teresa", dni: "72678416", horasSemanales: 23.5 })],
    );
    expect(p.altas[0].name).toBe("Teresa Ramírez");
  });
});
