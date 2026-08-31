/**
 * Tests del control de los reportes del sábado.
 *
 * Lo que se clava: que un archivo VACÍO cuente como subido (una semana
 * sin cortesías es una semana normal) y que subir uno solo NO ponga la
 * tarjeta en verde — que era justo el hueco.
 *
 * Desde el 31-ago-2026 son TRES: "Cambios de Precio" salió de la rutina
 * porque los asesores y caja ya no pueden cambiar precios. La clave
 * sigue existiendo para clasificar las subidas históricas.
 */
import { describe, it, expect } from "vitest";
import {
  REPORTES_SEMANALES, claveDesdeNota, evaluarReportesSemanales,
  sabadoDeLaSemana, nombrarFaltantes, reportesDeLaSede, type CargaRegistrada,
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

  it("reconoce el de rotación subido por dirección desde Productos", () => {
    // Otra puerta, otra nota — pero es el mismo reporte. Lo que importa
    // es si entró, no quién lo subió.
    expect(claveDesdeNota("PIC · ventas por producto (Byte rotación) · 2026-06")).toBe("rotacion");
  });

  it("NO confunde rentabilidad con rotación", () => {
    // Es otro reporte de Byte; contarlo daría un verde falso.
    expect(claveDesdeNota("PIC · ventas por producto (Byte rentabilidad) · 2026-05")).toBeNull();
  });

  it("ignora las subidas que no son de esta rutina", () => {
    // El Excel de Kelly deja notas de otro formato.
    expect(claveDesdeNota("byte_sales_days=31, tips=14, alerts=22")).toBeNull();
    expect(claveDesdeNota("Incentivos · anulaciones")).toBeNull();
    expect(claveDesdeNota(null)).toBeNull();
  });
});

describe("el estado los mira TODOS, no uno", () => {
  it("subir solo rotación NO deja la tarjeta en verde", () => {
    // Este era el hueco: el aviso los nombraba todos pero el estado
    // miraba uno, y con ese uno se apagaba.
    const e = evaluarReportesSemanales([c("rotacion", SABADO)], SABADO);
    expect(e.completo).toBe(false);
    expect(e.faltan).toHaveLength(2);
  });

  it("con todos subidos, completo", () => {
    const e = evaluarReportesSemanales(TODOS(SABADO), SABADO);
    expect(e.completo).toBe(true);
    expect(e.faltan).toEqual([]);
  });

  it("reproduce el caso real de Fonavi del sábado 15", () => {
    // Subió rotación y ventas por trabajador; le faltó cortesías.
    const e = evaluarReportesSemanales(
      [c("rotacion", "2026-08-15"), c("ventas_trabajador", "2026-08-15")],
      "2026-08-15",
    );
    expect(e.completo).toBe(false);
    expect(nombrarFaltantes(e.faltan)).toBe("Cortesías");
  });

  it("Centro, que ese sábado subió los tres, queda completo", () => {
    // Antes le faltaba Cambios de Precio y nunca se ponía en verde.
    const e = evaluarReportesSemanales(
      [c("rotacion", "2026-08-15"), c("cortesias", "2026-08-15"), c("ventas_trabajador", "2026-08-15")],
      "2026-08-15",
    );
    expect(e.completo).toBe(true);
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
    expect(e.faltan).toHaveLength(3);
  });

  it("marca si hoy es sábado, para levantar la voz solo ese día", () => {
    expect(evaluarReportesSemanales([], SABADO).esSabado).toBe(true);
    expect(evaluarReportesSemanales([], LUNES).esSabado).toBe(false);
  });
});

describe("nunca subidos", () => {
  it("separa 'nunca' de 'falta esta semana'", () => {
    // Un archivo que no se subió jamás no es lo mismo que un olvido de
    // una semana, y el aviso tiene que distinguirlos.
    const e = evaluarReportesSemanales(
      [c("rotacion", "2026-08-15"), c("cortesias", "2026-07-06")],
      SABADO,
    );
    expect(e.nuncaSubidos.map((r) => r.clave)).toEqual(["ventas_trabajador"]);
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
    const e = evaluarReportesSemanales([c("rotacion", SABADO)], SABADO);
    expect(nombrarFaltantes(e.faltan)).toBe("Cortesías y Ventas por Trabajador");
  });

  it("vacío cuando no falta nada", () => {
    expect(nombrarFaltantes([])).toBe("");
  });
});

describe("qué reportes le tocan a cada sede", () => {
  // Decisión de Jahnn (24-ago-2026): Atelier es producción, no cafetería.
  it("a Atelier solo le toca rotación", () => {
    const r = reportesDeLaSede(1).map((x) => x.clave);
    expect(r).toEqual(["rotacion"]);
  });

  it("a Fonavi y Centro les tocan los tres", () => {
    expect(reportesDeLaSede(2)).toHaveLength(3);
    expect(reportesDeLaSede(3)).toHaveLength(3);
  });

  it("sin sede conocida los pide todos: no relaja el control por accidente", () => {
    expect(reportesDeLaSede()).toHaveLength(3);
    expect(reportesDeLaSede(999)).toHaveLength(3);
  });

  it("ya no se pide Cambios de Precio en ninguna sede", () => {
    // Los asesores y caja no pueden cambiar precios desde ago-2026, así
    // que el reporte dejó de vigilar algo que puede pasar. La clave
    // sobrevive solo para clasificar las subidas históricas.
    for (const sede of [undefined, 1, 2, 3]) {
      expect(reportesDeLaSede(sede).map((r) => r.clave)).not.toContain("cambios_precio");
    }
    expect(claveDesdeNota("Incentivos · cambios_precio")).toBe("cambios_precio");
  });

  it("Atelier queda COMPLETO subiendo solo rotación", () => {
    // Con la regla vieja, Luis quedaba en rojo para siempre por
    // archivos que su operación no genera.
    const cargas = [{ clave: "rotacion" as const, fecha: "2026-08-22" }];
    const atelier = evaluarReportesSemanales(cargas, "2026-08-22", 1);
    expect(atelier.completo).toBe(true);
    expect(atelier.faltan).toHaveLength(0);
    expect(atelier.nuncaSubidos).toHaveLength(0);

    // La misma subida en Centro deja dos pendientes.
    const centro = evaluarReportesSemanales(cargas, "2026-08-22", 3);
    expect(centro.completo).toBe(false);
    expect(centro.faltan).toHaveLength(2);
  });

  it("Atelier sin subir nada sigue quedando en falta", () => {
    const a = evaluarReportesSemanales([], "2026-08-22", 1);
    expect(a.completo).toBe(false);
    expect(a.nuncaSubidos.map((r) => r.clave)).toEqual(["rotacion"]);
  });
});
