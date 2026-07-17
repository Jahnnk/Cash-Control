/**
 * Candados del camino CENTRAL desde Grupo (jul-2026):
 *
 *  1. Import de Excel con sede explícita (sedeCentral): SOLO dirección.
 *     Desde jul-2026 Kelly lleva las 3 sedes (Atelier incluida). Jamás
 *     se adivina la sede de la cookie — en /grupo apunta a la última
 *     sede visitada y habría importado en la sede equivocada.
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

const ACCESS_MSG = "El import central es solo para la dirección.";

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

  it("Atelier SÍ es sede del import central (Kelly lleva las 3 desde jul-2026)", async () => {
    const r = await previewExcelImport("", "kelly.xlsx", null, null, "atelier");
    expect(r).toHaveProperty("error");
    // Pasa el candado de acceso: el error que sigue es del archivo vacío.
    expect((r as { error: string }).error).not.toBe(ACCESS_MSG);
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

describe("import — registros especiales PROTEGIDOS del archivado", () => {
  // El archivado de manuales vive en SQL dentro de una transacción (no se
  // puede ejercitar sin un xlsx real), así que este test lee el CÓDIGO y
  // exige que las condiciones de protección existan en ambos UPDATE.
  // Si alguien las borra "limpiando", esto truena con nombre y apellido.
  it("los UPDATE de archivado excluyen clientes B2B, préstamos, compartidos y clasificaciones", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/app/actions/excel-import.ts", "utf8");
    // Ingresos: cliente B2B, préstamo socio, clasificación, transferencia, reembolso.
    const archIn = src.match(/UPDATE bank_income_items SET archived = true[\s\S]{0,400}/)?.[0] ?? "";
    for (const cond of ["client_id IS NULL", "is_special_loan = false", "non_operative_category IS NULL", "is_internal_transfer = false", "is_fonavi_reimbursement = false"]) {
      expect(archIn).toContain(cond);
    }
    // Egresos: compartidos, préstamo socio, transferencia, métodos espejo.
    const archEx = src.match(/UPDATE expenses SET archived = true[\s\S]{0,400}/)?.[0] ?? "";
    for (const cond of ["is_shared = false", "is_special_loan = false", "is_internal_transfer = false", "payment_method NOT IN ('socio', 'pendiente_atelier')"]) {
      expect(archEx).toContain(cond);
    }
  });
});
