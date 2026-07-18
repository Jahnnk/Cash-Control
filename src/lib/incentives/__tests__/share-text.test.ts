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
