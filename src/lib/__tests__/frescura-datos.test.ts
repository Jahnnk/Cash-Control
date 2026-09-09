/**
 * "¿Hasta cuándo tenemos datos?" — el titular que faltaba.
 *
 * Kelly entrega los viernes y a veces se atrasa. Lo que Jahnn necesita
 * saber de un vistazo no es cuándo se subió el último archivo, sino
 * hasta qué día llegan los números — y desde cuándo pedirle lo que
 * falta.
 */
import { describe, it, expect } from "vitest";
import { resumirFrescura, proximoViernes, fechaLarga, DIAS_ACUERDO } from "../frescura-datos";

const s = (businessId: number, name: string, lastDate: string | null) => ({ businessId, name, lastDate });

// El estado real del 9-set-2026.
const HOY = "2026-09-09";
const REAL = [s(1, "Atelier", "2026-09-03"), s(2, "Fonavi", "2026-09-02"), s(3, "Centro", "2026-09-03")];

describe("el grupo vale por su PEOR sede", () => {
  it("el corte es el mínimo, no el máximo ni el promedio", () => {
    // Centro llega al 03 y Fonavi al 02: el consolidado llega al 02,
    // porque del 03 en adelante le faltaría Fonavi. Mostrar el 03 sería
    // la mentira cómoda.
    const r = resumirFrescura({ todayISO: HOY, sedes: REAL });
    expect(r.hasta).toBe("2026-09-02");
    expect(r.masAtrasadas).toEqual(["Fonavi"]);
  });

  it("nombra a TODAS las sedes que empatan en el peor lugar", () => {
    const r = resumirFrescura({
      todayISO: HOY,
      sedes: [s(1, "Atelier", "2026-09-02"), s(2, "Fonavi", "2026-09-02"), s(3, "Centro", "2026-09-07")],
    });
    expect(r.masAtrasadas).toEqual(["Atelier", "Fonavi"]);
  });

  it("ordena las sedes de la más atrasada a la más al día", () => {
    const r = resumirFrescura({ todayISO: HOY, sedes: REAL });
    expect(r.sedes.map((x) => x.name)).toEqual(["Fonavi", "Atelier", "Centro"]);
  });
});

describe("el semáforo se mide contra el acuerdo, no contra hoy", () => {
  it("7 días de rezago es NORMAL: Kelly entrega los viernes", () => {
    // Reclamar datos de ayer un martes sería absurdo.
    const r = resumirFrescura({ todayISO: HOY, sedes: [s(2, "Fonavi", "2026-09-02")] });
    expect(r.diasAtraso).toBe(DIAS_ACUERDO);
    expect(r.estado).toBe("al_dia");
    expect(r.accion).toBeNull();
  });

  it("8 días ya es haberse saltado una entrega", () => {
    const r = resumirFrescura({ todayISO: HOY, sedes: [s(2, "Fonavi", "2026-09-01")] });
    expect(r.estado).toBe("atrasado");
    expect(r.titular).toContain("solo hasta el 1 de setiembre");
  });

  it("más de dos semanas es que algo se rompió", () => {
    const r = resumirFrescura({ todayISO: HOY, sedes: [s(2, "Fonavi", "2026-08-20")] });
    expect(r.estado).toBe("muy_atrasado");
  });

  it("una sede SIN datos arrastra al grupo aunque las otras estén al día", () => {
    const r = resumirFrescura({
      todayISO: HOY,
      sedes: [s(1, "Atelier", null), s(2, "Fonavi", "2026-09-08"), s(3, "Centro", "2026-09-08")],
    });
    expect(r.estado).toBe("muy_atrasado");
    expect(r.masAtrasadas).toEqual(["Atelier"]);
    expect(r.titular).toContain("no tiene ninguno cargado");
  });

  it("sin datos en ninguna sede no inventa una fecha", () => {
    const r = resumirFrescura({ todayISO: HOY, sedes: [s(1, "Atelier", null), s(2, "Fonavi", null)] });
    expect(r.estado).toBe("sin_datos");
    expect(r.hasta).toBeNull();
  });
});

describe("la acción dice QUÉ pedir y DESDE CUÁNDO", () => {
  it("pide desde el día siguiente al último dato, no desde el mismo", () => {
    // Pedir "desde el 1" cuando el 1 ya está cargado hace que Kelly
    // reenvíe lo que ya mandó.
    const r = resumirFrescura({ todayISO: HOY, sedes: [s(2, "Fonavi", "2026-09-01")] });
    expect(r.accion).toContain("Fonavi");
    expect(r.accion).toContain("desde el 2 de setiembre");
  });

  it("al día no pide nada", () => {
    const r = resumirFrescura({ todayISO: HOY, sedes: [s(3, "Centro", "2026-09-08")] });
    expect(r.accion).toBeNull();
    expect(r.titular).toContain("Tenemos datos hasta el 8 de setiembre");
  });
});

describe("detalles de redacción", () => {
  it("la fecha se lee en voz alta, no en dd/mm", () => {
    expect(fechaLarga("2026-09-03")).toBe("3 de setiembre");
    expect(fechaLarga(null)).toBe("—");
  });

  it("dice 'hace 1 día', no 'hace 1 días'", () => {
    const r = resumirFrescura({ todayISO: HOY, sedes: [s(3, "Centro", "2026-09-08")] });
    expect(r.titular).toContain("hace 1 día)");
  });

  it("el próximo viernes sale bien incluso si hoy es viernes", () => {
    expect(proximoViernes("2026-09-09")).toBe("2026-09-11"); // miércoles → viernes
    expect(proximoViernes("2026-09-11")).toBe("2026-09-11"); // viernes → hoy
    expect(proximoViernes("2026-09-12")).toBe("2026-09-18"); // sábado → el siguiente
  });
});

describe("cuándo toca la próxima entrega", () => {
  it("va siempre, incluso cuando todo está al día", () => {
    // La pregunta no es solo "¿falta algo?" sino "¿estoy esperando algo?".
    // Saber que el viernes llega lo siguiente evita pedirle a Kelly un
    // martes lo que iba a llegar igual.
    const r = resumirFrescura({ todayISO: HOY, sedes: REAL });
    expect(r.estado).toBe("al_dia");
    expect(r.proximaEntrega).toBe("2026-09-11");
  });

  it("también cuando no hay ningún dato", () => {
    const r = resumirFrescura({ todayISO: HOY, sedes: [s(1, "Atelier", null)] });
    expect(r.proximaEntrega).toBe("2026-09-11");
  });
});
