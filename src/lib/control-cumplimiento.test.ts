/**
 * Tests del control de cumplimiento de dirección.
 *
 * Lo que se clava: que el verde exija LAS DOS COSAS (KPIs sin huecos Y
 * los cuatro archivos), y que un día de KPI perdido pese más que un
 * archivo de la semana — el día no vuelve, el archivo se sube el sábado.
 */
import { describe, it, expect } from "vitest";
import {
  evaluarSede, evaluarCumplimiento, resumenPendientes,
  type SedeCumplimiento,
} from "./control-cumplimiento";
import type { EstadoSemanal, EstadoReporte } from "./incentivos/reportes-semanales";

const reporte = (
  nombre: string, subido: boolean, ultimaCarga: string | null = "2026-08-15",
): EstadoReporte => ({
  clave: "rotacion", nombre, porQue: "x",
  subidoEstaSemana: subido, ultimaCarga: subido ? "2026-08-22" : ultimaCarga,
});

const semanal = (faltan: EstadoReporte[]): EstadoSemanal => ({
  reportes: [], faltan, completo: faltan.length === 0,
  sabado: "2026-08-22", esSabado: true, nuncaSubidos: [],
});

const sede = (o: Partial<SedeCumplimiento> = {}): SedeCumplimiento => ({
  businessId: 2, sede: "Fonavi",
  diasKpiFaltantes: [],
  semanal: semanal([]),
  ...o,
});

describe("el verde exige las dos cosas", () => {
  it("KPIs completos y 4 archivos subidos → al día", () => {
    expect(evaluarSede(sede()).severidad).toBe("al-dia");
    expect(evaluarSede(sede()).resumen).toBe("Todo al día");
  });

  it("KPIs completos pero falta un archivo → NO es al día", () => {
    // El hueco que tenía Grupo: veía solo rotación y se ponía verde.
    const r = evaluarSede(sede({ semanal: semanal([reporte("Cortesías", false)]) }));
    expect(r.severidad).toBe("atencion");
    expect(r.resumen).toBe("falta 1 de los 4 reportes");
  });

  it("archivos completos pero falta un día de KPI → tampoco", () => {
    const r = evaluarSede(sede({ diasKpiFaltantes: ["2026-08-18"] }));
    expect(r.severidad).toBe("urgente");
    expect(r.resumen).toBe("1 día de KPIs sin registrar");
  });
});

describe("qué pesa más", () => {
  it("un día de KPI perdido es URGENTE: ese dato no vuelve", () => {
    const r = evaluarSede(sede({ diasKpiFaltantes: ["2026-08-17", "2026-08-18"] }));
    expect(r.severidad).toBe("urgente");
    expect(r.resumen).toContain("2 días de KPIs");
  });

  it("un archivo de la semana es ATENCIÓN: se recupera el sábado", () => {
    expect(evaluarSede(sede({ semanal: semanal([reporte("Cortesías", false)]) })).severidad)
      .toBe("atencion");
  });

  it("un archivo que NUNCA se subió sube a urgente", () => {
    // No es un olvido: es una rutina que no arrancó. Cambios de Precio
    // está así en las tres sedes desde que existe el registro.
    const r = evaluarSede(sede({
      semanal: semanal([reporte("Cambios de Precio", false, null)]),
    }));
    expect(r.severidad).toBe("urgente");
    expect(r.archivosNunca).toEqual(["Cambios de Precio"]);
  });

  it("junta las dos cosas en una frase cuando faltan ambas", () => {
    const r = evaluarSede(sede({
      diasKpiFaltantes: ["2026-08-18"],
      semanal: semanal([reporte("Cortesías", false), reporte("Ventas por Trabajador", false)]),
    }));
    expect(r.resumen).toBe("1 día de KPIs sin registrar · faltan 2 de los 4 reportes");
  });
});

describe("el orden de las sedes pendientes", () => {
  it("lo urgente antes que lo de atención", () => {
    const c = evaluarCumplimiento([
      sede({ businessId: 3, sede: "Centro", semanal: semanal([reporte("Cortesías", false)]) }),
      sede({ businessId: 2, sede: "Fonavi", diasKpiFaltantes: ["2026-08-18"] }),
    ]);
    expect(c.pendientes.map((p) => p.sede)).toEqual(["Fonavi", "Centro"]);
  });

  it("a igual gravedad, primero quien más días de KPI debe", () => {
    const c = evaluarCumplimiento([
      sede({ businessId: 3, sede: "Centro", diasKpiFaltantes: ["2026-08-18"] }),
      sede({ businessId: 1, sede: "Atelier", diasKpiFaltantes: ["2026-08-16", "2026-08-17", "2026-08-18"] }),
    ]);
    expect(c.pendientes[0].sede).toBe("Atelier");
  });

  it("las sedes al día no entran en pendientes", () => {
    const c = evaluarCumplimiento([sede(), sede({ businessId: 3, sede: "Centro" })]);
    expect(c.todoAlDia).toBe(true);
    expect(c.pendientes).toEqual([]);
    expect(resumenPendientes(c)).toBe("");
  });
});

describe("resumenPendientes", () => {
  it("nombra cada sede con lo suyo", () => {
    const c = evaluarCumplimiento([
      sede({ businessId: 2, sede: "Fonavi", diasKpiFaltantes: ["2026-08-17", "2026-08-18"] }),
      sede({ businessId: 3, sede: "Centro", semanal: semanal([reporte("Cortesías", false)]) }),
    ]);
    expect(resumenPendientes(c))
      .toBe("Fonavi (2 días de KPIs sin registrar) · Centro (falta 1 de los 4 reportes)");
  });
});

describe("resiliencia", () => {
  it("si no se pudo leer lo semanal, no inventa un verde", () => {
    // `semanal: null` = la consulta falló. Con KPIs al día queda "al-dia"
    // porque no hay evidencia de falta, pero tampoco acusa en falso.
    const r = evaluarSede(sede({ semanal: null }));
    expect(r.archivosFaltantes).toEqual([]);
    expect(r.severidad).toBe("al-dia");
  });
});
