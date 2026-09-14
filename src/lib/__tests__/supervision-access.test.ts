import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/session-access", () => ({ getSessionRole: async () => null }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => () => [] }));
import { permiteSupervision } from "../supervision-access";

const juani = { kind: "highlight", userId: 7, nombre: "Juani" } as const;
const adminFonavi = { kind: "admin", sede: 2, nombre: "Chari" } as const;
const jahnn = { kind: "full", quien: "jahnn" } as const;

describe("permisos de supervisión", () => {
  it("Juani supervisa y ve las dos sedes, pero no corrige", () => {
    expect(permiteSupervision(juani, 2, "supervisar")).toBe(true);
    expect(permiteSupervision(juani, 3, "ver")).toBe(true);
    expect(permiteSupervision(juani, 2, "corregir")).toBe(false);
  });

  it("el admin corrige y ve SU sede, no supervisa ni ve la otra", () => {
    expect(permiteSupervision(adminFonavi, 2, "corregir")).toBe(true);
    expect(permiteSupervision(adminFonavi, 2, "ver")).toBe(true);
    expect(permiteSupervision(adminFonavi, 2, "supervisar")).toBe(false);
    expect(permiteSupervision(adminFonavi, 3, "ver")).toBe(false);
  });

  it("dirección puede todo; sin sesión, nada", () => {
    expect(permiteSupervision(jahnn, 3, "supervisar")).toBe(true);
    expect(permiteSupervision(null, 2, "ver")).toBe(false);
    expect(permiteSupervision({ kind: "verif", sede: 2 }, 2, "ver")).toBe(false);
  });
});
