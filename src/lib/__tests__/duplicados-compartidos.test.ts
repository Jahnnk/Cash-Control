import { describe, it, expect } from "vitest";
import {
  detectarDuplicadosCompartidos,
  filasADescartar,
  type GastoProtegido,
  type EgresoDelExcel,
} from "../duplicados-compartidos";

/** El caso real: alquiler de Atelier, agosto 2026. */
const ALQUILER_COMPARTIDO: GastoProtegido = {
  fecha: "2026-08-03",
  monto: 2700,
  categoria: "ALQUILER",
  concepto: "Alquiler del mes",
  motivo: "gasto compartido entre sedes",
};

const filaExcel = (over: Partial<EgresoDelExcel> = {}): EgresoDelExcel => ({
  excelRow: 42,
  fecha: "2026-08-04",
  monto: 2700,
  categoria: "ALQUILER",
  nota: "ALQUILER AGOSTO 2026 (HUGO DÍAS)",
  ...over,
});

describe("detecta el pago que ya estaba registrado", () => {
  it("reconoce el alquiler de agosto de Atelier", () => {
    const d = detectarDuplicadosCompartidos([filaExcel()], [ALQUILER_COMPARTIDO]);
    expect(d).toHaveLength(1);
    expect(d[0].excelRow).toBe(42);
    expect(d[0].contra.concepto).toBe("Alquiler del mes");
    expect(d[0].contra.motivo).toContain("compartido");
  });

  it("no le importa el orden de las fechas", () => {
    // El Excel puede traerlo un día ANTES del registro manual.
    const d = detectarDuplicadosCompartidos(
      [filaExcel({ fecha: "2026-08-01" })],
      [ALQUILER_COMPARTIDO],
    );
    expect(d).toHaveLength(1);
  });

  it("ignora MAYÚSCULAS y tildes de la categoría", () => {
    const d = detectarDuplicadosCompartidos(
      [filaExcel({ categoria: "Alquiler" })],
      [ALQUILER_COMPARTIDO],
    );
    expect(d).toHaveLength(1);
  });

  it("compara el monto COMPLETO, no la parte de la sede", () => {
    // El compartido guarda S/2,700 aunque a Atelier le toquen S/1,800.
    // El Excel trae el pago entero, así que se comparan los enteros.
    const d = detectarDuplicadosCompartidos([filaExcel({ monto: 1800 })], [ALQUILER_COMPARTIDO]);
    expect(d).toHaveLength(0);
  });
});

describe("lo que NO debe descartar", () => {
  it("un gasto de otra categoría", () => {
    const d = detectarDuplicadosCompartidos(
      [filaExcel({ categoria: "INSUMOS" })],
      [ALQUILER_COMPARTIDO],
    );
    expect(d).toHaveLength(0);
  });

  it("un monto distinto, aunque sea por un céntimo", () => {
    const d = detectarDuplicadosCompartidos([filaExcel({ monto: 2700.01 })], [ALQUILER_COMPARTIDO]);
    expect(d).toHaveLength(0);
  });

  it("un pago del mes siguiente", () => {
    const d = detectarDuplicadosCompartidos(
      [filaExcel({ fecha: "2026-09-03" })],
      [ALQUILER_COMPARTIDO],
    );
    expect(d).toHaveLength(0);
  });

  it("justo en el borde de la tolerancia", () => {
    // 5 días entra, 6 no. El alquiler se paga una vez al mes, así que
    // una semana de margen cubre el registro tardío sin alcanzar al
    // pago siguiente.
    expect(
      detectarDuplicadosCompartidos([filaExcel({ fecha: "2026-08-08" })], [ALQUILER_COMPARTIDO]),
    ).toHaveLength(1);
    expect(
      detectarDuplicadosCompartidos([filaExcel({ fecha: "2026-08-09" })], [ALQUILER_COMPARTIDO]),
    ).toHaveLength(0);
  });

  it("la segunda fila igual, si solo hay un gasto protegido", () => {
    // Si el Excel trae DOS alquileres de S/2,700, uno tapa al registrado
    // y el otro entra: puede ser un pago real distinto.
    const d = detectarDuplicadosCompartidos(
      [filaExcel({ excelRow: 42 }), filaExcel({ excelRow: 90, fecha: "2026-08-05" })],
      [ALQUILER_COMPARTIDO],
    );
    expect(d).toHaveLength(1);
    expect(d[0].excelRow).toBe(42);
  });

  it("nada, cuando el sistema no tiene gastos protegidos", () => {
    expect(detectarDuplicadosCompartidos([filaExcel()], [])).toHaveLength(0);
  });
});

describe("cuando hay varios candidatos", () => {
  it("gana el de fecha más cercana", () => {
    const lejano: GastoProtegido = { ...ALQUILER_COMPARTIDO, fecha: "2026-08-07", concepto: "Lejano" };
    const cercano: GastoProtegido = { ...ALQUILER_COMPARTIDO, fecha: "2026-08-04", concepto: "Cercano" };
    const d = detectarDuplicadosCompartidos([filaExcel({ fecha: "2026-08-04" })], [lejano, cercano]);
    expect(d).toHaveLength(1);
    expect(d[0].contra.concepto).toBe("Cercano");
  });

  it("dos filas del Excel se reparten dos gastos protegidos", () => {
    const otro: GastoProtegido = { ...ALQUILER_COMPARTIDO, fecha: "2026-08-06", concepto: "Segundo" };
    const d = detectarDuplicadosCompartidos(
      [filaExcel({ excelRow: 1, fecha: "2026-08-03" }), filaExcel({ excelRow: 2, fecha: "2026-08-06" })],
      [ALQUILER_COMPARTIDO, otro],
    );
    expect(d).toHaveLength(2);
    expect(filasADescartar(d)).toEqual(new Set([1, 2]));
  });
});

describe("filasADescartar", () => {
  it("devuelve los números de fila del Excel", () => {
    const d = detectarDuplicadosCompartidos([filaExcel()], [ALQUILER_COMPARTIDO]);
    expect(filasADescartar(d)).toEqual(new Set([42]));
  });

  it("vacío cuando no hay nada que descartar", () => {
    expect(filasADescartar([])).toEqual(new Set());
  });
});
