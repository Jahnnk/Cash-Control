/**
 * El resumen compartible es UNA sola fuente de verdad: Grupo y Panel de
 * Sede generan el mismo texto. Estos tests fijan el contenido — números
 * honestos, piso explícito, y el caso "sin datos" sin inventar ceros.
 */
import { describe, it, expect } from "vitest";
import { buildSedeShareLines, buildShareHeader, SHARE_FOOTER } from "../share-text";

const BASE = {
  sede: "Fonavi",
  daysLoaded: 12,
  ticketActual: 22.5,
  ticketBase: 24.7,
  nivelAlcanzado: null,
  proximoNivel: { nombre: "Nivel 1", faltaSoles: 3.7 },
  trafficFloor: 49,
  personasPorDia: 52,
  trafficCumple: true,
  mejorVendedor: "MARIA",
  mvPeriodEnd: "2026-07-17",
};

describe("buildSedeShareLines", () => {
  it("cuenta la historia completa con números honestos", () => {
    const t = buildSedeShareLines(BASE).join("\n");
    expect(t).toContain("FONAVI (12 días registrados)");
    expect(t).toContain("Ticket promedio: S/22.50 — base S/24.70");
    expect(t).toContain("Para Nivel 1: faltan S/3.70");
    expect(t).toContain("✓ cumpliendo (52/día)");
    expect(t).toContain("MARIA (al 17/07)");
    expect(t).not.toContain("🎉"); // sin nivel alcanzado, sin festejo falso
  });

  it("piso incumplido: lo dice sin suavizarlo (sin el piso, la meta no cuenta)", () => {
    const t = buildSedeShareLines({ ...BASE, trafficCumple: false, personasPorDia: 40 }).join("\n");
    expect(t).toContain("✗ vamos en 40/día — sin el piso, la meta no cuenta");
  });

  it("nivel alcanzado: se celebra", () => {
    const t = buildSedeShareLines({ ...BASE, nivelAlcanzado: "Nivel 1", proximoNivel: { nombre: "Nivel 2", faltaSoles: 1.5 } }).join("\n");
    expect(t).toContain("🎉 Nivel alcanzado: Nivel 1");
    expect(t).toContain("Para Nivel 2: faltan S/1.50");
  });

  it("sin días registrados: lo dice, no inventa ceros", () => {
    const t = buildSedeShareLines({ ...BASE, ticketActual: null }).join("\n");
    expect(t).toBe("FONAVI: aún sin días registrados este mes.");
  });

  it("header y footer fijan la cultura del programa", () => {
    expect(buildShareHeader("Julio de 2026", "19/07")).toContain("Julio de 2026 (corte 19/07)");
    expect(SHARE_FOOTER).toContain("aquí no hay letra chica");
  });
});

/**
 * REGRESIÓN del incidente jul-2026: el Panel de Sede exigía 60 mesas y
 * el panel del Grupo 15 → dos ganadores del mismo desayuno (el admin
 * veía a Jefferson, la dirección a Abigail). El umbral vive en UNA sola
 * constante; este test impide que alguien vuelva a copiarla a mano.
 */
describe("mejor vendedor: un solo umbral en todo el sistema", () => {
  it("ambos paneles importan la constante compartida (nada de números sueltos)", async () => {
    const fs = await import("node:fs");
    const { MIN_MESAS_MEJOR_VENDEDOR } = await import("../best-seller-window");
    expect(MIN_MESAS_MEJOR_VENDEDOR).toBe(60);

    for (const file of ["src/app/actions/mejor-vendedor.ts", "src/app/actions/group-incentives.ts"]) {
      const src = fs.readFileSync(file, "utf8");
      expect(src).toContain("MIN_MESAS_MEJOR_VENDEDOR");
      // Nadie vuelve a escribir el umbral a mano en estos archivos.
      expect(src).not.toMatch(/const MIN_MESAS\s*=\s*\d+/);
    }
  });

  it("filterWorkersByWindow: 'contenido' exige que el reporte quepa entero en el rango", async () => {
    const { filterWorkersByWindow } = await import("../best-seller-window");
    const rows = [
      { nombre: "SEMANA 1", mesas: 99, total: 2800, period_start: "2026-07-05", period_end: "2026-07-11" },
      { nombre: "ACUMULADO", mesas: 300, total: 9000, period_start: "2026-07-01", period_end: "2026-07-17" },
    ];
    const semana = filterWorkersByWindow(rows, "2026-07-05", "2026-07-11", "contenido");
    expect(semana.map((r) => r.nombre)).toEqual(["SEMANA 1"]); // el acumulado NO se recorta

    const mes = filterWorkersByWindow(rows, "2026-07-01", "2026-07-31", "inicia-en-ventana");
    expect(mes).toHaveLength(2);
  });

  it("contarNoElegibles: los excluidos por el mínimo se pueden mostrar (no se esconden)", async () => {
    const { contarNoElegibles } = await import("../best-seller-window");
    // Datos reales de Fonavi 05–11 jul: 99, 97, 59, 55, 33 mesas.
    expect(contarNoElegibles([{ mesas: 99 }, { mesas: 97 }, { mesas: 59 }, { mesas: 55 }, { mesas: 33 }])).toBe(3);
  });
});
