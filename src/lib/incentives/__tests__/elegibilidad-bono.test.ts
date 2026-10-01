import { describe, it, expect } from "vitest";
import { elegibilidadDelMes, type PersonaDelMes, type ReglaExcepcion } from "../elegibilidad-bono";

const p = (nombre: string, estado: string, ingreso: string | null, cese: string | null = null): PersonaDelMes =>
  ({ dni: nombre, nombre, estado, fechaIngreso: ingreso, fechaCese: cese });
const regla = (o: Partial<ReglaExcepcion> & Pick<ReglaExcepcion, "dni" | "accion">): ReglaExcepcion =>
  ({ id: 1, desdeMes: "2026-10", hastaMes: null, motivo: "x", ...o });

describe("elegibilidadDelMes (septiembre 2026)", () => {
  const gente = [
    p("Junior", "cesado", "2026-02-01"),
    p("Ghyan", "activo", "2026-09-30"),
    p("Piero", "activo", "2026-09-01"),
    p("Teresa", "activo", "2026-06-29"),
    p("SinFecha", "activo", null),
  ];
  const r = elegibilidadDelMes(gente, "2026-09");

  it("quien figura cesado pero hizo el mes sí cobra", () => {
    expect(r.cesadosQueCobran.map((x) => x.nombre)).toEqual(["Junior"]);
  });

  it("quien ingresó después del día 1 está en prueba y no cobra, con el motivo", () => {
    expect([...r.excluidos.keys()]).toEqual(["Ghyan"]);
    expect(r.excluidos.get("Ghyan")).toMatchObject({ origen: "automatico", motivo: "ingresó el 30/09 y está en periodo de prueba" });
  });

  it("quien ingresó justo el día 1 hizo el mes completo; sin fecha de ingreso no se excluye", () => {
    expect(r.excluidos.has("Piero")).toBe(false);
    expect(r.excluidos.has("SinFecha")).toBe(false);
  });
});

describe("excepciones de la dirección", () => {
  const gente = [p("Ghyan", "activo", "2026-09-30"), p("Dagnia", "activo", "2026-09-15"), p("Teresa", "activo", "2026-06-29")];

  it("excluir cubre todo el periodo, aunque la regla automática ya no lo alcance (Ghyan en octubre)", () => {
    const reglas = [regla({ dni: "Ghyan", accion: "excluir", desdeMes: "2026-10", hastaMes: "2026-12", motivo: "periodo de prueba hasta diciembre" })];
    expect(elegibilidadDelMes(gente, "2026-10", reglas).excluidos.get("Ghyan")).toMatchObject({ origen: "manual", reglaId: 1 });
    expect(elegibilidadDelMes(gente, "2026-12", reglas).excluidos.has("Ghyan")).toBe(true);
    expect(elegibilidadDelMes(gente, "2027-01", reglas).excluidos.has("Ghyan")).toBe(false);
    expect(elegibilidadDelMes(gente, "2026-09", reglas).excluidos.get("Ghyan")?.origen).toBe("automatico");
  });

  it("incluir manda sobre la regla automática (Dagnia ingresó a mitad de mes pero cobra)", () => {
    const reglas = [regla({ id: 7, dni: "Dagnia", accion: "incluir", desdeMes: "2026-09", hastaMes: "2026-09", motivo: "administradora" })];
    const r = elegibilidadDelMes(gente, "2026-09", reglas);
    expect(r.excluidos.has("Dagnia")).toBe(false);
    expect(r.incluidosPorExcepcion).toEqual([{ dni: "Dagnia", nombre: "Dagnia", motivo: "administradora", reglaId: 7 }]);
    expect(r.excluidos.has("Ghyan")).toBe(true);
  });

  it("una excepción de otro mes no cuenta", () => {
    const reglas = [regla({ dni: "Teresa", accion: "excluir", desdeMes: "2026-11", hastaMes: "2026-11" })];
    expect(elegibilidadDelMes(gente, "2026-10", reglas).excluidos.has("Teresa")).toBe(false);
  });
});
