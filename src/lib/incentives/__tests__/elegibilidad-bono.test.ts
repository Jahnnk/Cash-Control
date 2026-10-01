import { describe, it, expect } from "vitest";
import { elegibilidadDelMes, type PersonaDelMes } from "../elegibilidad-bono";

const p = (nombre: string, estado: string, ingreso: string | null, cese: string | null = null): PersonaDelMes =>
  ({ dni: nombre, nombre, estado, fechaIngreso: ingreso, fechaCese: cese });

describe("elegibilidadDelMes (septiembre 2026)", () => {
  const gente = [
    p("Junior", "cesado", "2026-02-01"),          // se fue el 30/09: hizo el mes
    p("Ghyan", "activo", "2026-09-30"),           // ingresó el 30/09: en prueba
    p("Piero", "activo", "2026-09-01"),           // ingresó el día 1: hizo el mes completo
    p("Teresa", "activo", "2026-06-29"),
    p("SinFecha", "activo", null),
  ];
  const r = elegibilidadDelMes(gente, "2026-09");

  it("quien figura cesado pero hizo el mes sí cobra", () => {
    expect(r.cesadosQueCobran.map((x) => x.nombre)).toEqual(["Junior"]);
  });

  it("quien ingresó después del día 1 está en prueba y no cobra", () => {
    expect(r.enPrueba.map((x) => x.nombre)).toEqual(["Ghyan"]);
  });

  it("quien ingresó justo el día 1 hizo el mes completo", () => {
    expect(r.enPrueba.some((x) => x.nombre === "Piero")).toBe(false);
  });

  it("sin fecha de ingreso no se excluye (nunca se deja sin bono por un dato faltante)", () => {
    expect(r.enPrueba.some((x) => x.nombre === "SinFecha")).toBe(false);
  });
});
