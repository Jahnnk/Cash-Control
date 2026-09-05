/**
 * El bono se paga por HORAS DEL CONTRATO, no por etiqueta de jornada.
 *
 * Agosto 2026 lo destapó: Diego cobró los mismos S/48 que Teresa
 * trabajando la mitad. No porque incumpliera —hizo el 100% de su
 * contrato de 13 h/semana, acordado por sus estudios— sino porque la
 * tabla solo distinguía "medio turno" de "tiempo completo" y ahí caben
 * contratos muy distintos.
 *
 * Lo que casi nadie había notado es que la tabla YA pagaba por hora:
 *   medio turno     S/48 ÷  94 h = S/0.5106
 *   tiempo completo S/97 ÷ 192 h = S/0.5052
 *
 * Así que esto no inventa una tarifa: aplica la que ya existía a las
 * horas de cada contrato. Decisión de Jahnn (5-sep-2026), sin piso
 * mínimo y sobre horas de contrato (no las realmente trabajadas: el
 * sobretiempo lo paga la planilla, no el bono).
 */
import { describe, it, expect } from "vitest";
import {
  bonoDeColaborador,
  tarifaHoraBono,
  bonusTableSum,
  HORAS_MES_MEDIO_TURNO,
  type IncentiveLevel,
  type StaffMember,
} from "../engine";

/** Nivel 2 real de Centro (config vigente). */
const NIVEL2: IncentiveLevel = {
  nombre: "Nivel 2", delta: 3,
  bono_tc: 97, bono_mt: 48, bono_admin: 179, premio_mv: 134,
};

const persona = (
  name: string,
  jornada: StaffMember["jornada"],
  horasSemanales?: number | null,
): StaffMember => ({ name, jornada, area: "salon", active: true, horasSemanales });

describe("la tarifa sale de la tabla que ya existía", () => {
  it("el medio turno estándar cobra EXACTAMENTE lo de siempre", () => {
    // El ancla de todo: quien está en 23.5 h/semana no ve ningún cambio.
    expect(bonoDeColaborador(persona("Teresa", "medio_turno", 23.5), NIVEL2)).toBe(48);
  });

  it("la tarifa es la del medio turno dividida entre sus horas", () => {
    expect(HORAS_MES_MEDIO_TURNO).toBe(94);
    expect(tarifaHoraBono(NIVEL2)).toBeCloseTo(48 / 94, 6);
  });

  it("el tiempo completo queda casi igual que con la tabla vieja", () => {
    // S/97 era la tabla; 192 h × S/0.5106 = S/98. La diferencia de S/1
    // es la que ya existía entre las dos tarifas, ahora explícita.
    expect(bonoDeColaborador(persona("Junior", "tiempo_completo", 48), NIVEL2)).toBe(98);
  });
});

describe("los casos que originaron el cambio", () => {
  it("Diego (13 h/semana) cobra la mitad que Teresa, no lo mismo", () => {
    const diego = bonoDeColaborador(persona("Diego", "medio_turno", 13), NIVEL2);
    const teresa = bonoDeColaborador(persona("Teresa", "medio_turno", 23.5), NIVEL2);
    expect(diego).toBe(27);
    expect(teresa).toBe(48);
    // Su contrato es 13/23.5 del de Teresa (55.3%) y su bono 27/48
    // (56.3%). La diferencia es el redondeo: 26.55 sube a 27, y ese
    // medio sol lo gana el colaborador, no la empresa.
    expect(diego / teresa).toBeCloseTo(13 / 23.5, 1);
  });

  it("Piero (20 h/semana) queda entre Diego y Teresa", () => {
    expect(bonoDeColaborador(persona("Piero", "medio_turno", 20), NIVEL2)).toBe(41);
  });

  it("quien tiene más horas cobra más — sin excepciones", () => {
    const equipo = [
      persona("Diego", "medio_turno", 13),
      persona("Piero", "medio_turno", 20),
      persona("Teresa", "medio_turno", 23.5),
      persona("Junior", "tiempo_completo", 48),
    ];
    const bonos = equipo.map((p) => bonoDeColaborador(p, NIVEL2));
    for (let i = 1; i < bonos.length; i++) expect(bonos[i]).toBeGreaterThan(bonos[i - 1]);
  });
});

describe("lo que NO cambia", () => {
  it("la administradora sigue con su monto fijo", () => {
    // Su trabajo no escala con las horas de salón y su tarifa es otra
    // por diseño (S/0.93 la hora, no S/0.51).
    expect(bonoDeColaborador(persona("Chari", "administrador", 48), NIVEL2)).toBe(179);
    expect(bonoDeColaborador(persona("Chari", "administrador", null), NIVEL2)).toBe(179);
  });

  it("sin horas cargadas se cae a la tabla de siempre", () => {
    // Pagar de menos por un dato que falta sería peor que pagar el
    // estándar: nadie pierde plata por una sincronización pendiente.
    expect(bonoDeColaborador(persona("X", "medio_turno", null), NIVEL2)).toBe(48);
    expect(bonoDeColaborador(persona("Y", "tiempo_completo", undefined), NIVEL2)).toBe(97);
    expect(bonoDeColaborador(persona("Z", "medio_turno", 0), NIVEL2)).toBe(48);
  });
});

describe("el equipo real de Centro, agosto 2026", () => {
  const CENTRO: StaffMember[] = [
    persona("Chari", "administrador", 48),
    persona("Junior", "tiempo_completo", 48),
    persona("Verónica", "tiempo_completo", 48),
    persona("Annika", "medio_turno", 23.5),
    persona("Teresa", "medio_turno", 23.5),
    persona("Milagros", "medio_turno", 23.5),
    persona("Raúl", "medio_turno", 23.5),
    persona("Renzo", "medio_turno", 23.5),
    persona("Mathias", "medio_turno", 23.5),
    persona("Piero", "medio_turno", 20),
    persona("Diego", "medio_turno", 13),
  ];

  it("baja S/26 respecto de la tabla vieja, y se sabe exactamente por qué", () => {
    // Tabla vieja: 179 + 97×2 + 48×8 + 134 = S/891.
    // Por horas de CONTRATO: 179 + 98×2 + 48×6 + 41 + 27 + 134 = S/865.
    //
    // La baja no sale de recortarle a nadie el estándar: Piero (−7) y
    // Diego (−21) pasan a cobrar lo que corresponde a su contrato, y a
    // cambio los de tiempo completo suben S/1 cada uno.
    //
    // Lo que NO paga esta regla es el sobretiempo: en agosto varios
    // trabajaron por encima de su contrato (Annika 110 h de 94), y esas
    // horas las paga la planilla, no el bono. Fue decisión explícita de
    // Jahnn al elegir horas de contrato sobre horas reales.
    const conHoras = bonusTableSum(CENTRO, NIVEL2);
    const sinHoras = bonusTableSum(CENTRO.map((p) => ({ ...p, horasSemanales: null })), NIVEL2);
    expect(sinHoras).toBe(891);
    expect(conHoras).toBe(865);
  });

  it("cabe en el pozo de agosto (S/1,263.82)", () => {
    expect(bonusTableSum(CENTRO, NIVEL2)).toBeLessThan(1263.82);
  });
});
