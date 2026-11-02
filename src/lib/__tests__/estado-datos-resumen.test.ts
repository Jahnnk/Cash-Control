import { describe, expect, it } from "vitest";
import { resumenEstadoDatos } from "@/lib/estado-datos-resumen";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import type { ListoReunion } from "@/lib/kpis/listo-reunion";

const frescura = (estado: FrescuraGrupo["estado"], hasta: string | null): FrescuraGrupo =>
  ({ hasta, diasAtraso: 19, masAtrasadas: [], sedes: [], estado, titular: "", accion: null, proximaEntrega: "2026-11-06" });
const admins = (faltas: number, avisos: number): ListoReunion =>
  ({ start: "2026-10-25", end: "2026-10-31", hoy: "2026-11-01", sedes: [], listo: faltas + avisos === 0, faltas, avisos, resumen: "" });

describe("resumenEstadoDatos", () => {
  it("todo al día: una frase tranquila y punto verde", () => {
    expect(resumenEstadoDatos(frescura("al_dia", "2026-10-30"), admins(0, 0))).toEqual({ texto: "Excel al día · administradores al día", gravedad: "ok" });
  });
  it("el caso de la captura: Excel hasta el 13 de octubre y 5 datos por completar, en rojo", () => {
    const r = resumenEstadoDatos(frescura("muy_atrasado", "2026-10-13"), admins(5, 0));
    expect(r.texto).toBe("Excel hasta el 13 de octubre · 5 datos de administradores por completar");
    expect(r.gravedad).toBe("mal");
  });
  it("solo avisos: ámbar y en singular cuando es uno", () => {
    expect(resumenEstadoDatos(frescura("al_dia", "2026-10-30"), admins(0, 1))).toEqual({ texto: "Excel al día · 1 aviso de administradores por revisar", gravedad: "ojo" });
    expect(resumenEstadoDatos(frescura("al_dia", "2026-10-30"), admins(1, 0)).texto).toContain("1 dato de administradores");
  });
  it("manda lo más grave de los dos", () => {
    expect(resumenEstadoDatos(frescura("atrasado", "2026-10-25"), admins(0, 0)).gravedad).toBe("ojo");
    expect(resumenEstadoDatos(frescura("al_dia", "2026-10-30"), admins(2, 0)).gravedad).toBe("mal");
  });
  it("mientras los administradores cargan, o sin ellos, solo habla del Excel", () => {
    expect(resumenEstadoDatos(frescura("muy_atrasado", "2026-10-13"), undefined).texto).toBe("Excel hasta el 13 de octubre");
    expect(resumenEstadoDatos(null, null).texto).toBe("Sin información de los datos");
  });
});
