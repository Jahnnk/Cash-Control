/**
 * Tests de las propuestas de Highlight.
 *
 * Lo que se clava acá son las reglas que hacen que esto no se muera
 * solo: que nada entre al local sin aprobación, que una propuesta sin
 * respuesta se note, y que correr un Highlight de día nunca lo deje
 * vencido.
 */
import { describe, it, expect } from "vitest";
import {
  estadoEfectivo, validarPropuesta, validarMotivo,
  siguienteSemanaLibre, resumenBandeja,
  type Propuesta,
} from "./highlight-propuestas";

const HOY = "2026-08-17"; // lunes

const prop = (over: Partial<Propuesta> = {}): Propuesta => ({
  id: "p1", businessId: 2, sede: "Fonavi", fecha: HOY,
  texto: "Reordenar la vitrina de la mañana", porQue: null,
  propuestaPor: "Raúl", estado: "pendiente",
  resueltaPor: null, motivo: null, creadoEn: "2026-08-17T10:00:00Z",
  ...over,
});

describe("estadoEfectivo — caducar se deduce, no se guarda", () => {
  it("pendiente para hoy sigue pendiente", () => {
    expect(estadoEfectivo({ estado: "pendiente", fecha: HOY }, HOY)).toBe("pendiente");
  });

  it("pendiente para mañana sigue pendiente", () => {
    expect(estadoEfectivo({ estado: "pendiente", fecha: "2026-08-18" }, HOY)).toBe("pendiente");
  });

  it("pendiente de un día que ya pasó caduca", () => {
    expect(estadoEfectivo({ estado: "pendiente", fecha: "2026-08-16" }, HOY)).toBe("caducada");
  });

  it("una ya aprobada NO caduca nunca, aunque el día haya pasado", () => {
    // Es historia cumplida: pintarla como caducada borraría el hecho
    // de que sí se aprobó y sí se trabajó ese día.
    expect(estadoEfectivo({ estado: "aprobada", fecha: "2026-08-01" }, HOY)).toBe("aprobada");
  });

  it("una rechazada tampoco cambia con el tiempo", () => {
    expect(estadoEfectivo({ estado: "rechazada", fecha: "2026-08-01" }, HOY)).toBe("rechazada");
  });
});

describe("validarPropuesta", () => {
  it("acepta una propuesta normal para mañana", () => {
    const r = validarPropuesta({
      texto: "  Reordenar   la vitrina ", porQue: " Se ve vacía a las 8am ",
      fecha: "2026-08-18", hoy: HOY,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toBe("Reordenar la vitrina");   // normaliza espacios
      expect(r.porQue).toBe("Se ve vacía a las 8am");
    }
  });

  it("acepta proponer para HOY: si lo ve a las 10am, lo propone hoy", () => {
    // Decisión de Jahnn: perder la reacción rápida a algo que el
    // administrador acaba de ver en el local sería el costo más caro.
    const r = validarPropuesta({ texto: "Cambiar el cartel", fecha: HOY, hoy: HOY });
    expect(r.ok).toBe(true);
  });

  it("rechaza proponer para un día que ya pasó", () => {
    const r = validarPropuesta({ texto: "Cambiar el cartel", fecha: "2026-08-16", hoy: HOY });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ya pasó");
  });

  it("rechaza el texto vacío", () => {
    const r = validarPropuesta({ texto: "   ", fecha: HOY, hoy: HOY });
    expect(r.ok).toBe(false);
  });

  it("rechaza un texto que no cabe: si no entra, son varias cosas", () => {
    const r = validarPropuesta({ texto: "a".repeat(200), fecha: HOY, hoy: HOY });
    expect(r.ok).toBe(false);
  });

  it("el 'por qué' vacío se guarda como nulo, no como cadena vacía", () => {
    const r = validarPropuesta({ texto: "Algo", porQue: "   ", fecha: HOY, hoy: HOY });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.porQue).toBeNull();
  });

  it("rechaza una fecha con formato raro", () => {
    const r = validarPropuesta({ texto: "Algo", fecha: "18/08/2026", hoy: HOY });
    expect(r.ok).toBe(false);
  });
});

describe("validarMotivo", () => {
  it("acepta vacío: el motivo es opcional", () => {
    const r = validarMotivo("  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.motivo).toBeNull();
  });

  it("rechaza un motivo kilométrico", () => {
    expect(validarMotivo("x".repeat(400)).ok).toBe(false);
  });
});

describe("siguienteSemanaLibre — a qué semana correr el que se desplaza (10-oct-2026: semanal)", () => {
  it("sugiere la semana siguiente si está libre (devuelve su lunes)", () => {
    expect(siguienteSemanaLibre("2026-08-19", [])).toBe("2026-08-24");
  });

  it("salta las semanas que ya tienen Highlight", () => {
    expect(siguienteSemanaLibre("2026-08-17", ["2026-08-24", "2026-08-31"])).toBe("2026-09-07");
  });

  it("nunca sugiere hacia atrás: correr una tarea al pasado la crea vencida", () => {
    const r = siguienteSemanaLibre("2026-08-17", []);
    expect(r! > "2026-08-17").toBe(true);
  });

  it("cruza bien el cambio de mes", () => {
    expect(siguienteSemanaLibre("2026-08-31", [])).toBe("2026-09-07");
  });

  it("se rinde si las próximas semanas están ocupadas, en vez de buscar para siempre", () => {
    const todas = Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 7, 24 + 7 * i)).toISOString().slice(0, 10));
    expect(siguienteSemanaLibre("2026-08-17", todas)).toBeNull();
  });
});

describe("validarPropuesta — semanas", () => {
  it("acepta proponer para esta semana aunque el día elegido ya haya pasado", () => {
    expect(validarPropuesta({ texto: "Cambiar el cartel", fecha: "2026-08-17", hoy: "2026-08-20" }).ok).toBe(true);
  });
});

describe("resumenBandeja — el espejo honesto de dirección", () => {
  it("cuenta lo que hay que responder ahora", () => {
    const r = resumenBandeja([
      prop({ id: "a", fecha: "2026-08-24" }),
      prop({ id: "b", fecha: "2026-08-31" }),
    ], HOY);
    expect(r.porRevisar).toBe(2);
    expect(r.paraEstaSemana).toBe(0);
  });

  it("separa las de ESTA semana: si no se responden, se pierden", () => {
    const r = resumenBandeja([
      prop({ id: "a", fecha: HOY }),
      prop({ id: "b", fecha: "2026-08-24" }),
    ], HOY);
    expect(r.porRevisar).toBe(2);
    expect(r.paraEstaSemana).toBe(1);
  });

  it("cuenta aparte las que se pasaron sin respuesta", () => {
    // Este número incomoda a propósito: si nadie contesta, el
    // administrador deja de proponer y la idea se muere sola.
    const r = resumenBandeja([
      prop({ id: "a", fecha: "2026-08-15" }),
      prop({ id: "b", fecha: "2026-08-16" }),
      prop({ id: "c", fecha: HOY }),
    ], HOY);
    expect(r.caducadas).toBe(2);
    expect(r.porRevisar).toBe(1);
  });

  it("las ya resueltas no ensucian ningún contador", () => {
    const r = resumenBandeja([
      prop({ id: "a", fecha: "2026-08-10", estado: "aprobada" }),
      prop({ id: "b", fecha: "2026-08-11", estado: "rechazada" }),
    ], HOY);
    expect(r).toEqual({ porRevisar: 0, paraEstaSemana: 0, caducadas: 0 });
  });
});
