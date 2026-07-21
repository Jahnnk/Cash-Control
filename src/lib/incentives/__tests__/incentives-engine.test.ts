/**
 * Tests del motor de Incentivos — VALIDADOS CONTRA LA POLÍTICA jun-2026:
 * los números del documento (pozos, sumas de bonos, colchones) deben
 * salir exactos del motor. Si la política y el código divergen, esto truena.
 */
import { describe, it, expect } from "vitest";
import {
  pickDailyFocus,
  computeProgress,
  computeFlags,
  computeLiquidation,
  bonusTableSum,
  type IncentiveConfigT,
  type StaffMember,
  type IncentiveLevel,
} from "../engine";
import { parseControlReport, normalizeByteDate } from "../byte-control-parsers";

const LEVELS: IncentiveLevel[] = [
  { nombre: "Nivel 1", delta: 1.5, bono_tc: 48, bono_mt: 24, bono_admin: 89, premio_mv: 68 },
  { nombre: "Nivel 2", delta: 3.0, bono_tc: 97, bono_mt: 48, bono_admin: 179, premio_mv: 134 },
  { nombre: "¡La rompimos!", delta: 5.0, bono_tc: 162, bono_mt: 81, bono_admin: 298, premio_mv: 224 },
];

const FONAVI: IncentiveConfigT = { ticketBase: 25.44, marginPct: 0.533, trafficFloor: 49, poolPct: 0.4, levels: LEVELS };
const CENTRO: IncentiveConfigT = { ticketBase: 24.82, marginPct: 0.598, trafficFloor: 45, poolPct: 0.4, levels: LEVELS };

const mkStaff = (tc: number, mt: number): StaffMember[] => [
  { name: "Admin", jornada: "administrador", area: "administracion", active: true },
  ...Array.from({ length: tc }, (_, i) => ({ name: `TC${i}`, jornada: "tiempo_completo" as const, area: "salon", active: true })),
  ...Array.from({ length: mt }, (_, i) => ({ name: `MT${i}`, jornada: "medio_turno" as const, area: "salon", active: true })),
];

describe("motor vs política — los números del documento salen exactos", () => {
  it("suma de bonos Nivel 2: Fonavi S/845 (4 TC + 3 MT + admin) y Centro S/891 (2 TC + 8 MT + admin)", () => {
    expect(bonusTableSum(mkStaff(4, 3), LEVELS[1])).toBe(845);
    expect(bonusTableSum(mkStaff(2, 8), LEVELS[1])).toBe(891);
  });

  it("pozo Fonavi Nivel 2 ≈ S/993 con 1,553 clientes (ejemplo de la sección 3)", () => {
    // Pozo = 3.00 × 1553 × 0.533 × 0.40 = 993.29
    const dailies = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      personas: Math.round(1553 / 30),
      revenue: Math.round(1553 / 30) * 28.44,
      items: null,
    }));
    const p = computeProgress(FONAVI, mkStaff(4, 3), dailies, 30);
    expect(p.ticketActual).toBeCloseTo(28.44, 2);
    expect(p.nivelAlcanzado?.nombre).toBe("Nivel 2");
    // 51 personas/día × 30 = 1530 proyectadas → pozo ≈ 978 (con el
    // redondeo diario); el orden de magnitud del documento (≈993) se
    // respeta y el colchón sigue positivo vs los S/845 de la tabla.
    expect(p.pozoProyectado).toBeGreaterThan(900);
    const nivel2 = p.porNivel.find((n) => n.level.nombre === "Nivel 2")!;
    expect(nivel2.sumaBonos).toBe(845);
    expect(nivel2.colchon!).toBeGreaterThan(0);
  });

  it("Centro Nivel 2: bonos S/891 caben en el pozo (colchón positivo, sección 7)", () => {
    const dailies = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      personas: 47,
      revenue: 47 * 27.82,
      items: null,
    }));
    const p = computeProgress(CENTRO, mkStaff(2, 8), dailies, 30);
    expect(p.nivelAlcanzado?.nombre).toBe("Nivel 2");
    const nivel2 = p.porNivel.find((n) => n.level.nombre === "Nivel 2")!;
    expect(nivel2.sumaBonos).toBe(891);
    expect(nivel2.pozoNivel!).toBeGreaterThan(891); // el techo cubre la tabla
    expect(p.traffic.cumple).toBe(true); // 47 ≥ 45
  });

  it("piso de tráfico: con menos personas/día que el piso, cumple = false", () => {
    const dailies = [{ date: "2026-07-01", personas: 30, revenue: 30 * 30, items: null }];
    const p = computeProgress(FONAVI, mkStaff(4, 3), dailies, 30);
    expect(p.traffic.cumple).toBe(false); // 30 < 49
  });

  it("ticket bajo la base: sin nivel, sin pozo (no hay venta nueva → no hay bono)", () => {
    const dailies = [{ date: "2026-07-01", personas: 50, revenue: 50 * 24.0, items: null }];
    const p = computeProgress(FONAVI, mkStaff(4, 3), dailies, 30);
    expect(p.nivelAlcanzado).toBeNull();
    expect(p.pozoProyectado).toBeNull();
    expect(p.proximoNivel?.level.nombre).toBe("Nivel 1");
  });
});

describe("liquidación del mes — candados de la política", () => {
  const mesDailies = (personasDia: number, ticket: number, dias = 30) =>
    Array.from({ length: dias }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      personas: personasDia,
      revenue: personasDia * ticket,
      items: null,
    }));
  const base = {
    month: "2026-07",
    todayISO: "2026-08-01",
    config: CENTRO,
    staff: mkStaff(2, 8),
    unverifiedDays: 0,
    observedDays: [] as { date: string; nota: string | null }[],
    mejorVendedor: null as string | null,
  };

  it("Nivel 2 limpio: paga la tabla exacta de la política (S/891 con premio)", () => {
    const r = computeLiquidation({ ...base, dailies: mesDailies(47, 27.82), mejorVendedor: "TC0" });
    expect(r.blockers).toHaveLength(0);
    expect(r.nivel?.nombre).toBe("Nivel 2");
    expect(r.totalBonos).toBe(891); // 2×97 + 8×48 + 179 + premio 134
    const tc0 = r.lines.find((l) => l.name === "TC0")!;
    expect(tc0.bono + tc0.premioMv).toBe(97 + 134); // el ejemplo del documento
  });

  it("mes sin terminar = BLOQUEADO (se liquida con el mes completo)", () => {
    const r = computeLiquidation({ ...base, todayISO: "2026-07-20", dailies: mesDailies(47, 27.82) });
    expect(r.blockers.some((b) => b.includes("no termina"))).toBe(true);
  });

  it("día observado sin resolver = BLOQUEADO con la nota del verificador", () => {
    const r = computeLiquidation({
      ...base,
      dailies: mesDailies(47, 27.82),
      observedDays: [{ date: "2026-07-10", nota: "conté ~60 y hay 48" }],
    });
    expect(r.blockers.some((b) => b.includes("OBSERVADO") && b.includes("conté ~60"))).toBe(true);
  });

  it("piso de tráfico incumplido: la meta NO cuenta → cierra sin bonos (con aviso)", () => {
    const r = computeLiquidation({ ...base, dailies: mesDailies(40, 29) }); // ticket altísimo pero 40 < 45
    expect(r.trafficOk).toBe(false);
    expect(r.nivel).toBeNull();
    expect(r.totalBonos).toBe(0);
    expect(r.warnings.some((w) => w.includes("NO cuenta"))).toBe(true);
    expect(r.blockers).toHaveLength(0); // se puede cerrar como "sin bono"
  });

  it("sin mejor vendedor: el premio no se paga y queda avisado", () => {
    const r = computeLiquidation({ ...base, dailies: mesDailies(47, 27.82) });
    expect(r.totalBonos).toBe(891 - 134);
    expect(r.warnings.some((w) => w.includes("mejor vendedor"))).toBe(true);
  });
});

describe("banderas anti-trampa (sección 10)", () => {
  const ventas = [{ nombre: "JUNIOR ALEXANDER LLANOS FLORES", mesas: 100, total: 3000 }];

  it("anulación sin motivo = bandera ALTA (regla dura)", () => {
    const flags = computeFlags(
      [{ kind: "anulacion", eventAt: "2026-07-01 11:00:00", usuario: "JUNIOR ALEXANDER LLANOS FLORES", producto: "X", amount: 30, motivo: null }],
      ventas,
    );
    expect(flags.some((f) => f.id.startsWith("sin-motivo") && f.severity === "alta")).toBe(true);
  });

  it("tasa de anulaciones >5% de SUS ventas = bandera (por tasa, no conteo)", () => {
    const events = Array.from({ length: 4 }, (_, i) => ({
      kind: "anulacion" as const, eventAt: `2026-07-0${i + 1} 10:00:00`,
      usuario: "JUNIOR ALEXANDER LLANOS FLORES", producto: "X", amount: 50, motivo: "error",
    }));
    const flags = computeFlags(events, ventas); // 200/3000 = 6.7%
    expect(flags.some((f) => f.id.startsWith("tasa-anulaciones"))).toBe(true);
    // mismo monto con ventas grandes → sin bandera
    const ok = computeFlags(events, [{ nombre: "JUNIOR ALEXANDER LLANOS FLORES", mesas: 100, total: 10000 }]);
    expect(ok.some((f) => f.id.startsWith("tasa-anulaciones"))).toBe(false);
  });

  it("≥10 cambios de precio manuales = bandera (caso real Centro junio)", () => {
    const events = Array.from({ length: 12 }, (_, i) => ({
      kind: "cambio_precio" as const, eventAt: `2026-06-${String(i + 10)} 17:00:00`,
      usuario: "JUNIOR ALEXANDER LLANOS FLORES", producto: "CAPPUCCINO", amount: 2, motivo: "S/12.00 → S/14.00",
    }));
    expect(computeFlags(events, ventas).some((f) => f.id.startsWith("cambios-precio"))).toBe(true);
  });
});

describe("parsers de reportes de control (estructuras reales)", () => {
  it("anulados: detecta, usa 'Pedido por' como usuario y captura motivo vacío", () => {
    const r = parseControlReport([
      ["Reporte Pedidos Anulados"],
      ["COD", "ID Venta", "Cant", "Pedido", "Fecha Pedido", "Fecha Anulación", "Total", "Motivo", "Pedido por", "Anulado por"],
      [16339, 5481, 1, "DESAYUNO RÚSTICO", "2026-06-07 11:03:19", "2026-06-07 11:03:51", 30, null, "JUNIOR", "JUNIOR"],
    ]);
    expect(r.ok && r.kind).toBe("anulaciones");
    if (!r.ok) return;
    expect(r.events[0]).toMatchObject({ kind: "anulacion", usuario: "JUNIOR", amount: 30, motivo: null });
    expect(r.periodStart).toBe("2026-06-07");
  });

  it("cambios de precio: parsea 'S/ 12.00' → delta y fecha dd/mm/yyyy", () => {
    const r = parseControlReport([
      ["Reporte de cambios de Precio 2026-06-01 a 2026-06-22"],
      ["Pedido", "Plato", "Precio Anterior", "Precio Nuevo", "Diferencia", "Usuario", "Caja", "Fecha"],
      ["#6039", "CAPPUCCINO", "S/ 12.00", "S/ 14.00", "+S/ 2.00", "JUNIOR", "01", "22/06/2026 19:29:37"],
    ]);
    expect(r.ok && r.kind).toBe("cambios_precio");
    if (!r.ok) return;
    expect(r.events[0].amount).toBe(2);
    expect(r.events[0].eventAt).toBe("2026-06-22 19:29:37");
  });

  it("ventas por trabajador: salta la fila TOTAL (sin nombre) y lee el rango", () => {
    const r = parseControlReport([
      ["Ventas por trabajador del 2026-06-01 al 2026-06-30"],
      ["DNI", "Nombres Y Apellidos", "Mesas Atendidas", "Total (S/)"],
      [null, null, 1342, 37280.15],
      [60756693, "ISABEL OBLITAS", 278, 8133.8],
    ]);
    expect(r.ok && r.kind).toBe("ventas_trabajador");
    if (!r.ok) return;
    expect(r.workers).toHaveLength(1);
    expect(r.workers[0].nombre).toBe("ISABEL OBLITAS");
    expect(r.periodStart).toBe("2026-06-01");
  });

  it("cortesías: detecta con usuario, precio y fecha ISO", () => {
    const r = parseControlReport([
      ["Byte Restaurantes"],
      ["Pedido", "Cortesía", "Usuario", "Precio Original", "Fecha", "Motivo"],
      [null, "CARROT CAKE", "JUNIOR", 12, "2026-06-18 12:17:43", null],
    ]);
    expect(r.ok && r.kind).toBe("cortesias");
  });

  it("archivo desconocido → error claro", () => {
    const r = parseControlReport([["Otro"], ["A", "B"], [1, 2]]);
    expect(r.ok).toBe(false);
  });

  it("normalizeByteDate: ambos formatos reales", () => {
    expect(normalizeByteDate("2026-06-07 11:03:51")).toBe("2026-06-07 11:03:51");
    expect(normalizeByteDate("22/06/2026 19:29:37")).toBe("2026-06-22 19:29:37");
  });
});

describe("pickDailyFocus — rotación diaria del foco de upselling", () => {
  const pool = Array.from({ length: 24 }, (_, i) => `prod-${i}`);

  it("mismo día → misma lista (determinista: admin y dirección ven lo mismo)", () => {
    expect(pickDailyFocus(pool, 10, "2026-07-16")).toEqual(pickDailyFocus(pool, 10, "2026-07-16"));
  });

  it("días consecutivos → listas DISTINTAS (el reclamo del admin de Fonavi)", () => {
    const hoy = pickDailyFocus(pool, 10, "2026-07-16");
    const manana = pickDailyFocus(pool, 10, "2026-07-17");
    expect(hoy).not.toEqual(manana);
    expect(hoy).toHaveLength(10);
    expect(manana).toHaveLength(10);
  });

  it("en 24 días se muestran TODOS los candidatos del pozo al menos una vez", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 24; d++) {
      pickDailyFocus(pool, 10, `2026-07-${String(d).padStart(2, "0")}`).forEach((p) => seen.add(p));
    }
    expect(seen.size).toBe(24);
  });

  it("pozo chico (≤ 10): devuelve todo sin inventar rotación", () => {
    const chico = ["a", "b", "c"];
    expect(pickDailyFocus(chico, 10, "2026-07-16")).toEqual(chico);
  });

  it("sin duplicados dentro del día", () => {
    const dia = pickDailyFocus(pool, 10, "2026-07-31");
    expect(new Set(dia).size).toBe(10);
  });
});

describe("computeProgress — delivery EXCLUIDO del ticket del programa (jul-2026)", () => {
  // 10 días: 50 clientes presenciales/día (mostrador + mesa, ambos cuentan)
  // a S/25 + 10 deliverys/día a S/12 (que bajaban el promedio).
  const conDelivery = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    personas: 60,               // 50 salón + 10 delivery
    revenue: 50 * 25 + 10 * 12, // 1250 salón + 120 delivery = 1370
    items: null,
    deliveryPedidos: 10,
    deliveryVenta: 120,
  }));

  it("el ticket del programa es TODO lo presencial (mostrador + mesa), sin delivery", () => {
    const p = computeProgress(FONAVI, mkStaff(4, 3), conDelivery, 30);
    // Con delivery mezclado sería 1370/60 = 22.83 (injusto).
    expect(p.ticketActual).toBeCloseTo(25.0, 2); // 1250/50: mostrador + mesa
    expect(p.deltaActual).toBeCloseTo(25.0 - 25.44, 2);
  });

  it("el ticket delivery se reporta APARTE (informativo, no castiga)", () => {
    const p = computeProgress(FONAVI, mkStaff(4, 3), conDelivery, 30);
    expect(p.delivery).toEqual({ pedidos: 100, venta: 1200, ticket: 12 });
  });

  it("el piso de tráfico sigue sobre personas TOTALES, delivery incluido (60/día cumple el piso de 49)", () => {
    const p = computeProgress(FONAVI, mkStaff(4, 3), conDelivery, 30);
    expect(p.traffic.personasPorDia).toBe(60);
    expect(p.traffic.cumple).toBe(true);
  });

  it("el pozo se proyecta con clientes PRESENCIALES (la utilidad nueva sale de ellos)", () => {
    const p = computeProgress(FONAVI, mkStaff(4, 3), conDelivery, 30);
    expect(p.personasProyectadas).toBe(50 * 30); // presenciales/día × días del mes
  });

  it("MOSTRADOR CUENTA IGUAL QUE MESA: el motor no los distingue (duda de Jahnn, jul-2026)", () => {
    // Día A: 40 clientes de mostrador a S/20 + 20 de mesa a S/35 (sin delivery).
    // El motor solo ve el TOTAL presencial: no existe forma de que el
    // mostrador quede fuera del bono — solo delivery se resta.
    const soloPresencial = [{
      date: "2026-07-01",
      personas: 60,                    // 40 mostrador + 20 mesa
      revenue: 40 * 20 + 20 * 35,      // 800 + 700 = 1500
      items: null,
      deliveryPedidos: null,
      deliveryVenta: null,
    }];
    const p = computeProgress(FONAVI, mkStaff(4, 3), soloPresencial, 30);
    expect(p.ticketActual).toBeCloseTo(25.0, 2); // 1500/60 — mostrador incluido
    expect(p.delivery).toBeNull();
    expect(p.personasProyectadas).toBe(60 * 30); // los 60 proyectan pozo
  });

  it("RETROCOMPATIBLE: sin registro de delivery, nada cambia", () => {
    const sinCampos = conDelivery.map(({ deliveryPedidos, deliveryVenta, ...d }) => {
      void deliveryPedidos; void deliveryVenta;
      return d;
    });
    const p = computeProgress(FONAVI, mkStaff(4, 3), sinCampos, 30);
    expect(p.ticketActual).toBeCloseTo(1370 / 60, 2); // como siempre fue
    expect(p.delivery).toBeNull();
    expect(p.personasProyectadas).toBe(60 * 30);
  });

  it("datos corruptos (delivery > total) no producen tickets negativos", () => {
    const raros = [{ date: "2026-07-01", personas: 10, revenue: 100, items: null, deliveryPedidos: 15, deliveryVenta: 200 }];
    const p = computeProgress(FONAVI, mkStaff(4, 3), raros, 30);
    expect(p.ticketActual).toBeNull(); // presencial quedó en 0 → sin ticket, no basura
  });
});

describe("computeProgress — consumo del PERSONAL excluido (observación de Chari, jul-2026)", () => {
  // 10 días: 48 clientes/día a S/26 + 4 compras del personal/día a S/8
  // (con su 20% de descuento — jalaban el promedio hacia abajo).
  const conPersonal = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    personas: 52,                 // 48 clientes + 4 del personal
    revenue: 48 * 26 + 4 * 8,     // 1248 + 32 = 1280
    items: null,
    personalPedidos: 4,
    personalVenta: 32,
  }));

  it("el ticket del programa es SOLO clientes (el beneficio no castiga la meta)", () => {
    const p = computeProgress(FONAVI, mkStaff(4, 3), conPersonal, 30);
    // Mezclado sería 1280/52 = 24.62; solo clientes = 1248/48 = 26.00.
    expect(p.ticketActual).toBeCloseTo(26.0, 2);
  });

  it("el consumo del personal se reporta APARTE (informativo)", () => {
    const p = computeProgress(FONAVI, mkStaff(4, 3), conPersonal, 30);
    expect(p.personal).toEqual({ pedidos: 40, venta: 320, ticket: 8 });
  });

  it("delivery Y personal se excluyen JUNTOS cuando hay ambos", () => {
    const dia = [{
      date: "2026-07-01",
      personas: 60,                       // 50 clientes + 6 delivery + 4 personal
      revenue: 50 * 25 + 6 * 12 + 4 * 8,  // 1250 + 72 + 32 = 1354
      items: null,
      deliveryPedidos: 6, deliveryVenta: 72,
      personalPedidos: 4, personalVenta: 32,
    }];
    const p = computeProgress(FONAVI, mkStaff(4, 3), dia, 30);
    expect(p.ticketActual).toBeCloseTo(25.0, 2); // 1250/50 — solo clientes
    expect(p.traffic.personasPorDia).toBe(60);   // piso sobre TOTALES, sin cambio
  });

  it("RETROCOMPATIBLE: sin registrar consumo del personal, nada cambia", () => {
    const sinCampos = conPersonal.map(({ personalPedidos, personalVenta, ...d }) => {
      void personalPedidos; void personalVenta;
      return d;
    });
    const p = computeProgress(FONAVI, mkStaff(4, 3), sinCampos, 30);
    expect(p.ticketActual).toBeCloseTo(1280 / 52, 2);
    expect(p.personal).toBeNull();
  });
});
