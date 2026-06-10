import { describe, it, expect } from "vitest";
import { createSingleFlight } from "./single-flight";

describe("createSingleFlight (anti doble-submit)", () => {
  it("doble clic simultáneo: la segunda llamada se descarta (no corre dos veces)", async () => {
    const run = createSingleFlight();
    let executions = 0;
    const slowSave = async () => {
      executions++;
      await new Promise((r) => setTimeout(r, 20));
      return "ok";
    };

    // Dos clics casi simultáneos (red lenta simulada con el setTimeout)
    const [first, second] = await Promise.all([run(slowSave), run(slowSave)]);

    expect(executions).toBe(1); // el guardado corrió UNA sola vez
    expect(first).toBe("ok");
    expect(second).toBeUndefined(); // el segundo clic fue descartado
  });

  it("tras terminar la primera, se puede volver a guardar normalmente", async () => {
    const run = createSingleFlight();
    let executions = 0;
    const save = async () => { executions++; };

    await run(save);
    await run(save);
    expect(executions).toBe(2);
  });

  it("si el guardado falla, el guard se libera (permite reintentar)", async () => {
    const run = createSingleFlight();
    const failing = async () => { throw new Error("falló"); };

    await expect(run(failing)).rejects.toThrow("falló");
    // Reintento posible: el guard no quedó trabado
    let ran = false;
    await run(async () => { ran = true; });
    expect(ran).toBe(true);
  });
});
