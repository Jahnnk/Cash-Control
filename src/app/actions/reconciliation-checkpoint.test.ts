/**
 * Tests del marcador "Cuadrado hasta [fecha]".
 *  - setReconciledThrough: valida formato y fecha no futura; permite null.
 *  - getReconciledThrough: devuelve la fecha del negocio activo.
 *  - Contratos de SQL: recalcBankBalance retrocede el marcador si se toca un
 *    día ya cuadrado; getUnifiedBankBalance solo busca diferencias después
 *    del marcador. (Guardas contra regresión sin tocar Neon.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fake = vi.hoisted(() => {
  const state = { executed: [] as string[], responses: [] as unknown[][] };
  function sqlText(q: unknown): string {
    const o = q as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(o?.queryChunks)) return o.queryChunks.map(sqlText).join("");
    if (Array.isArray(o?.value)) return (o.value as string[]).join("");
    if (o && typeof o === "object" && "value" in o) return String((o as { value: unknown }).value);
    return "";
  }
  return { state, sqlText };
});

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(async (q: unknown) => {
      fake.state.executed.push(fake.sqlText(q));
      return { rows: fake.state.responses.shift() ?? [] };
    }),
  },
}));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 1) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getReconciledThrough, setReconciledThrough } from "./reconciliation-checkpoint";

beforeEach(() => {
  fake.state.executed = [];
  fake.state.responses = [];
});

const TODAY = new Date().toISOString().slice(0, 10);

describe("setReconciledThrough", () => {
  it("guarda una fecha válida (no futura)", async () => {
    const r = await setReconciledThrough("2026-06-15");
    expect(r.ok).toBe(true);
    expect(fake.state.executed.some((q) => q.includes("UPDATE businesses"))).toBe(true);
  });

  it("rechaza fecha futura", async () => {
    const FUTURE = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const r = await setReconciledThrough(FUTURE);
    expect(r.ok).toBe(false);
    expect(fake.state.executed.some((q) => q.includes("UPDATE businesses"))).toBe(false);
  });

  it("rechaza formato inválido", async () => {
    const r = await setReconciledThrough("15/06/2026");
    expect(r.ok).toBe(false);
  });

  it("permite limpiar el marcador con null", async () => {
    const r = await setReconciledThrough(null);
    expect(r.ok).toBe(true);
    expect(fake.state.executed.some((q) => q.includes("UPDATE businesses"))).toBe(true);
  });

  it("acepta hoy (no futura)", async () => {
    const r = await setReconciledThrough(TODAY);
    expect(r.ok).toBe(true);
  });
});

describe("getReconciledThrough", () => {
  it("devuelve la fecha guardada", async () => {
    fake.state.responses = [[{ d: "2026-06-15" }]];
    expect(await getReconciledThrough()).toBe("2026-06-15");
  });
  it("devuelve null si no hay marcador", async () => {
    fake.state.responses = [[{ d: null }]];
    expect(await getReconciledThrough()).toBeNull();
  });
});

describe("contratos de SQL (regresión)", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("recalcBankBalance retrocede el marcador al tocar un día ya cuadrado", () => {
    const src = read("src/app/actions/daily-records.ts");
    expect(src).toContain("UPDATE businesses");
    expect(src).toContain("reconciled_through_date");
    expect(src).toContain("reconciled_through_date >=");
  });

  it("getUnifiedBankBalance solo busca diferencias después del marcador", () => {
    const src = read("src/app/actions/bank-balance.ts");
    expect(src).toContain("reconciled_through_date");
    expect(src).toContain("c.date > ${reconciledThrough}");
  });
});
