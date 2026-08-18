/**
 * Tests de la conciliación de fechas con el mes de la hoja.
 *
 * La regla que se clava: solo se corrige CON PRUEBA (el día de la
 * semana). Sin prueba se descarta, porque meter ventas en el mes
 * equivocado es peor que perderlas — descuadra el mes cerrado, el
 * comparativo y el deck de la reunión.
 */
import { describe, it, expect } from "vitest";
import { conciliarFechaConHoja, resumenCorrecciones } from "./fecha-mes-hoja";

const AGOSTO = { year: 2026, month: 8 };

describe("fechas que ya están bien", () => {
  it("una fecha del mes de la hoja pasa sin tocarse", () => {
    const r = conciliarFechaConHoja({ fecha: "2026-08-06", diaSemana: "Jueves", mesHoja: AGOSTO });
    expect(r.estado).toBe("ok");
    if (r.estado === "ok") expect(r.fecha).toBe("2026-08-06");
  });

  it("no le exige el día de la semana si ya está en el mes correcto", () => {
    const r = conciliarFechaConHoja({ fecha: "2026-08-06", mesHoja: AGOSTO });
    expect(r.estado).toBe("ok");
  });
});

describe("el caso real de Kelly: mes mal tecleado", () => {
  it("corrige 7/7 a 7/8 porque el día dice Viernes", () => {
    // El 7 de julio de 2026 fue martes; el 7 de agosto, viernes.
    const r = conciliarFechaConHoja({ fecha: "2026-07-07", diaSemana: "Viernes", mesHoja: AGOSTO });
    expect(r.estado).toBe("corregida");
    if (r.estado === "corregida") {
      expect(r.fecha).toBe("2026-08-07");
      expect(r.original).toBe("2026-07-07");
    }
  });

  it("le da igual la tilde y la mayúscula del día", () => {
    const conTilde = conciliarFechaConHoja({ fecha: "2026-07-12", diaSemana: "Miércoles", mesHoja: AGOSTO });
    const sinTilde = conciliarFechaConHoja({ fecha: "2026-07-12", diaSemana: "miercoles", mesHoja: AGOSTO });
    expect(conTilde.estado).toBe("corregida");
    expect(sinTilde.estado).toBe("corregida");
  });

  it("corrige también hacia atrás (una fecha de agosto en la hoja de julio)", () => {
    const r = conciliarFechaConHoja({
      fecha: "2026-08-07", diaSemana: "Martes", mesHoja: { year: 2026, month: 7 },
    });
    expect(r.estado).toBe("corregida");
    if (r.estado === "corregida") expect(r.fecha).toBe("2026-07-07");
  });

  it("cruza bien el cambio de año", () => {
    // 5-ene-2027 es martes; 5-dic-2026 es sábado.
    const r = conciliarFechaConHoja({
      fecha: "2026-12-05", diaSemana: "Martes", mesHoja: { year: 2027, month: 1 },
    });
    expect(r.estado).toBe("corregida");
    if (r.estado === "corregida") expect(r.fecha).toBe("2027-01-05");
  });
});

describe("cuándo NO hay que corregir", () => {
  it("sin día de la semana no inventa: descarta", () => {
    // Es la decisión importante. Sin prueba, adivinar el mes puede
    // meter las ventas de julio dentro de agosto.
    const r = conciliarFechaConHoja({ fecha: "2026-07-07", mesHoja: AGOSTO });
    expect(r.estado).toBe("descartada");
    if (r.estado === "descartada") expect(r.motivo).toContain("no hay día de la semana");
  });

  it("si la fecha concuerda con SU día, es de otro mes de verdad", () => {
    // 7-jul-2026 fue martes y la fila dice Martes: no es un error de
    // tecleo, es un arrastre real del mes anterior.
    const r = conciliarFechaConHoja({ fecha: "2026-07-07", diaSemana: "Martes", mesHoja: AGOSTO });
    expect(r.estado).toBe("descartada");
    if (r.estado === "descartada") expect(r.motivo).toContain("otro mes de verdad");
  });

  it("si el día no cuadra con ninguna opción, descarta", () => {
    const r = conciliarFechaConHoja({ fecha: "2026-07-07", diaSemana: "Domingo", mesHoja: AGOSTO });
    expect(r.estado).toBe("descartada");
    if (r.estado === "descartada") expect(r.motivo).toContain("no concuerda");
  });

  it("no inventa un 31 de abril", () => {
    const r = conciliarFechaConHoja({
      fecha: "2026-03-31", diaSemana: "Martes", mesHoja: { year: 2026, month: 4 },
    });
    expect(r.estado).toBe("descartada");
    if (r.estado === "descartada") expect(r.motivo).toContain("no existe");
  });

  it("ignora texto basura en la columna del día", () => {
    const r = conciliarFechaConHoja({ fecha: "2026-07-07", diaSemana: "—", mesHoja: AGOSTO });
    expect(r.estado).toBe("descartada");
  });
});

describe("resumenCorrecciones", () => {
  it("dice cuántas, de qué mes a cuál, y con un ejemplo", () => {
    const t = resumenCorrecciones([
      { original: "2026-07-07", fecha: "2026-08-07" },
      { original: "2026-07-08", fecha: "2026-08-08" },
    ]);
    expect(t).toContain("2 fechas");
    expect(t).toContain("2026-07");
    expect(t).toContain("2026-08");
    expect(t).toContain("2026-07-07 → 2026-08-07");
  });

  it("vacío cuando no hubo nada que corregir", () => {
    expect(resumenCorrecciones([])).toBe("");
  });
});
