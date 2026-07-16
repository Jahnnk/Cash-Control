/**
 * Comparativos de ventas para el deck. La regla que más protege:
 * mes actual vs mes pasado SIEMPRE a mismos días transcurridos —
 * comparar un mes a medias contra un mes completo infla la caída y ya
 * nos pasó dos veces con otras métricas (equilibrio, presupuesto).
 */
import { describe, it, expect } from "vitest";
import { compareVentasSede, type VentaRow } from "../ventas-deck";

/** 14 días de julio a S/1000 y todo junio a S/900. */
function fixture(): VentaRow[] {
  const rows: VentaRow[] = [];
  for (let d = 1; d <= 30; d++) rows.push({ date: `2026-06-${String(d).padStart(2, "0")}`, total: 900 });
  for (let d = 1; d <= 14; d++) rows.push({ date: `2026-07-${String(d).padStart(2, "0")}`, total: 1000 });
  return rows;
}

describe("compareVentasSede", () => {
  const ws = "2026-07-05", we = "2026-07-11"; // semana dom→sáb

  it("rango del informe y ventana anterior del mismo largo", () => {
    const r = compareVentasSede("Fonavi", fixture(), ws, we);
    expect(r.rango).toBe(7000);       // 7 días × 1000
    expect(r.rangoPrev).toBe(6700);   // 28-30 jun (3×900) + 1-4 jul (4×1000)
    expect(r.deltaRangoPct).toBeCloseTo(4.48, 1);
  });

  it("mes acumulado vs mes pasado a MISMOS DÍAS transcurridos (no mes completo)", () => {
    const r = compareVentasSede("Fonavi", fixture(), ws, we);
    expect(r.mes).toBe(11000);      // 1-11 jul
    expect(r.mesPrev).toBe(9900);   // 1-11 JUN (11 días × 900) — NO los 30 días (27000)
    expect(r.deltaMesPct).toBeCloseTo(11.11, 1);
  });

  it("hasta = última fecha con datos (para saber si falta subir el reporte)", () => {
    expect(compareVentasSede("Fonavi", fixture(), ws, we).hasta).toBe("2026-07-14");
  });

  it("sin datos del mes pasado → null, nunca un % contra cero", () => {
    const soloJulio = fixture().filter((r) => r.date.startsWith("2026-07"));
    const r = compareVentasSede("Centro", soloJulio, ws, we);
    expect(r.mesPrev).toBeNull();
    expect(r.deltaMesPct).toBeNull();
  });

  it("sede sin ningún dato → todo en cero/null (el deck avisa, no revienta)", () => {
    const r = compareVentasSede("Atelier", [], ws, we);
    expect(r).toEqual({
      sede: "Atelier", rango: 0, rangoPrev: null, deltaRangoPct: null,
      mes: 0, mesPrev: null, deltaMesPct: null, hasta: null,
    });
  });

  it("fin de mes: 31-jul compara contra 30-jun (ajuste de mes corto)", () => {
    const rows: VentaRow[] = [
      { date: "2026-06-30", total: 500 },
      { date: "2026-07-31", total: 800 },
    ];
    const r = compareVentasSede("Fonavi", rows, "2026-07-26", "2026-07-31");
    expect(r.mes).toBe(800);
    expect(r.mesPrev).toBe(500); // hasta el 30-jun, no truena buscando 31-jun
  });

  it("días con total 0 no cuentan como datos (no fingen frescura)", () => {
    const rows: VentaRow[] = [
      { date: "2026-07-10", total: 1000 },
      { date: "2026-07-14", total: 0 },
    ];
    expect(compareVentasSede("Fonavi", rows, ws, we).hasta).toBe("2026-07-10");
  });
});
