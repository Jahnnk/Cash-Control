/**
 * Tests de los permisos sobre las fotos del Highlight.
 *
 * Acá se clava la regla que evita el peor escenario del sistema: que un
 * administrador pueda FABRICAR la indicación que supuestamente recibió
 * de dirección. Si eso fuera posible, el control no valdría nada.
 *
 * Driver de BD y sesión falsos — no tocan Neon.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({
  state: { role: null as unknown, rows: [] as Record<string, unknown>[] },
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => () => ({
    then: (onRes: (v: unknown) => unknown, onRej?: (e: unknown) => unknown) =>
      Promise.resolve(fake.state.rows).then(onRes, onRej),
  }),
}));

vi.mock("@/lib/session-access", () => ({
  getSessionRole: async () => fake.state.role,
}));

import { puedeSobreHighlight, highlightBusinessId } from "./highlight-access";

const ATELIER = 1, FONAVI = 2, CENTRO = 3;

beforeEach(() => {
  fake.state.role = null;
  fake.state.rows = [];
});

describe("puedeSobreHighlight — dirección", () => {
  beforeEach(() => { fake.state.role = { kind: "full" }; });

  it("puede todo, en cualquier sede", async () => {
    for (const sede of [ATELIER, FONAVI, CENTRO]) {
      expect(await puedeSobreHighlight(sede, "ver")).toBe(true);
      expect(await puedeSobreHighlight(sede, "indicacion")).toBe(true);
      expect(await puedeSobreHighlight(sede, "evidencia")).toBe(true);
    }
  });
});

describe("puedeSobreHighlight — administrador de sede", () => {
  beforeEach(() => { fake.state.role = { kind: "admin", sede: FONAVI }; });

  it("ve y sube evidencia de SU sede", async () => {
    expect(await puedeSobreHighlight(FONAVI, "ver")).toBe(true);
    expect(await puedeSobreHighlight(FONAVI, "evidencia")).toBe(true);
  });

  it("NO puede subir la indicación ni en su propia sede", async () => {
    // La regla que sostiene todo el control: si pudiera, se fabricaría
    // la instrucción que dice haber recibido.
    expect(await puedeSobreHighlight(FONAVI, "indicacion")).toBe(false);
  });

  it("no toca NADA de otra sede", async () => {
    for (const accion of ["ver", "indicacion", "evidencia"] as const) {
      expect(await puedeSobreHighlight(CENTRO, accion)).toBe(false);
      expect(await puedeSobreHighlight(ATELIER, accion)).toBe(false);
    }
  });
});

describe("puedeSobreHighlight — verificador y sin sesión", () => {
  it("el verificador de conteo no participa del Highlight", async () => {
    fake.state.role = { kind: "verif", sede: CENTRO };
    for (const accion of ["ver", "indicacion", "evidencia"] as const) {
      expect(await puedeSobreHighlight(CENTRO, accion)).toBe(false);
    }
  });

  it("sin sesión no puede nada (fail-closed)", async () => {
    fake.state.role = null;
    expect(await puedeSobreHighlight(FONAVI, "ver")).toBe(false);
    expect(await puedeSobreHighlight(FONAVI, "evidencia")).toBe(false);
  });
});

describe("highlightBusinessId", () => {
  it("rechaza un id que no es uuid sin consultar la base", async () => {
    fake.state.rows = [{ business_id: 99 }];
    expect(await highlightBusinessId("no-es-uuid")).toBeNull();
    expect(await highlightBusinessId("")).toBeNull();
    // Intento de inyección: tampoco pasa el filtro de formato.
    expect(await highlightBusinessId("' OR 1=1 --")).toBeNull();
  });

  it("devuelve la sede dueña del Highlight", async () => {
    fake.state.rows = [{ business_id: CENTRO }];
    expect(await highlightBusinessId("11111111-2222-3333-4444-555555555555")).toBe(CENTRO);
  });

  it("null si el Highlight no existe", async () => {
    fake.state.rows = [];
    expect(await highlightBusinessId("11111111-2222-3333-4444-555555555555")).toBeNull();
  });
});
