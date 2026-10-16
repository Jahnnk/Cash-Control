/**
 * La explicación de los montos del bono (16-oct-2026): tiene que cuadrar con el motor, al sol.
 * Caso real: Fonavi octubre sin Luana ni Fabio → Nivel 1 = S/434.
 */
import { describe, it, expect } from "vitest";
import { explicarBono } from "../explicacion-bono";
import { bonusTableSum, type IncentiveLevel, type StaffMember } from "../engine";

const N1: IncentiveLevel = { nombre: "Nivel 1", delta: 1.5, bono_mt: 24, bono_tc: 48, bono_admin: 89, premio_mv: 68 };
const N2: IncentiveLevel = { nombre: "Nivel 2", delta: 3, bono_mt: 48, bono_tc: 97, bono_admin: 179, premio_mv: 134 };
const p = (name: string, jornada: StaffMember["jornada"], horasMesTrabajadas: number | null, horasSemanales: number | null = null): StaffMember =>
  ({ name, jornada, area: "salon", active: true, horasSemanales, horasMesTrabajadas });
const EQUIPO = [p("Dagnia", "administrador", 192), p("Alisson", "medio_turno", 94), p("Annika", "medio_turno", 84), p("Fabio", "tiempo_completo", 192), p("Diego", "medio_turno", 54.25)];
const porNivel = [{ level: N1, pozoNivel: 447.4, colchon: 447.4 - bonusTableSum(EQUIPO, N1) }, { level: N2, pozoNivel: 894.8, colchon: null }];

describe("la explicación cuadra con el motor", () => {
  const x = explicarBono({ staff: EQUIPO, levels: [N2, N1], porNivel, excluidos: [], usaTrabajadas: true });

  it("el total de cada nivel es EL MISMO que da el motor (personas + premio al mejor vendedor)", () => {
    expect(x.niveles[0].total).toBe(bonusTableSum(EQUIPO, N1));
    expect(x.niveles[1].total).toBe(bonusTableSum(EQUIPO, N2));
    expect(x.niveles[0].sumaPersonas + x.niveles[0].premioMv).toBeCloseTo(x.niveles[0].total, 2);
  });

  it("los niveles salen de menor a mayor aunque lleguen desordenados", () => {
    expect(x.niveles.map((n) => n.nombre)).toEqual(["Nivel 1", "Nivel 2"]);
  });

  it("cada persona cobra sus horas × la tarifa: 94 h → S/24, 84 h → S/21, 54 h → S/14; el administrador, S/89 fijos", () => {
    const monto = (nombre: string) => x.personas.find((q) => q.nombre === nombre)!.montos[0];
    expect([monto("Alisson"), monto("Annika"), monto("Diego"), monto("Dagnia")]).toEqual([24, 21, 14, 89]);
    expect(monto("Fabio")).toBe(49);
  });

  it("la suma de lo que cobra cada persona + el premio da el total del nivel", () => {
    const suma = x.personas.reduce((t, q) => t + q.montos[0], 0) + x.niveles[0].premioMv;
    expect(suma).toBe(x.niveles[0].total);
  });

  it("el administrador va primero y después, de más a menos", () => {
    expect(x.personas.map((q) => q.nombre)).toEqual(["Dagnia", "Fabio", "Alisson", "Annika", "Diego"]);
  });
});

describe("la tarifa y el colchón", () => {
  const x = explicarBono({ staff: EQUIPO, levels: [N1, N2], porNivel, excluidos: [], usaTrabajadas: true });

  it("una hora de bono vale el bono del medio turno ÷ 94 horas", () => {
    expect(x.niveles[0].tarifaHora).toBeCloseTo(24 / 94, 3);
    expect(x.horasMedioTurno).toBe(94);
  });

  it("trae el pozo y el colchón que ya calculó el motor, sin recalcularlos", () => {
    expect(x.niveles[0].pozo).toBe(447.4);
    expect(x.niveles[0].colchon).toBeCloseTo(447.4 - x.niveles[0].total, 2);
    expect(x.niveles[1].colchon).toBeNull();
  });
});

describe("quién no entra y de dónde salen las horas", () => {
  it("lista a los excluidos con su motivo", () => {
    const x = explicarBono({ staff: EQUIPO, levels: [N1], porNivel, excluidos: [{ nombre: "Luana", motivo: "No participa en el bono: marketing" }], usaTrabajadas: false });
    expect(x.excluidos).toEqual([{ nombre: "Luana", motivo: "No participa en el bono: marketing" }]);
    expect(x.horasDe).toBe("contrato");
  });

  it("las personas inactivas no cuentan", () => {
    const x = explicarBono({ staff: [...EQUIPO, { ...p("Baja", "medio_turno", 94), active: false }], levels: [N1], porNivel, excluidos: [], usaTrabajadas: true });
    expect(x.personas.some((q) => q.nombre === "Baja")).toBe(false);
  });
});
