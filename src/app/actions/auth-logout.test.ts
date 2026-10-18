import { describe, it, expect, vi } from "vitest";

const borradas: string[] = [];
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: (n: string) => borradas.push(n), set: vi.fn(), get: vi.fn() }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => () => Promise.resolve([]) }));

import { logout } from "./auth";

describe("cerrar sesión", () => {
  it("borra la sesión de este dispositivo (sesión, alcance y rol) y vuelve a la contraseña", async () => {
    await expect(logout()).rejects.toThrow("REDIRECT:/login");
    expect(borradas).toEqual(expect.arrayContaining(["yayis_auth", "yayis_scope", "yayis_role"]));
  });
});
