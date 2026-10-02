import { describe, it, expect } from "vitest";
import { desgloseDeNivel, ejemplosDeBono } from "../desglose-nivel";

const N2 = { nombre: "Nivel 2", delta: 3, bono_tc: 97, bono_mt: 48, bono_admin: 179, premio_mv: 134 };
const N1 = { nombre: "Nivel 1", delta: 1.5, bono_tc: 48, bono_mt: 24, bono_admin: 89, premio_mv: 68 };

describe("desgloseDeNivel", () => {
  const equipo = [
    { name: "Ana", jornada: "medio_turno" as const, horasMes: 94 },
    { name: "Beto", jornada: "medio_turno" as const, horasMes: 52 },
    { name: "Caro", jornada: "tiempo_completo" as const, horasMes: 192 },
    { name: "Admin", jornada: "administrador" as const, horasMes: 192 },
  ];

  it("suma bonos por horas, administración y premio, y dice las horas del equipo", () => {
    const d = desgloseDeNivel(equipo, N2, "2026-09");
    expect(d.valorHora).toBe(0.5106);
    expect(d.horasEquipo).toBe(94 + 52 + 192); // el administrador cobra fijo: no suma horas
    expect(d.personasPorHoras).toBe(3);
    expect(d.bonosPorHoras).toBe(48 + 27 + 98); // 94 h → 48; 52 h → 27; 192 h → 98
    expect(d.administracion).toBe(179);
    expect(d.premio).toBe(134);
    expect(d.total).toBe(48 + 27 + 98 + 179 + 134);
  });

  it("con más horas el mismo nivel reparte más", () => {
    const mas = desgloseDeNivel([...equipo, { name: "Dani", jornada: "medio_turno" as const, horasMes: 100 }], N1, "2026-09");
    const menos = desgloseDeNivel(equipo, N1, "2026-09");
    expect(mas.total).toBeGreaterThan(menos.total);
  });

  it("ejemplos: un medio turno de 94 h cobra el bono de medio turno del nivel", () => {
    expect(ejemplosDeBono(N2)).toEqual({ medioTurno: 48, tiempoCompleto: 98 });
    expect(ejemplosDeBono(N1)).toEqual({ medioTurno: 24, tiempoCompleto: 49 });
  });
});
