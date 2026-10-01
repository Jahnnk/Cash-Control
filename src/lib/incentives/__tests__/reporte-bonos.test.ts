import { describe, it, expect } from "vitest";
import { armarReporte, seRepartePorNivel, llavesDelMes, conPremio } from "../reporte-bonos";
import { computeProgress, type IncentiveConfigT, type DailyEntry } from "../engine";
import type { GroupIncentives } from "@/app/actions/group-incentives";
import type { PagoSede, PagoColaborador } from "../reporte-bonos-tipos";

const levels = [
  { nombre: "Nivel 1", delta: 1.5, bono_tc: 48, bono_mt: 24, bono_admin: 89, premio_mv: 68 },
  { nombre: "Nivel 2", delta: 3, bono_tc: 97, bono_mt: 48, bono_admin: 179, premio_mv: 134 },
  { nombre: "¡La rompimos!", delta: 5, bono_tc: 162, bono_mt: 81, bono_admin: 298, premio_mv: 224 },
];
const config: IncentiveConfigT = { ticketBase: 22.11, marginPct: 0.533, trafficFloor: 49, poolPct: 0.4, levels };

// 3 días: ticket presencial 23.00 / 24.00 / 23.60
const dailies: DailyEntry[] = [
  { date: "2026-09-01", personas: 50, revenue: 1150, items: null },
  { date: "2026-09-02", personas: 50, revenue: 1200, items: null },
  { date: "2026-09-03", personas: 50, revenue: 1180, items: null },
];
const staff = [
  { name: "Ana", jornada: "medio_turno" as const, area: "salon", active: true, horasSemanales: 23.5 },
  { name: "Luis", jornada: "administrador" as const, area: "administracion", active: true },
];

function sede(): GroupIncentives {
  const progress = computeProgress(config, staff, dailies, 30);
  return {
    month: "2026-09", range: null,
    sedes: [{
      businessId: 2, sede: "Fonavi", progress, ticketBase: 22.11, mejorVendedor: null,
      mvPeriodStart: null, mvPeriodEnd: null, ultimoRegistro: "2026-09-03", liquidado: false,
      minMesas: 60, noElegibles: 0, dailies,
    }],
  };
}

const linea = (p: Partial<PagoColaborador>): PagoColaborador => ({
  name: "Ana", dni: "1", jornada: "medio_turno", horasMes: 94, horasReales: true, origenHoras: "registrada",
  horasBase: 94, horasMenos: 0, horasMas: 0, bono: 0, premioMv: 0, total: 0, ...p,
});

const pago = (over: Partial<PagoSede> = {}): PagoSede => ({
  businessId: 2, sede: "Fonavi", month: "2026-09", fuente: "vista-previa", cerradaEn: null, nivel: null, tarifaHora: null,
  totalBonos: 0, pozo: null, premioDelNivel: 0,
  mejorVendedor: { sugeridoByte: null, sugeridoEquipo: null, usado: null, premio: 0 }, equipo: ["Ana", "Luis"],
  lines: [linea({}), linea({ name: "Luis", jornada: "administrador", horasMes: 192 })],
  warnings: [], blockers: [], sincronizadoEn: null,
  ventas: {
    meta: 37300, provisional: false, vinculante: false, mesesReferencia: ["2026-06", "2026-07", "2026-08"],
    ventas: 3530, diasConVenta: 3, proyeccion: 35300, avancePct: 9.5, falta: 33770, cumple: false, enCamino: false,
  },
  politica: { requiereEquilibrio: false, requiereSupervision: false, trafficFloor: 49 },
  excluidos: [], incluidosPorExcepcion: [], excepcionesDisponibles: true,
  ...over,
});

describe("armarReporte", () => {
  it("el ticket acumulado y la diferencia contra el Nivel 1 se arrastran día a día", () => {
    const r = armarReporte(sede(), { month: "2026-09", generadoEn: "x", sedes: [pago()], errores: [] }, "Septiembre 2026", "hoy");
    const dias = r.sedes[0].dias;
    expect(dias).toHaveLength(3);
    expect(dias[0].ticketAcum).toBe(23);
    expect(dias[1].ticketAcum).toBe(23.5);
    expect(dias[2].ticketAcum).toBe(23.53);
    // Nivel 1 = 22.11 + 1.5 = 23.61 → faltan 0.08 al tercer día
    expect(dias[2].difNivel1).toBe(-0.08);
    expect(dias[2].ventaAcum).toBe(3530);
    expect(dias[2].pctMeta).toBeCloseTo(3530 / 37300, 6);
  });

  it("sin ningún nivel alcanzado lo dice con la distancia al Nivel 1 y que no hay bono", () => {
    const r = armarReporte(sede(), { month: "2026-09", generadoEn: "x", sedes: [pago()], errores: [] }, "Septiembre 2026", "hoy");
    const f = r.sedes[0].frases.join(" ");
    expect(f).toMatch(/no se alcanzó ningún nivel/);
    expect(f).toMatch(/A repartir: S\/0/);
    // septiembre: la meta de ventas es práctica
    expect(f).toMatch(/solo de práctica/);
  });

  it("el avance por nivel es el levantamiento logrado sobre el pedido", () => {
    const r = armarReporte(sede(), { month: "2026-09", generadoEn: "x", sedes: [pago()], errores: [] }, "Septiembre 2026", "hoy");
    expect(r.sedes[0].ticket.niveles.map((n) => n.premioMv)).toEqual([68, 134, 224]);
    const [a1, a2, a3] = r.sedes[0].ticket.avancePorNivel;
    expect(a1).toBeCloseTo((23.53 - 22.11) / 1.5 * 100, 0);
    expect(a2).toBeCloseTo((23.53 - 22.11) / 3 * 100, 0);
    expect(a3!).toBeLessThan(a2!);
  });

  it("en modo rango no mezcla pagos ni llaves del mes", () => {
    const d = sede();
    d.range = { from: "2026-09-01", to: "2026-09-03" };
    const r = armarReporte(d, { month: "2026-09", generadoEn: "x", sedes: [pago()], errores: [] }, "x", "hoy");
    expect(r.totalARepartir).toBeNull();
    expect(r.sedes[0].pagos).toBeNull();
    expect(r.llaves).toEqual([]);
  });

  it("el total a repartir suma las sedes", () => {
    const r = armarReporte(sede(), { month: "2026-09", generadoEn: "x", sedes: [pago({ totalBonos: 736 })], errores: [] }, "Septiembre 2026", "hoy");
    expect(r.totalARepartir).toBe(736);
  });
});

describe("seRepartePorNivel", () => {
  it("usa las horas reales: 94 h a la tarifa del nivel + el fijo del administrador + el premio", () => {
    const lines = [linea({}), linea({ name: "Luis", jornada: "administrador", horasMes: 192 }), linea({ name: "Dieguito", horasMes: 48 })];
    // Nivel 2: Ana 94h → 48; Dieguito 48h → round(48*48/94)=25; admin → 179; + premio 134
    expect(seRepartePorNivel(lines, levels[1], "2026-09")).toBe(48 + 25 + 179 + 134);
  });
});

describe("llavesDelMes", () => {
  it("septiembre: ventas de práctica, piso de tráfico vigente, supervisiones aún no", () => {
    const l = llavesDelMes([pago()]);
    expect(l.find((x) => x.nombre === "Meta de ventas")?.rol).toBe("practica");
    expect(l.find((x) => x.nombre === "Piso de tráfico")?.rol).toBe("requisito");
    expect(l.find((x) => x.nombre === "Supervisiones")?.rol).toBe("no-aplica");
  });

  it("octubre: ventas y supervisiones son requisito y el piso desaparece", () => {
    const l = llavesDelMes([pago({ politica: { requiereEquilibrio: true, requiereSupervision: true, trafficFloor: null } })]);
    expect(l.find((x) => x.nombre === "Meta de ventas")?.rol).toBe("requisito");
    expect(l.find((x) => x.nombre === "Supervisiones")?.rol).toBe("requisito");
    expect(l.find((x) => x.nombre === "Piso de tráfico")?.rol).toBe("no-aplica");
  });
});

describe("conPremio", () => {
  const base = pago({
    nivel: "Nivel 2", premioDelNivel: 134, totalBonos: 227, 
    lines: [linea({ name: "Ana", bono: 48, total: 48 }), linea({ name: "Luis", jornada: "administrador", bono: 179, total: 179 })],
    warnings: ["Sin mejor vendedor asignado: el premio no se paga este mes (Fase B lo calculará automático)."],
  });

  it("suma el premio del nivel a la persona elegida y al total", () => {
    const r = conPremio(base, "ana");
    expect(r.lines[0]).toMatchObject({ premioMv: 134, total: 182 });
    expect(r.totalBonos).toBe(227 + 134);
    expect(r.mejorVendedor).toMatchObject({ usado: "ana", premio: 134 });
    expect(r.warnings.some((w) => w.startsWith("Sin mejor vendedor"))).toBe(false);
  });

  it("cambiar de persona mueve el premio, no lo duplica", () => {
    const r = conPremio(conPremio(base, "Ana"), "Luis");
    expect(r.lines.map((l) => l.premioMv)).toEqual([0, 134]);
    expect(r.totalBonos).toBe(227 + 134);
  });

  it("sin nivel de ticket no hay premio aunque se elija a alguien", () => {
    const r = conPremio({ ...base, nivel: null }, "Ana");
    expect(r.mejorVendedor.premio).toBe(0);
    expect(r.totalBonos).toBe(227);
  });

  it("sin elegir a nadie avisa que no se paga el premio", () => {
    const r = conPremio(base, null);
    expect(r.warnings.some((w) => w.startsWith("Sin mejor vendedor asignado"))).toBe(true);
  });

  it("un mes cerrado no se toca: manda el acta", () => {
    const acta = { ...base, fuente: "acta" as const };
    expect(conPremio(acta, "Ana")).toBe(acta);
  });
});
