import { describe, it, expect } from "vitest";
import { horasDelMesDesdePlanilla, type FilaPlanilla } from "../horas-planilla";

const base: FilaPlanilla = {
  dni: " 12345678 ",
  horasProgramadas: null,
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

  it("sin horas registradas usa lo pactado en el horario, no el contrato (Annika: 110 h y no 94)", () => {
    const r = horasDelMesDesdePlanilla({ ...base, horasProgramadas: 110, horasSemanales: 23.5, minTiempoExtra: 70, minTardanza: 22 });
    expect(r).toMatchObject({ origen: "horario", horasBase: 110, horasMenos: 0, horasMas: 1.17, horas: 111.17 });
  });

  it("Junior: 202 h de horario + 75 min de extra = 203.25 h, como las muestra Planilla", () => {
    const r = horasDelMesDesdePlanilla({ ...base, horasProgramadas: 202, horasSemanales: 48, minTiempoExtra: 75, minTardanza: 14 })!;
    expect(r.horas).toBe(203.25);
  });

  it("sin horario cargado cae al contrato × 4", () => {
    const r = horasDelMesDesdePlanilla({ ...base, horasSemanales: 23.5 });
    expect(r).toMatchObject({ origen: "contrato", horasBase: 94, horas: 94 });
  });

  it("las faltas restan; las tardanzas no; el tiempo extra y las horas no marcadas suman", () => {
    const r = horasDelMesDesdePlanilla({
      ...base, horasProgramadas: 80, minFalta: 240, minTardanza: 30, minTiempoExtra: 90, minNoMarcadas: 30,
    })!;
    expect(r.horasMenos).toBe(4);
    expect(r.horasMas).toBe(2);
    expect(r.horas).toBe(78); // 80 − 4 + 2
  });

  it("el reloj manda y no se le restan las faltas otra vez (ya las descontó)", () => {
    const r = horasDelMesDesdePlanilla({ ...base, horasReloj: 110, horasRegistradas: 94, minFalta: 600, minTiempoExtra: 60 })!;
    expect(r).toMatchObject({ origen: "reloj", horasBase: 110, horasMenos: 0, horasMas: 1, horas: 111 });
  });

  it("nunca baja de cero", () => {
    const r = horasDelMesDesdePlanilla({ ...base, horasRegistradas: 10, minFalta: 6000 })!;
    expect(r.horas).toBe(0);
  });

  it("un 0 no es un dato: sin nada con qué calcular devuelve null", () => {
    expect(horasDelMesDesdePlanilla({ ...base, horasRegistradas: 0, horasSemanales: 0, horasProgramadas: 0 })).toBeNull();
    expect(horasDelMesDesdePlanilla(base)).toBeNull();
  });
});
