/**
 * Byte es lo que cuenta para los KPIs y el bono, y el ticket promedio sale de lo que anota el administrador: si algún día
 * no coincide con Byte, el mes no se cierra (19-oct-2026). La dirección puede cerrar igual, con constancia en el acta.
 */
import { describe, it, expect } from "vitest";
import { computeLiquidation, type IncentiveConfigT, type DailyEntry, type StaffMember } from "../engine";
import type { EntradaVentasVsByte } from "../../kpis/ventas-al-dia";

const NIVELES = [{ nombre: "Nivel 1", delta: 1.5, bono_mt: 24, bono_tc: 48, bono_admin: 89, premio_mv: 68 }];
const CONFIG: IncentiveConfigT = { ticketBase: 22.11, marginPct: 0.533, trafficFloor: null, poolPct: 0.4, levels: NIVELES, requiereEquilibrio: false };
const STAFF: StaffMember[] = [{ name: "Ana", jornada: "medio_turno", area: "salon", active: true, horasSemanales: 23.5 }];
const dias: DailyEntry[] = Array.from({ length: 31 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, personas: 40, revenue: 960, items: 100 }) as DailyEntry);

const limpio: EntradaVentasVsByte = { noCoinciden: [], sinAnotar: [], sinByte: [], byteHasta: "2026-10-31" };
const liquidar = (v: EntradaVentasVsByte | null | undefined, acepta = false) =>
  computeLiquidation({ month: "2026-10", todayISO: "2026-11-02", config: CONFIG, staff: STAFF, dailies: dias, unverifiedDays: 0, observedDays: [], mejorVendedor: null, ventasVsByte: v, aceptaDiferenciasByte: acepta });

describe("cierre del bono: lo anotado contra Byte", () => {
  it("todo coincide: se puede cerrar", () => {
    const r = liquidar(limpio);
    expect(r.blockers).toEqual([]);
    expect(r.bloqueoVentasByte).toBe(false);
  });

  it("un día que no coincide bloquea, con lo que anotó y lo que dice Byte", () => {
    const r = liquidar({ ...limpio, noCoinciden: [{ fecha: "2026-10-17", anotado: 1210, byte: 667 }] });
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toContain("17/10 (anotó S/1210.00, Byte S/667.00)");
    expect(r.blockers[0]).toContain("Byte es lo que cuenta");
    expect(r.bloqueoVentasByte).toBe(true);
  });

  it("días con venta sin anotar y días que el reporte de Byte no cubre también bloquean", () => {
    const r = liquidar({ noCoinciden: [], sinAnotar: ["2026-10-18"], sinByte: ["2026-10-31"], byteHasta: "2026-10-30" });
    expect(r.blockers).toHaveLength(2);
    expect(r.blockers.join(" ")).toContain("no anotó días con venta: 18/10");
    expect(r.blockers.join(" ")).toContain("no cubre 31/10");
  });

  it("la dirección puede cerrar igual: el bloqueo pasa a constancia en el acta", () => {
    const r = liquidar({ ...limpio, noCoinciden: [{ fecha: "2026-10-17", anotado: 1210, byte: 667 }] }, true);
    expect(r.blockers).toEqual([]);
    expect(r.warnings.some((w) => w.startsWith("Cierre con diferencias contra Byte aceptadas por la dirección"))).toBe(true);
    expect(r.bloqueoVentasByte).toBe(true);
  });

  it("sin la entrada (actas viejas, otras sedes) no cambia nada", () => {
    for (const v of [undefined, null]) {
      const r = liquidar(v);
      expect(r.blockers).toEqual([]);
      expect(r.bloqueoVentasByte).toBe(false);
    }
  });
});
