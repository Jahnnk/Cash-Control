import { describe, it, expect } from "vitest";
import { armarBonoDelMes, type EntradaBonoDelMes } from "../bono-del-mes";
import type { ResumenSupervisionMes } from "../../supervisiones";

const supervision = (o: Partial<ResumenSupervisionMes> = {}): ResumenSupervisionMes => ({
  estado: "sin_visitas", cumple: true, visitas: 0, puntajePromedio: null,
  criticas: { total: 0, enPlazo: 0, porConfirmar: 0, cumplidas: 0, fueraDePlazo: 0 },
  normales: { total: 0, abiertas: 0, fueraDePlazo: 0 }, ...o,
});

// Fonavi, 16-set-2026 (datos reales aproximados).
const base = (o: Partial<EntradaBonoDelMes> = {}): EntradaBonoDelMes => ({
  mesCerrado: false, diasQueQuedan: 15, practica: false, ahoraISO: "2026-10-16T15:00:00.000Z",
  ticket: { diasRegistrados: 15, actual: 23.5, primerNivel: { nombre: "Nivel 1", metaTicket: 23.61 }, nivelAlcanzado: null, proximo: { nombre: "Nivel 1", metaTicket: 23.61, faltaSoles: 0.11 } },
  ventas: { meta: 27600, provisional: false, vinculante: true, mesesReferencia: [], ventas: 16166, diasConVenta: 15, proyeccion: 33400, avancePct: 58.6, falta: 11434, cumple: false, enCamino: true },
  supervision: supervision(),
  proximoVencimientoCritica: null,
  ...o,
});

describe("los 3 activadores", () => {
  it("ticket sin nivel todavía: ámbar y cuánto falta por cliente", () => {
    const t = armarBonoDelMes(base()).activadores[0];
    expect(t).toMatchObject({ semaforo: "ambar", meta: "Nivel 1: S/23.61 por cliente", falta: "Faltan S/0.11 por cliente para Nivel 1" });
  });

  it("ventas en camino: ámbar con soles por día", () => {
    const v = armarBonoDelMes(base()).activadores[1];
    expect(v.semaforo).toBe("ambar");
    expect(v.falta).toContain("por día en 15 día(s)");
    expect(v.falta).toContain("al ritmo actual se llega");
  });

  it("ventas que al ritmo actual no alcanzan: rojo", () => {
    const v = armarBonoDelMes(base({ ventas: { ...base().ventas!, enCamino: false, proyeccion: 25000 } })).activadores[1];
    expect(v.semaforo).toBe("rojo");
    expect(v.falta).toContain("hay que acelerar");
  });

  it("supervisión con una crítica en plazo: ámbar y cuántas horas quedan", () => {
    const s = armarBonoDelMes(base({
      supervision: supervision({ estado: "pendiente", cumple: false, visitas: 1, criticas: { total: 1, enPlazo: 1, porConfirmar: 0, cumplidas: 0, fueraDePlazo: 0 } }),
      proximoVencimientoCritica: "2026-10-17T01:30:00.000Z",
    })).activadores[2];
    expect(s).toMatchObject({ semaforo: "ambar", falta: "Corregir 1 crítica(s): la primera vence en 10 h" });
  });

  it("sin visitas cumple (verde)", () => {
    expect(armarBonoDelMes(base()).activadores[2].semaforo).toBe("verde");
  });
});

describe("el titular", () => {
  it("con los 3 en verde dice cuánto cobra el equipo", () => {
    const r = armarBonoDelMes(base({
      ticket: { diasRegistrados: 20, actual: 24, primerNivel: { nombre: "Nivel 1", metaTicket: 23.61 }, nivelAlcanzado: { nombre: "Nivel 1", bonoEquipo: 612.4 }, proximo: { nombre: "Nivel 2", metaTicket: 25.11, faltaSoles: 1.11 } },
      ventas: { ...base().ventas!, ventas: 28000, cumple: true, avancePct: 101.4, falta: 0 },
    }));
    expect(r.semaforoGeneral).toBe("verde");
    expect(r.titular).toBe("Con los 3 en verde, el bono del equipo este mes es S/612 (Nivel 1).");
  });

  it("con alguno pendiente dice qué falta", () => {
    expect(armarBonoDelMes(base()).titular).toBe("Para cobrar el bono falta: ticket promedio, meta de ventas.");
  });

  it("una crítica fuera de plazo: rojo, hoy no alcanza", () => {
    const r = armarBonoDelMes(base({ supervision: supervision({ estado: "incumplido", cumple: false, visitas: 1, criticas: { total: 1, enPlazo: 0, porConfirmar: 0, cumplidas: 0, fueraDePlazo: 1 } }) }));
    expect(r.semaforoGeneral).toBe("rojo");
    expect(r.titular.startsWith("Hoy no alcanza para el bono")).toBe(true);
  });

  it("setiembre se marca como práctica", () => {
    expect(armarBonoDelMes(base({ practica: true })).titular.startsWith("Práctica · ")).toBe(true);
  });

  it("mes cerrado sin nivel: rojo y 'no se llegó'", () => {
    const r = armarBonoDelMes(base({ mesCerrado: true, diasQueQuedan: null }));
    expect(r.activadores[0]).toMatchObject({ semaforo: "rojo", falta: "No se llegó a Nivel 1 (faltaron S/0.11)" });
    expect(r.titular.startsWith("Este mes no hubo bono")).toBe(true);
  });
});

describe("ticket con nivel logrado", () => {
  it("la meta sigue siendo el Nivel 1 y el siguiente nivel va como lo que falta (Centro set-2026)", () => {
    const t = armarBonoDelMes(base({
      ticket: { diasRegistrados: 15, actual: 27.06, primerNivel: { nombre: "Nivel 1", metaTicket: 26.32 }, nivelAlcanzado: { nombre: "Nivel 1", bonoEquipo: 600 }, proximo: { nombre: "Nivel 2", metaTicket: 27.82, faltaSoles: 0.76 } },
    })).activadores[0];
    expect(t).toMatchObject({ semaforo: "verde", meta: "Nivel 1: S/26.32 por cliente", avance: "S/27.06 por cliente · Nivel 1 ✓", falta: "Para Nivel 2: faltan S/0.76 por cliente" });
  });
});
