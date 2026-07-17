/**
 * Candados del camino CENTRAL desde Grupo (jul-2026):
 *
 *  1. Import de Excel con sede explícita (sedeCentral): SOLO dirección
 *     y SOLO Fonavi/Centro. Jamás se adivina la sede de la cookie —
 *     en /grupo la cookie apunta a la última sede visitada y habría
 *     importado los datos de Kelly en la sede equivocada.
 *  2. Reporte ejecutivo del grupo: permiso por SESIÓN (dirección), ya
 *     no por "estar parado en Atelier" (la regla vieja rebotaba a la
 *     dirección cuando generaba desde /grupo).
 *
 * BD y sesión falsas — no toca Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({
  full: true,
  activeThrows: false,
}));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(async () => ({
      rows: [
        { id: 1, code: "atelier", name: "Atelier" },
        { id: 2, code: "fonavi", name: "Fonavi" },
        { id: 3, code: "centro", name: "Centro" },
      ],
    })),
  },
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => async () => [] }));
vi.mock("@/lib/session-access", () => ({
  requireFullSession: vi.fn(async () => fake.full),
  getSessionRole: vi.fn(async () => (fake.full ? { kind: "full" } : { kind: "admin", sede: 2 })),
}));
vi.mock("@/lib/active-business", () => ({
  activeBusinessId: vi.fn(async (code?: string) => {
    if (fake.activeThrows && code === undefined) throw new Error("Sin negocio activo");
    return code === "fonavi" ? 2 : code === "centro" ? 3 : 2;
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// El recolector pesado no se ejecuta en estos tests (los candados cortan
// antes), pero el módulo lo importa — atajarlo evita cargar medio app.
vi.mock("@/app/actions/command-center", () => ({
  salesInRange: vi.fn(async () => 0),
  opExpensesInRange: vi.fn(async () => 0),
}));

import { previewExcelImport, getMonthsLoadStatus } from "./excel-import";
import { getReportFacts } from "./report-facts";

const ACCESS_MSG = "El import central es solo para la dirección (Fonavi/Centro).";

beforeEach(() => {
  fake.full = true;
  fake.activeThrows = false;
});

describe("import central — sedeCentral", () => {
  it("un ADMIN no puede usar el camino central (aunque sea de esa sede)", async () => {
    fake.full = false;
    const r = await previewExcelImport("", "kelly.xlsx", null, null, "fonavi");
    expect(r).toEqual({ error: ACCESS_MSG });
    expect(await getMonthsLoadStatus(["2026-06"], "fonavi")).toEqual([]);
  });

  it("Atelier NO es sede del import central (se importa desde Atelier)", async () => {
    const r = await previewExcelImport("", "kelly.xlsx", null, null, "atelier");
    expect(r).toEqual({ error: ACCESS_MSG });
  });

  it("sede inventada → rechazada", async () => {
    const r = await previewExcelImport("", "kelly.xlsx", null, null, "grupo");
    expect(r).toEqual({ error: ACCESS_MSG });
  });

  it("dirección + Fonavi: pasa el candado (el error siguiente ya es del archivo, no de acceso)", async () => {
    const r = await previewExcelImport("", "kelly.xlsx", null, null, "fonavi");
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).not.toBe(ACCESS_MSG);
  });

  it("SIN sedeCentral el flujo por sede sigue igual (admins incluidos)", async () => {
    fake.full = false;
    const r = await previewExcelImport("", "kelly.xlsx", null, null);
    expect((r as { error: string }).error).not.toBe(ACCESS_MSG);
  });
});

describe("reporte ejecutivo — permiso por sesión, no por ubicación", () => {
  it("grupo SIN sesión completa → rechazado", async () => {
    fake.full = false;
    await expect(getReportFacts({ scope: "group", month: "2026-06" }))
      .rejects.toThrow("El reporte del grupo es solo para la dirección");
  });

  it("dirección genera el reporte del grupo AUNQUE no haya sede activa (desde /grupo)", async () => {
    fake.activeThrows = true; // en /grupo puede no existir cookie de sede
    const facts = await getReportFacts({ scope: "group", month: "2026-06" });
    expect(facts.scope.kind).toBe("group");
    if (facts.scope.kind === "group") expect(facts.scope.units).toHaveLength(3);
  });

  it("un admin solo genera el reporte de SU unidad", async () => {
    fake.full = false; // admin de Fonavi (activeId 2)
    await expect(getReportFacts({ scope: "unit", unitId: 3, month: "2026-06" }))
      .rejects.toThrow("Solo puedes generar reportes de tu unidad activa");
  });
});
