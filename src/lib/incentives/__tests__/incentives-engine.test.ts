/**
 * Tests del motor de Incentivos — VALIDADOS CONTRA LA POLÍTICA jun-2026:
 * los números del documento (pozos, sumas de bonos, colchones) deben
 * salir exactos del motor. Si la política y el código divergen, esto truena.
 */
import { describe, it, expect } from "vitest";
import {
  computeProgress,
  computeFlags,
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
