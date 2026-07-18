/**
 * Panel central de Bonos e Incentivos. Lo que protege:
 *  1. Solo dirección (los admins ya tienen su panel por sede).
 *  2. MISMO cerebro que el Panel de Sede: el ticket sale de
 *     computeProgress (presencial, sin delivery) — esta pantalla jamás
 *     puede contradecir lo que ve un admin.
 * Driver de BD falso — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => {
  const state = { full: true };
  const respond = (text: string): unknown[] => {
    if (text.includes("FROM incentive_config")) {
      return [{
        base: 25.44, margin: 0.533, traffic_floor: 49, pool: 0.4,
        levels: [{ nombre: "Nivel 1", delta: 1.5, bono_tc: 48, bono_mt: 24, bono_admin: 89, premio_mv: 68 }],
      }];
    }
    if (text.includes("FROM staff")) {
      return [{ name: "Admin", jornada: "administrador", area: "administracion" }];
    }
    if (text.includes("FROM upselling_daily") && text.includes("deliveryPedidos")) {
      // 60 personas (10 delivery) · S/1370 (S/120 delivery) → presencial 1250/50 = 25.00
      return [{ date: "2026-07-01", personas: 60, revenue: 1370, items: null, deliveryPedidos: 10, deliveryVenta: 120 }];
    }
    if (text.includes("MAX(date)")) return [{ d: "2026-07-01" }];
    if (text.includes("FROM worker_period_sales")) return [];
    if (text.includes("FROM incentive_liquidations")) return [];
    return [];
  };
  const makeTag = () => (strings: TemplateStringsArray, ...values: unknown[]) => {
    void values;
    const text = strings.join(" $ ");
    return { then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(respond(text)).then(ok, err) };
  };
  return { state, makeTag };
});

vi.mock("@neondatabase/serverless", () => ({ neon: () => fake.makeTag() }));
vi.mock("@/lib/session-access", () => ({
  requireFullSession: vi.fn(async () => fake.state.full),
}));

import { getGroupIncentives } from "./group-incentives";

beforeEach(() => { fake.state.full = true; });

describe("getGroupIncentives", () => {
  it("solo dirección (los admins ven su sede en SU panel)", async () => {
    fake.state.full = false;
    const r = await getGroupIncentives("2026-07");
    expect(r.ok).toBe(false);
  });

  it("usa el MISMO cerebro que el Panel de Sede: ticket presencial (sin delivery)", async () => {
    const r = await getGroupIncentives("2026-07");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sedes).toHaveLength(2);
    const fonavi = r.data.sedes[0];
    expect(fonavi.sede).toBe("Fonavi");
    // 1250/50 presencial — NO 1370/60 (22.83) que incluiría delivery.
    expect(fonavi.progress?.ticketActual).toBeCloseTo(25.0, 2);
    expect(fonavi.ticketBase).toBe(25.44);
    expect(fonavi.progress?.delivery).toEqual({ pedidos: 10, venta: 120, ticket: 12 });
    expect(fonavi.ultimoRegistro).toBe("2026-07-01");
  });

  it("mes inválido → error claro", async () => {
    const r = await getGroupIncentives("julio");
    expect(r.ok).toBe(false);
  });
});
