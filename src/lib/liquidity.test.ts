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
  liquidityStreak,
  monthEndProjection,
  projectionConfidence,
  simulateCollect,
  simulateCutSpending,
  simulateFreeze,
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

describe("liquidityStreak — detecta patrones, no fotos", () => {
  const mk = (vals: number[]) => vals.map((v, i) => ({ date: `d${i}`, value: v }));
  it("deterioro de 9 días consecutivos → texto de racha", () => {
    const s = mk([100, 10000, 9500, 9000, 8500, 8000, 7000, 6000, 5000, 4000]);
    const r = liquidityStreak(s);
    expect(r.direction).toBe("baja");
    expect(r.days).toBe(8);
    expect(r.text).toContain("deteriorándose hace 8 días");
  });
  it("recuperación de 4 días → texto positivo", () => {
    const r = liquidityStreak(mk([50, 40, 100, 200, 300, 400]));
    expect(r.direction).toBe("sube");
    expect(r.text).toContain("recuperándose hace 4");
  });
  it("racha corta (<3) o cambios de céntimos → sin texto (no es patrón)", () => {
    expect(liquidityStreak(mk([100, 90, 80])).text).toBeNull(); // 2 días
    expect(liquidityStreak(mk([100, 100.5, 100.2, 100.4])).text).toBeNull(); // estable
  });
});

describe("monthEndProjection — predicción simple y auditable", () => {
  it("ritmo negativo que cruza cero → riesgo ('te quedarías sin caja')", () => {
    const p = monthEndProjection({ liquid: 1600, netDaily8w: -200, daysRemaining: 20, minSoles: 19000 });
    expect(p.value).toBe(1600 - 4000);
    expect(p.verdict.tone).toBe("riesgo");
    expect(p.verdict.text).toContain("sin caja");
  });
  it("cierra positivo pero bajo el objetivo → atención", () => {
    const p = monthEndProjection({ liquid: 10000, netDaily8w: -100, daysRemaining: 20, minSoles: 19000 });
    expect(p.value).toBe(8000);
    expect(p.belowTarget).toBe(true);
    expect(p.verdict.tone).toBe("atencion");
  });
  it("dentro del objetivo → bien, con la cifra proyectada", () => {
    const p = monthEndProjection({ liquid: 25000, netDaily8w: 50, daysRemaining: 10, minSoles: 19000 });
    expect(p.verdict.tone).toBe("bien");
    expect(p.verdict.text).toContain("25,500");
  });
});

describe("projectionConfidence — nivel de confianza auditable", () => {
  it("ritmos en dirección contraria (ambos significativos) → baja", () => {
    const c = projectionConfidence({ netDaily8w: -30, netDaily14: 120, daysRemaining: 10 });
    expect(c.level).toBe("baja");
    expect(c.reason).toContain("dirección contraria");
  });
  it("ritmos consistentes y pocos días restantes → alta", () => {
    const c = projectionConfidence({ netDaily8w: -30, netDaily14: -25, daysRemaining: 10 });
    expect(c.level).toBe("alta");
  });
  it("consistente pero con mucho mes por delante → media", () => {
    const c = projectionConfidence({ netDaily8w: -30, netDaily14: -25, daysRemaining: 28 });
    expect(c.level).toBe("media");
  });
  it("magnitudes muy distintas → media; sin serie → media", () => {
    expect(projectionConfidence({ netDaily8w: -30, netDaily14: -300, daysRemaining: 10 }).level).toBe("media");
    expect(projectionConfidence({ netDaily8w: -30, netDaily14: null, daysRemaining: 10 }).level).toBe("media");
  });
  it("monthEndProjection incluye la confianza", () => {
    const p = monthEndProjection({ liquid: 1600, netDaily8w: -30, daysRemaining: 10, minSoles: 19000, netDaily14: -28 });
    expect(p.confidence.level).toBe("alta");
  });
});

describe("simulaciones ¿Y si...? — impacto económico explícito", () => {
  it("cobrar pendientes: nueva liquidez + días extra de cobertura", () => {
    const s = simulateCollect({ liquid: 1607.30, receivablesTotal: 209.99, dailyExpense: 1270.86 });
    expect(s.newLiquid).toBeCloseTo(1817.29, 2);
    expect(s.extraDays).toBeCloseTo(0.2, 5);
    expect(s.text).toContain("209.99");
    expect(s.text).toContain("0.2");
  });
  it("recortar gasto 15%: ahorro y nuevo cierre proyectado", () => {
    const s = simulateCutSpending({ dailyExpense: 1000, daysRemaining: 12, pct: 0.15, projectedClose: 5000 });
    expect(s.savings).toBe(1800);
    expect(s.newClose).toBe(6800);
    expect(s.text).toContain("15%");
  });
  it("congelar compras 3 días: evita la salida, no inventa ingresos", () => {
    const s = simulateFreeze({ dailyExpense: 1000, days: 3, liquid: 5000 });
    expect(s.savings).toBe(3000);
    expect(s.text).toContain("2,000"); // 5000-3000: con cuánto quedarías sin congelar
    expect(s.text).toContain("5,000");
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
