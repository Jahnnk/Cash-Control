/**
 * Capital inyectado: la cuenta que responde "¿cuánto he metido yo?".
 * Protege: solo dirección; totalTuyo = aportes + prestado + financiamiento
 * (la venta de activos NO es plata del socio); socio = prestado − devuelto,
 * misma definición que la página Préstamos Socio.
 * BD falsa — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({ full: true }));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(async (q: { queryChunks?: unknown[] } & object) => {
      const text = JSON.stringify(q);
      if (text.includes("non_operative_category")) {
        return { rows: [
          { date: "2026-04-30", amount: 3517.7, note: "Aporte de Jahnn (condonado)", cat: "Aportes de socios" },
          { date: "2026-05-21", amount: 1000, note: "Préstamo RestaPro", cat: "Préstamos / financiamiento recibido" },
          { date: "2026-06-09", amount: 6340, note: "Pago en efectivo congeladora", cat: "Venta de activos" },
          { date: "2026-06-09", amount: 1660, note: "1er pago congeladora", cat: "Venta de activos" },
        ] };
      }
      if (text.includes("is_special_loan") && text.includes("bank_income_items")) {
        return { rows: [
          { date: "2026-07-08", amount: 4000, note: "Préstamo para pagos" },
          { date: "2026-06-04", amount: 1812, note: "Compras Ethel" },
        ] };
      }
      if (text.includes("is_special_loan") && text.includes("expenses")) {
        return { rows: [{ t: 1000 }] };
      }
      return { rows: [] };
    }),
  },
}));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 1) }));
vi.mock("@/lib/session-access", () => ({
  requireFullSession: vi.fn(async () => fake.full),
}));

import { getCapitalInjections } from "./capital";

beforeEach(() => { fake.full = true; });

describe("getCapitalInjections", () => {
  it("solo dirección (el capital del socio no es asunto de los admins)", async () => {
    fake.full = false;
    expect((await getCapitalInjections()).ok).toBe(false);
  });

  it("suma cada canasta con los números reales de Jahnn", async () => {
    const r = await getCapitalInjections();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.aportes.total).toBe(3517.7);
    expect(r.data.financiamiento.total).toBe(1000);
    expect(r.data.ventaActivos.total).toBe(8000);       // congeladora: 6340 + 1660
    expect(r.data.socio.prestado).toBe(5812);           // 4000 + 1812
    expect(r.data.socio.devuelto).toBe(1000);
    expect(r.data.socio.pendiente).toBe(4812);
  });

  it("totalTuyo = aportes + prestado + financiamiento (la congeladora NO es plata del socio)", async () => {
    const r = await getCapitalInjections();
    if (!r.ok) throw new Error("debió resolver");
    expect(r.data.totalTuyo).toBe(3517.7 + 5812 + 1000); // 10329.7 — sin los 8000 de activos
  });
});
