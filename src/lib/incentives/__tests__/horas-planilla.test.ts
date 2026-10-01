import { describe, it, expect } from "vitest";
import { horasDelMesDesdePlanilla, type FilaPlanilla } from "../horas-planilla";

const base: FilaPlanilla = {
  dni: " 12345678 ",
  horasSemanales: null,
  horasRegistradas: null,
  horasReloj: null,
  minFalta: 0,
  minTardanza: 0,
  minTiempoExtra: 0,
  minNoMarcadas: 0,
};

describe("horasDelMesDesdePlanilla", () => {
  it("usa las horas del mes que registró el administrador (Fonavi)", () => {
    const r = horasDelMesDesdePlanilla({ ...base, horasSemanales: 23.5, horasRegistradas: 80 });
    expect(r).toMatchObject({ origen: "registrada", horasBase: 80, horas: 80, dni: "12345678" });
  });

  it("sin horas registradas cae al horario × 4 (Centro: se da por hecho que trabajó su horario)", () => {
    const r = horasDelMesDesdePlanilla({ ...base, horasSemanales: 23.5 });
    expect(r).toMatchObject({ origen: "horario", horasBase: 94, horas: 94 });
  });

  it("faltas y tardanzas restan; tiempo extra y horas no marcadas suman", () => {
    const r = horasDelMesDesdePlanilla({
      ...base, horasSemanales: 20, minFalta: 240, minTardanza: 30, minTiempoExtra: 90, minNoMarcadas: 30,
    })!;
    expect(r.horasMenos).toBe(4.5);
    expect(r.horasMas).toBe(2);
    expect(r.horas).toBe(77.5); // 80 − 4.5 + 2
  });

  it("el reloj manda y no se le restan tardanzas otra vez (ya las descontó)", () => {
    const r = horasDelMesDesdePlanilla({ ...base, horasReloj: 110, horasRegistradas: 94, minTardanza: 600, minTiempoExtra: 60 })!;
    expect(r).toMatchObject({ origen: "reloj", horasBase: 110, horasMenos: 0, horasMas: 1, horas: 111 });
  });

  it("nunca baja de cero", () => {
    const r = horasDelMesDesdePlanilla({ ...base, horasRegistradas: 10, minFalta: 6000 })!;
    expect(r.horas).toBe(0);
  });

  it("un 0 no es un dato: sin nada con qué calcular devuelve null", () => {
    expect(horasDelMesDesdePlanilla({ ...base, horasRegistradas: 0, horasSemanales: 0 })).toBeNull();
    expect(horasDelMesDesdePlanilla(base)).toBeNull();
  });
});
