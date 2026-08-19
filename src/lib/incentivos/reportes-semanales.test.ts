/**
 * Tests del control de los 4 reportes del sábado.
 *
 * Lo que se clava: que un archivo VACÍO cuente como subido (una semana
 * sin cortesías es una semana normal) y que subir uno de los cuatro NO
 * ponga la tarjeta en verde — que era justo el hueco.
 */
import { describe, it, expect } from "vitest";
import {
  REPORTES_SEMANALES, claveDesdeNota, evaluarReportesSemanales,
  sabadoDeLaSemana, nombrarFaltantes, type CargaRegistrada,
} from "./reportes-semanales";

// Sábado 22 de agosto de 2026. El sábado anterior fue el 15.
const SABADO = "2026-08-22";
const LUNES = "2026-08-17";

const c = (clave: CargaRegistrada["clave"], fecha: string): CargaRegistrada => ({ clave, fecha });
const TODOS = (fecha: string) => REPORTES_SEMANALES.map((r) => c(r.clave, fecha));

describe("sabadoDeLaSemana", () => {
  it("un sábado se devuelve a sí mismo", () => {
    expect(sabadoDeLaSemana("2026-08-22")).toBe("2026-08-22");
  });
  it("un lunes devuelve el sábado anterior", () => {
    expect(sabadoDeLaSemana("2026-08-17")).toBe("2026-08-15");
  });
  it("cruza bien el cambio de mes", () => {
    expect(sabadoDeLaSemana("2026-09-02")).toBe("2026-08-29");
  });
});

describe("claveDesdeNota", () => {
  it("reconoce las cuatro notas reales del sistema", () => {
    expect(claveDesdeNota("PIC · rotación semanal desde Panel de Sede · 2026-08")).toBe("rotacion");
    expect(claveDesdeNota("Incentivos · cortesias")).toBe("cortesias");
    expect(claveDesdeNota("Incentivos · cambios_precio")).toBe("cambios_precio");
    expect(claveDesdeNota("Incentivos · ventas por trabajador")).toBe("ventas_trabajador");
  });

  it("ignora las subidas que no son de esta rutina", () => {
    // El Excel de Kelly deja notas de otro formato.
    expect(claveDesdeNota("byte_sales_days=31, tips=14, alerts=22")).toBeNull();
    expect(claveDesdeNota("Incentivos · anulaciones")).toBeNull();
    expect(claveDesdeNota(null)).toBeNull();
  });
});

describe("el estado mira los CUATRO, no uno", () => {
  it("subir solo rotación NO deja la tarjeta en verde", () => {
    // Este era el hueco: el aviso nombraba los 4 pero el estado miraba
    // uno, y con ese uno se apagaba.
    const e = evaluarReportesSemanales([c("rotacion", SABADO)], SABADO);
    expect(e.completo).toBe(false);
    expect(e.faltan).toHaveLength(3);
  });

  it("con los cuatro subidos, completo", () => {
    const e = evaluarReportesSemanales(TODOS(SABADO), SABADO);
    expect(e.completo).toBe(true);
    expect(e.faltan).toEqual([]);
  });

  it("reproduce el caso real de Fonavi del sábado 15", () => {
    // Subió rotación y ventas por trabajador; faltaron los otros dos.
    const e = evaluarReportesSemanales(
      [c("rotacion", "2026-08-15"), c("ventas_trabajador", "2026-08-15")],
      "2026-08-15",
    );
    expect(e.completo).toBe(false);
    expect(nombrarFaltantes(e.faltan)).toBe("Cortesías y Cambios de Precio");
  });

  it("reproduce el caso real de Centro del sábado 15", () => {
    const e = evaluarReportesSemanales(
      [c("rotacion", "2026-08-15"), c("cortesias", "2026-08-15"), c("ventas_trabajador", "2026-08-15")],
      "2026-08-15",
    );
    expect(nombrarFaltantes(e.faltan)).toBe("Cambios de Precio");
  });
});

describe("la ventana de la semana", () => {
  it("lo subido el sábado sigue contando el lunes siguiente", () => {
    // No se le vuelve a pedir hasta el próximo sábado.
    const e = evaluarReportesSemanales(TODOS("2026-08-15"), LUNES);
    expect(e.completo).toBe(true);
  });

  it("lo del sábado pasado YA NO cuenta cuando llega el sábado nuevo", () => {
    // Es lo que hace que el aviso reaparezca cada sábado.
    const e = evaluarReportesSemanales(TODOS("2026-08-15"), SABADO);
    expect(e.completo).toBe(false);
    expect(e.faltan).toHaveLength(4);
  });

  it("marca si hoy es sábado, para levantar la voz solo ese día", () => {
    expect(evaluarReportesSemanales([], SABADO).esSabado).toBe(true);
    expect(evaluarReportesSemanales([], LUNES).esSabado).toBe(false);
  });
});

describe("nunca subidos", () => {
  it("separa 'nunca' de 'falta esta semana'", () => {
    // Cambios de Precio no se ha subido NUNCA en ninguna sede. No es lo
    // mismo que un olvido de una semana.
    const e = evaluarReportesSemanales(
      [c("rotacion", "2026-08-15"), c("cortesias", "2026-07-06"), c("ventas_trabajador", "2026-08-15")],
      SABADO,
    );
    expect(e.nuncaSubidos.map((r) => r.clave)).toEqual(["cambios_precio"]);
    // Cortesías sí se subió alguna vez, aunque no esta semana.
    expect(e.reportes.find((r) => r.clave === "cortesias")!.ultimaCarga).toBe("2026-07-06");
  });

  it("guarda la última fecha de cada uno", () => {
    const e = evaluarReportesSemanales(
      [c("rotacion", "2026-08-01"), c("rotacion", "2026-08-15")],
      SABADO,
    );
    expect(e.reportes.find((r) => r.clave === "rotacion")!.ultimaCarga).toBe("2026-08-15");
  });
});

describe("nombrarFaltantes", () => {
  it("junta dos con 'y'", () => {
    const e = evaluarReportesSemanales([c("rotacion", SABADO), c("cortesias", SABADO)], SABADO);
    expect(nombrarFaltantes(e.faltan)).toBe("Cambios de Precio y Ventas por Trabajador");
  });

  it("vacío cuando no falta nada", () => {
    expect(nombrarFaltantes([])).toBe("");
  });
});
