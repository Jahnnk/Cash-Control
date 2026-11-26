/**
 * ¿Cuándo subir? (fase 3, 17-nov-2026): tres señales por sede y la fecha sugerida (un domingo).
 */
import { describe, it, expect } from "vitest";
import { cuandoSubir, domingoSugerido, mesesEntre, sumarMeses, type MesCostos } from "./cuando-subir";

const mes = (m: string, pct: number): MesCostos => ({ mes: m, ventas: 40000, costos: 400 * pct });
const FONAVI = [mes("2026-04", 46.1), mes("2026-05", 42.8), mes("2026-06", 49.5), mes("2026-07", 40.4), mes("2026-08", 58.2), mes("2026-09", 47.6), mes("2026-10", 51.8)];
const base = { businessId: 2, sede: "Fonavi", hoy: "2026-11-17", inicioDatos: "2026-04-01", ultimaSubida: null, meses: FONAVI, sobreTope: 10, conCosto: 70 };

describe("fechas", () => {
  it("meses entre dos fechas", () => {
    expect(mesesEntre("2026-04-01", "2026-11-17")).toBe(7);
    expect(mesesEntre("2026-11", "2027-02")).toBe(3);
  });
  it("el domingo sugerido cae al menos 14 días después (las semanas de Byte van de domingo a sábado)", () => {
    // Martes 17-nov-2026 + 14 = martes 1-dic → domingo 6-dic.
    expect(domingoSugerido("2026-11-17")).toBe("2026-12-06");
    // Si hoy + 14 ya es domingo, ese mismo.
    expect(domingoSugerido("2026-11-22")).toBe("2026-12-06");
  });
  it("la próxima revisión, 6 meses después", () => {
    expect(sumarMeses("2026-12-06", 6)).toBe("2027-06-06");
  });
});

describe("las tres señales", () => {
  it("Fonavi hoy: 7 meses sin subir, costos de 46.1% a 52.5% y 14% de la carta sobre el tope → ya toca", () => {
    const r = cuandoSubir(base);
    expect(r).toMatchObject({ meses: 7, desdeInicio: true, costoAntesPct: 46.1, costoAhoraPct: 52.5, estado: "ya-toca" });
    expect(r.senales.tiempo.activa).toBe(true);
    expect(r.senales.costo).toEqual({ activa: true, texto: "Los costos pasaron de 46.1% a 52.5% de la venta (+6.4 puntos)." });
    expect(r.senales.carta.activa).toBe(false); // 10 de 70 = 14%
  });

  it("con una subida reciente y costos quietos: todavía no", () => {
    const quietos = FONAVI.map((m) => ({ ...m, costos: 400 * 45 }));
    const r = cuandoSubir({ ...base, ultimaSubida: "2026-09-06", meses: quietos, sobreTope: 3 });
    expect(r.senales.tiempo).toEqual({ activa: false, texto: "2 meses desde la última subida." });
    expect(r.senales.costo.activa).toBe(false);
    expect(r.estado).toBe("todavia-no");
  });

  it("una sola señal: prepárala", () => {
    const r = cuandoSubir({ ...base, ultimaSubida: "2026-09-06", sobreTope: 3 });
    expect(r.estado).toBe("preparala");
  });

  it("la carta pesa cuando 15% o más de los productos pasan la meta de costo", () => {
    expect(cuandoSubir({ ...base, sobreTope: 11, conCosto: 70 }).senales.carta.activa).toBe(true);
  });

  it("con menos de 4 meses cerrados no se compara el costo", () => {
    const r = cuandoSubir({ ...base, meses: FONAVI.slice(0, 3) });
    expect(r).toMatchObject({ costoAntesPct: null, costoAhoraPct: null });
    expect(r.senales.costo.activa).toBe(false);
  });
});
