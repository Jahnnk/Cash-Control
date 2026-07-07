import { describe, it, expect } from "vitest";
import {
  formatElapsed,
  timingTraffic,
  summarizeKind,
  elapsedSeconds,
  type ServiceTiming,
} from "./service-timing";

const t = (kind: "mostrador" | "mesa", durationSeconds: number | null, id = "x"): ServiceTiming => ({
  id, kind, label: "", startedAt: "2026-07-07T12:00:00.000Z",
  endedAt: durationSeconds !== null ? "2026-07-07T12:05:00.000Z" : null,
  durationSeconds,
});

describe("service-timing · formato y semáforo", () => {
  it("formatElapsed muestra m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(7)).toBe("0:07");
    expect(formatElapsed(307)).toBe("5:07");
    expect(formatElapsed(65)).toBe("1:05");
  });

  it("semáforo mostrador (meta 6 min): ≤6 verde · ≤7.2 ámbar · más rojo", () => {
    expect(timingTraffic(5 * 60, 6)).toBe("verde");
    expect(timingTraffic(6 * 60, 6)).toBe("verde");
    expect(timingTraffic(7 * 60, 6)).toBe("ambar");   // 7 ≤ 7.2
    expect(timingTraffic(8 * 60, 6)).toBe("rojo");
  });

  it("semáforo mesa (meta 15 min): 12 verde · 17 ámbar · 19 rojo", () => {
    expect(timingTraffic(12 * 60, 15)).toBe("verde");
    expect(timingTraffic(17 * 60, 15)).toBe("ambar");  // 17 ≤ 18
    expect(timingTraffic(19 * 60, 15)).toBe("rojo");
  });

  it("sin meta configurada → verde (no inventa umbral)", () => {
    expect(timingTraffic(3600, null)).toBe("verde");
  });
});

describe("service-timing · resumen del día", () => {
  it("promedia solo los COMPLETOS y cuenta los que pasaron la meta", () => {
    const list = [
      t("mostrador", 4 * 60),   // 4:00
      t("mostrador", 8 * 60),   // 8:00 (sobre meta 6)
      t("mostrador", null),     // en curso — no cuenta
      t("mesa", 12 * 60),
    ];
    const most = summarizeKind(list, "mostrador", 6);
    expect(most.count).toBe(2);
    expect(most.avgSeconds).toBe(360);   // (240+480)/2
    expect(most.avgMin).toBe(6);
    expect(most.overMeta).toBe(1);
    expect(most.traffic).toBe("verde");  // promedio 6 = meta

    const mesa = summarizeKind(list, "mesa", 15);
    expect(mesa.count).toBe(1);
    expect(mesa.avgMin).toBe(12);
  });

  it("sin mediciones → count 0, promedios null (nunca un número inventado)", () => {
    const s = summarizeKind([], "mostrador", 6);
    expect(s.count).toBe(0);
    expect(s.avgMin).toBeNull();
    expect(s.avgSeconds).toBeNull();
  });

  it("avgMin redondea a 0.1 para alimentar el KPI (7:30 → 7.5)", () => {
    const s = summarizeKind([t("mesa", 450)], "mesa", 15); // 450s = 7.5min
    expect(s.avgMin).toBe(7.5);
  });
});

describe("service-timing · reloj en vivo", () => {
  it("elapsedSeconds calcula contra el reloj del servidor", () => {
    const start = "2026-07-07T12:00:00.000Z";
    const now = new Date("2026-07-07T12:03:20.000Z").getTime();
    expect(elapsedSeconds(start, now)).toBe(200);
  });
  it("nunca negativo (relojes desfasados)", () => {
    const start = "2026-07-07T12:00:10.000Z";
    const now = new Date("2026-07-07T12:00:00.000Z").getTime();
    expect(elapsedSeconds(start, now)).toBe(0);
  });
});
