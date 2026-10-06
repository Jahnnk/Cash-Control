import { afterEach, describe, expect, it, vi } from "vitest";

async function cargar(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("./control-caja");
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("conexión con Control de Caja", () => {
  it("sin configurar no llama a nadie", async () => {
    const m = await cargar({ CAJA_SUPABASE_URL: "", CAJA_SUPABASE_ANON_KEY: "", CAJA_SYNC_TOKEN: "" });
    expect(m.controlCajaConfigurado()).toBe(false);
    await expect(m.enviarTopes("Fonavi", "2026-10", [])).rejects.toThrow(/no está configurada/);
  });

  it("manda los topes con la clave en el cuerpo (nunca en la URL)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => 3 });
    vi.stubGlobal("fetch", fetchMock);
    const m = await cargar({ CAJA_SUPABASE_URL: "https://x.supabase.co", CAJA_SUPABASE_ANON_KEY: "anon", CAJA_SYNC_TOKEN: "t".repeat(64) });
    const n = await m.enviarTopes("Fonavi", "2026-10", [{ categoria: "INSUMOS", tope: 2000, total: 3750 }]);
    expect(n).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/sincronizar_presupuesto_caja");
    expect(url).not.toContain("t".repeat(10));
    expect(JSON.parse(init.body)).toEqual({ p_sede: "Fonavi", p_mes: "2026-10", p_topes: [{ categoria: "INSUMOS", tope: 2000, total: 3750 }], p_token: "t".repeat(64) });
  });

  it("explica el error que devuelve la base", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => JSON.stringify({ message: "Clave de sincronización inválida." }) }));
    const m = await cargar({ CAJA_SUPABASE_URL: "https://x.supabase.co", CAJA_SUPABASE_ANON_KEY: "anon", CAJA_SYNC_TOKEN: "t".repeat(64) });
    await expect(m.gastoCajaMensual("2026-07", "2026-10")).rejects.toThrow("Clave de sincronización inválida.");
  });
});
