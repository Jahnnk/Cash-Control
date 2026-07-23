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
      mes: 0, mesPrev: null, deltaMesPct: null,
      rangoDias: 0, rangoPrevDias: 0, mesDias: 0, mesPrevDias: 0,
      hasta: null, fuente: null,
    });
  });

  // El incidente Atelier +205.9% (jul-2026): la semana anterior tenía
  // solo 3 de 7 días cargados y el % sobre TOTALES la hacía ver enana.
  it("semana anterior a medio cargar NO infla el % (promedio por día)", () => {
    const rows: VentaRow[] = [];
    // Semana anterior: solo 3 días con datos, a S/1000 c/u.
    for (const d of ["2026-06-29", "2026-06-30", "2026-07-01"]) rows.push({ date: d, total: 1000 });
    // Semana del informe: 7 días completos a S/1100.
    for (let d = 5; d <= 11; d++) rows.push({ date: `2026-07-${String(d).padStart(2, "0")}`, total: 1100 });
    const r = compareVentasSede("Atelier", rows, ws, we);
    // Con totales habría dado +156% (7700 vs 3000). Por día: 1100 vs 1000.
    expect(r.deltaRangoPct).toBeCloseTo(10, 1);
    expect(r.rangoPrevDias).toBe(3); // …y la cobertura queda expuesta
    expect(r.rangoDias).toBe(7);
  });

  it("expone los días con datos de cada ventana (honestidad de cobertura)", () => {
    const r = compareVentasSede("Fonavi", fixture(), ws, we);
    expect(r.rangoDias).toBe(7);
    expect(r.rangoPrevDias).toBe(7);
    expect(r.mesDias).toBe(11);
    expect(r.mesPrevDias).toBe(11);
  });

  it("ventana actual vacía → delta null (nunca -100% fantasma)", () => {
    const soloJunio = fixture().filter((r) => r.date.startsWith("2026-06"));
    const r = compareVentasSede("Centro", soloJunio, ws, we);
    expect(r.deltaRangoPct).toBeNull();
    expect(r.rango).toBe(0);
  });

  it("acepta la fuente 'mixta' (días de Byte + registro combinados)", () => {
    expect(compareVentasSede("Fonavi", fixture(), ws, we, "mixta").fuente).toBe("mixta");
  });

  it("marca la fuente: 'byte' (reporte oficial) o 'registro' (respaldo del panel)", () => {
    expect(compareVentasSede("Fonavi", fixture(), ws, we, "registro").fuente).toBe("registro");
    expect(compareVentasSede("Centro", fixture(), ws, we, "byte").fuente).toBe("byte");
  });

  it("por defecto la fuente es 'byte'; sin datos es null (no finge respaldo)", () => {
    expect(compareVentasSede("Fonavi", fixture(), ws, we).fuente).toBe("byte");
    expect(compareVentasSede("Atelier", [], ws, we, "registro").fuente).toBeNull();
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
