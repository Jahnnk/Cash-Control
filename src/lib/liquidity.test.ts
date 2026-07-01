import { describe, it, expect } from "vitest";
import {
  dateRange,
  forwardFill,
  cumulate,
  runwayDays,
  seriesDeltas,
  liquidityLevel,
  liquidityVerdict,
  runwayVerdict,
  reconciliationVerdict,
  receivablesVerdict,
} from "./liquidity";

describe("dateRange", () => {
  it("rango continuo incluyendo extremos (cruza fin de mes)", () => {
    expect(dateRange("2026-06-28", "2026-07-02")).toEqual([
      "2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02",
    ]);
  });
});

describe("forwardFill (serie del banco)", () => {
  it("rellena los días sin saldo con el último conocido", () => {
    const dates = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"];
    const known = new Map([["2026-07-02", 1500], ["2026-07-04", 1300]]);
    expect(forwardFill(dates, known, 1000)).toEqual([1000, 1500, 1500, 1300]);
  });
  it("sin datos en el rango → todo el seed", () => {
    expect(forwardFill(["a", "b"], new Map(), 500)).toEqual([500, 500]);
  });
});

describe("cumulate (serie de la caja)", () => {
  it("acumula los netos diarios sobre la base histórica", () => {
    const dates = ["2026-07-01", "2026-07-02", "2026-07-03"];
    const nets = new Map([["2026-07-01", 100], ["2026-07-03", -30.5]]);
    expect(cumulate(dates, nets, 53.11)).toEqual([153.11, 153.11, 122.61]);
  });
});

describe("runwayDays", () => {
  it("liquidez / gasto diario, redondeado hacia abajo", () => {
    expect(runwayDays(9033, 1270.86)).toBe(7);
    expect(runwayDays(20000, 1000)).toBe(20);
  });
  it("sin gasto histórico → null (no inventa cobertura infinita)", () => {
    expect(runwayDays(5000, 0)).toBeNull();
  });
  it("liquidez negativa → 0 días, no negativo", () => {
    expect(runwayDays(-500, 1000)).toBe(0);
  });
});

describe("seriesDeltas", () => {
  const mk = (vals: number[]) => vals.map((v, i) => ({ date: `d${i}`, value: v }));
  it("vs ayer y vs hace 7 días", () => {
    const s = mk([10, 10, 10, 10, 10, 10, 10, 20, 25]); // 9 puntos
    expect(seriesDeltas(s)).toEqual({ day: 5, week: 15 }); // 25-20, 25-10
  });
  it("serie corta → week null; un solo punto → todo null", () => {
    expect(seriesDeltas(mk([5, 8]))).toEqual({ day: 3, week: null });
    expect(seriesDeltas(mk([5]))).toEqual({ day: null, week: null });
  });
});

describe("liquidityLevel", () => {
  it("umbral 15/7 días y sin-datos", () => {
    expect(liquidityLevel(20)).toBe("verde");
    expect(liquidityLevel(15)).toBe("verde");
    expect(liquidityLevel(10)).toBe("ambar");
    expect(liquidityLevel(3)).toBe("rojo");
    expect(liquidityLevel(null)).toBe("sin-datos");
  });
});

describe("liquidityVerdict — interpreta, no obliga a interpretar", () => {
  it("caída doble (día y semana) muy por debajo del objetivo → riesgo, con las cifras", () => {
    const v = liquidityVerdict({ liquid: 1607, deltaDay: -69, deltaWeek: -4977, minSoles: 19063 });
    expect(v.tone).toBe("riesgo");
    expect(v.text).toContain("cayó");
    expect(v.text).toContain("69");
    expect(v.text).toContain("4,977");
    expect(v.text).toContain("muy por debajo del objetivo");
  });

  it("señales mixtas (subió hoy, cayó en la semana) las narra sin contradecirse", () => {
    const v = liquidityVerdict({ liquid: 30000, deltaDay: 500, deltaWeek: -2000, minSoles: 19000 });
    expect(v.text).toContain("subió");
    expect(v.text).toContain("aunque");
  });

  it("estable y dentro del objetivo → bien", () => {
    const v = liquidityVerdict({ liquid: 30000, deltaDay: 0, deltaWeek: 0.5, minSoles: 19000 });
    expect(v.tone).toBe("bien");
    expect(v.text).toContain("estable");
    expect(v.text).toContain("dentro del objetivo");
  });

  it("por debajo (pero no crítico) → atención", () => {
    const v = liquidityVerdict({ liquid: 12000, deltaDay: -100, deltaWeek: -300, minSoles: 19000 });
    expect(v.tone).toBe("atencion");
  });
});

describe("runwayVerdict — tranquilidad o urgencia en una frase", () => {
  it("crítico (<3), corto (<7), ajustado (<objetivo), tranquilo (≥objetivo)", () => {
    expect(runwayVerdict(1, 15).tone).toBe("riesgo");
    expect(runwayVerdict(1, 15).text).toContain("crítica");
    expect(runwayVerdict(5, 15).tone).toBe("riesgo");
    expect(runwayVerdict(10, 15).tone).toBe("atencion");
    expect(runwayVerdict(20, 15).tone).toBe("bien");
    expect(runwayVerdict(20, 15).text).toContain("Tranquilo");
    expect(runwayVerdict(null, 15).tone).toBe("neutro");
  });
});

describe("reconciliationVerdict — ¿puedo confiar en los números?", () => {
  it("cuadrado (|dif| < S/1) → Confiable", () => {
    const v = reconciliationVerdict({ lastCheckDiff: 0, hasDiscrepancy: false, verifiedPct: 80 });
    expect(v.label).toBe("Confiable");
    expect(v.tone).toBe("bien");
    expect(v.text).toContain("80%");
  });
  it("diferencia ≤ S/50 → Diferencia menor (atención)", () => {
    const v = reconciliationVerdict({ lastCheckDiff: 42, hasDiscrepancy: false, verifiedPct: null });
    expect(v.label).toBe("Diferencia menor");
    expect(v.tone).toBe("atencion");
  });
  it("diferencia > S/50 → Revisar (riesgo)", () => {
    const v = reconciliationVerdict({ lastCheckDiff: 118.2, hasDiscrepancy: false, verifiedPct: 0 });
    expect(v.label).toBe("Revisar");
    expect(v.tone).toBe("riesgo");
    expect(v.text).toContain("118");
  });
  it("inconsistencia interna manda sobre todo → No confiable", () => {
    const v = reconciliationVerdict({ lastCheckDiff: 0, hasDiscrepancy: true, verifiedPct: 100 });
    expect(v.label).toBe("No confiable");
  });
  it("sin cuadre registrado → pide registrarlo", () => {
    const v = reconciliationVerdict({ lastCheckDiff: null, hasDiscrepancy: false, verifiedPct: null });
    expect(v.label).toBe("Sin cuadre");
  });
});

describe("receivablesVerdict — orientada a la acción", () => {
  it("dice cuántos días de cobertura ganas al cobrar", () => {
    const v = receivablesVerdict({ total: 2541.72, overdue: 0, oldestDays: 5, dailyExpense: 1270.86 });
    expect(v.text).toContain("~2 día(s) más de cobertura");
    expect(v.tone).toBe("neutro");
  });
  it("con vencidos: monto + antigüedad", () => {
    const v = receivablesVerdict({ total: 900, overdue: 861.65, oldestDays: 23, dailyExpense: 1000 });
    expect(v.tone).toBe("atencion");
    expect(v.text).toContain("vencidos");
    expect(v.text).toContain("23 días");
  });
  it("sin pendientes → bien", () => {
    expect(receivablesVerdict({ total: 0, overdue: 0, oldestDays: 0, dailyExpense: 1000 }).tone).toBe("bien");
  });
});
