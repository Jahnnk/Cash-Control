/**
 * La venta de un día cuenta cuando el día cierra (30-oct-2026): hoy, con la venta a medias, nunca entra.
 * Caso real: Atelier, el reporte de Byte bajado el 30/10 decía S/37,340.92; de eso, S/1,129.27 eran de la mañana del 30.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { leerFuentesVenta, ultimoDiaCerrado } from "../ventas-loader";

afterEach(() => vi.useRealTimers());

describe("último día cerrado", () => {
  it("es ayer, con la fecha de Lima (no la de UTC)", () => {
    // 30/10 a las 11 pm en Lima = 31/10 04:00 UTC: sigue siendo 30 en Lima, el último cerrado es el 29.
    expect(ultimoDiaCerrado(new Date("2026-10-31T04:00:00Z"))).toBe("2026-10-29");
    expect(ultimoDiaCerrado(new Date("2026-10-30T17:00:00Z"))).toBe("2026-10-29");
    expect(ultimoDiaCerrado(new Date("2026-11-01T14:00:00Z"))).toBe("2026-10-31");
  });
});

describe("el cargador no pasa del último día cerrado", () => {
  it("pidiendo hasta hoy, lee hasta ayer y nada más", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T17:00:00Z"));
    const rangos: string[] = [];
    const sql = (async (_s: TemplateStringsArray, ...p: unknown[]) => { rangos.push(p.filter((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)).join("→")); return []; }) as never;
    await leerFuentesVenta(sql, 1, "2026-10-01", "2026-10-30");
    // Ninguna lectura pide una fecha de hoy (30/10) o posterior.
    for (const r of rangos) for (const f of r.split("→")) expect(f <= "2026-10-29").toBe(true);
    expect(rangos.length).toBeGreaterThan(0);
  });
  it("un mes ya cerrado no cambia", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T17:00:00Z"));
    const rangos: string[] = [];
    const sql = (async (_s: TemplateStringsArray, ...p: unknown[]) => { rangos.push(p.filter((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)).join("→")); return []; }) as never;
    await leerFuentesVenta(sql, 2, "2026-09-01", "2026-09-30");
    // Se sigue leyendo 3 días más allá del fin de mes (para detectar los días que Byte junta): hasta el 03/10.
    expect(rangos.some((r) => r.endsWith("2026-10-03"))).toBe(true);
  });
  it("lo del día en curso no entra al resultado aunque la base lo traiga", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T17:00:00Z"));
    // La base (simulada) devuelve un día cerrado y el de hoy; el filtro de fechas del cargador es lo que protege.
    const filas = [{ date: "2026-10-29", total: 1000 }, { date: "2026-10-30", total: 1129.27 }];
    const sql = (async (_s: TemplateStringsArray, ...p: unknown[]) => {
      const hasta = p.filter((x) => typeof x === "string").at(-1) as string;
      return filas.filter((f) => f.date <= hasta);
    }) as never;
    const f = await leerFuentesVenta(sql, 1, "2026-10-01", "2026-10-30");
    const todo = [...f.byte, ...f.kelly, ...f.registro, ...(f.despues?.byte ?? [])];
    expect(todo.some((r) => r.date === "2026-10-30")).toBe(false);
  });
});
