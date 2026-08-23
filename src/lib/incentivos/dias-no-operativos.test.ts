/**
 * Tests de los días no operativos.
 *
 * Lo que se clava: que un día pausado con venta PARCIAL deje de
 * arrastrar el ticket promedio — el caso que el filtro del motor
 * (`personas > 0 && revenue > 0`) no cubría y que es el que más se va a
 * repetir con feriados y cortes a media jornada.
 */
import { describe, it, expect } from "vitest";
import {
  validarMotivoDia, indicePausados, estaPausado, sinDiasPausados,
  diasOperativosDelMes, MAX_MOTIVO_DIA,
} from "./dias-no-operativos";
import { computeProgress } from "../incentives/engine";

const CENTRO = 3;
const p = (fecha: string, businessId = CENTRO) => ({ businessId, fecha });

describe("validarMotivoDia", () => {
  it("acepta un motivo normal y normaliza espacios", () => {
    const r = validarMotivoDia("  Corte  de luz  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.motivo).toBe("Corte de luz");
  });

  it("EXIGE motivo: un día excluido sin explicación hace dudar del bono", () => {
    const r = validarMotivoDia("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("por qué");
  });

  it("rechaza un motivo kilométrico", () => {
    expect(validarMotivoDia("x".repeat(MAX_MOTIVO_DIA + 1)).ok).toBe(false);
  });
});

describe("índice de pausados", () => {
  it("distingue por sede: pausar en Centro no pausa en Fonavi", () => {
    const i = indicePausados([p("2026-08-22", 3)]);
    expect(estaPausado(i, 3, "2026-08-22")).toBe(true);
    expect(estaPausado(i, 2, "2026-08-22")).toBe(false);
  });

  it("distingue por fecha", () => {
    const i = indicePausados([p("2026-08-22")]);
    expect(estaPausado(i, CENTRO, "2026-08-21")).toBe(false);
  });
});

describe("sinDiasPausados", () => {
  it("saca solo el día pausado", () => {
    const dias = [{ date: "2026-08-20" }, { date: "2026-08-21" }, { date: "2026-08-22" }];
    const r = sinDiasPausados(dias, indicePausados([p("2026-08-21")]), CENTRO);
    expect(r.map((d) => d.date)).toEqual(["2026-08-20", "2026-08-22"]);
  });

  it("no toca nada si no hay pausados", () => {
    const dias = [{ date: "2026-08-20" }];
    expect(sinDiasPausados(dias, indicePausados([]), CENTRO)).toHaveLength(1);
  });
});

describe("diasOperativosDelMes", () => {
  it("descuenta los días cerrados de la proyección", () => {
    expect(diasOperativosDelMes(31, "2026-08", [p("2026-08-22"), p("2026-08-23")], CENTRO)).toBe(29);
  });

  it("solo cuenta los del MES consultado", () => {
    expect(diasOperativosDelMes(31, "2026-08", [p("2026-07-15")], CENTRO)).toBe(31);
  });

  it("solo cuenta los de ESA sede", () => {
    expect(diasOperativosDelMes(31, "2026-08", [p("2026-08-22", 2)], CENTRO)).toBe(31);
  });

  it("nunca devuelve cero: no se puede dividir entre cero días", () => {
    const todos = Array.from({ length: 31 }, (_, i) =>
      p(`2026-08-${String(i + 1).padStart(2, "0")}`));
    expect(diasOperativosDelMes(31, "2026-08", todos, CENTRO)).toBe(1);
  });
});

describe("efecto real en el ticket promedio", () => {
  const CONFIG = {
    ticketBase: 24.82, trafficFloor: 40, marginPct: 0.35, poolPct: 0.4,
    levels: [{ nombre: "Nivel 1", delta: 1, bonos: {} }],
  } as unknown as Parameters<typeof computeProgress>[0];

  const dia = (date: string, personas: number, revenue: number) => ({
    date, personas, revenue, items: null,
    deliveryPedidos: null, deliveryVenta: null,
    personalPedidos: null, personalVenta: null,
  }) as unknown as Parameters<typeof computeProgress>[2][number];

  it("un día CERRADO (0/0) ya no afectaba: el motor lo filtraba solo", () => {
    const normales = [dia("2026-08-20", 50, 1500), dia("2026-08-21", 50, 1500)];
    const conCerrado = [...normales, dia("2026-08-22", 0, 0)];
    const a = computeProgress(CONFIG, [], normales, 31);
    const b = computeProgress(CONFIG, [], conCerrado, 31);
    expect(b.ticketActual).toBe(a.ticketActual);
  });

  it("pero un día PARCIAL sí lo arrastraba — y pausarlo lo devuelve", () => {
    // El caso real: abren, se corta la luz a media tarde, venden poco
    // con la misma gente adentro. Ticket de ese día: S/6.
    const normales = [dia("2026-08-20", 50, 1500), dia("2026-08-21", 50, 1500)];
    const parcial = dia("2026-08-22", 30, 180);

    const sinPausar = computeProgress(CONFIG, [], [...normales, parcial], 31);
    const pausado = computeProgress(
      CONFIG, [],
      sinDiasPausados([...normales, parcial], indicePausados([p("2026-08-22")]), CENTRO),
      31,
    );

    expect(sinPausar.ticketActual).toBe(24.46);   // por debajo de la base (24.82)
    expect(pausado.ticketActual).toBe(30);        // el real del equipo
    expect(pausado.ticketActual!).toBeGreaterThan(sinPausar.ticketActual!);
  });

  it("y también protege el piso de tráfico", () => {
    // 30 personas en media jornada bajan el promedio de personas/día.
    const normales = [dia("2026-08-20", 50, 1500), dia("2026-08-21", 50, 1500)];
    const parcial = dia("2026-08-22", 12, 300);

    const sinPausar = computeProgress(CONFIG, [], [...normales, parcial], 31);
    const pausado = computeProgress(
      CONFIG, [],
      sinDiasPausados([...normales, parcial], indicePausados([p("2026-08-22")]), CENTRO),
      31,
    );

    expect(sinPausar.traffic.cumple).toBe(false);  // 37.3 < 40
    expect(pausado.traffic.cumple).toBe(true);     // 50 ≥ 40
  });
});
