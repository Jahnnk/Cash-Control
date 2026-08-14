/**
 * Guardia del incidente del 13-ago-2026.
 *
 * El middleware encierra a cada usuario con alcance en SU pantalla
 * (`/fonavi/panel`, `/grupo/highlight`…). Pero las fotos se suben a
 * `/api/highlight-photos` y se ven vía `/api/attachments/[id]`, que
 * quedan FUERA de ese prefijo: el middleware los redirigía a su panel,
 * el navegador recibía HTML en vez de JSON y el usuario veía
 * "revisa tu conexión".
 *
 * Resultado: NINGÚN administrador pudo subir jamás una foto. Cero fotos
 * en todo el sistema, con dos personas reportándolo.
 *
 * Esta prueba clava la lógica de la lista blanca. No sustituye a probar
 * en el navegador, pero evita que alguien la borre sin darse cuenta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

/** Réplica de la función del middleware, para probar el comportamiento. */
const API_CON_ALCANCE = ["/api/highlight-photos", "/api/attachments"];
const esApiConAlcance = (p: string) =>
  API_CON_ALCANCE.some((x) => p === x || p.startsWith(x + "/"));

describe("el middleware deja pasar las APIs de fotos", () => {
  it("la lista blanca existe en el código (no se borró)", () => {
    expect(SRC).toContain("API_CON_ALCANCE");
    expect(SRC).toContain("/api/highlight-photos");
    expect(SRC).toContain("/api/attachments");
    // Se usa en las DOS ramas: sede (admin/verif) y dirección del Highlight.
    expect(SRC.match(/esApiConAlcance\(pathname\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("permite subir la foto y verla", () => {
    expect(esApiConAlcance("/api/highlight-photos")).toBe(true);
    expect(esApiConAlcance("/api/attachments/2f1c8a90-1111-2222-3333-444455556666")).toBe(true);
  });

  it("NO abre nada más de la API", () => {
    for (const ruta of ["/api/keep-alive", "/api/otra-cosa", "/api/", "/api"]) {
      expect(esApiConAlcance(ruta), ruta).toBe(false);
    }
  });

  it("no se deja engañar por rutas que solo empiezan parecido", () => {
    // Un prefijo compartido no debe abrir una ruta distinta.
    expect(esApiConAlcance("/api/attachments-secretos")).toBe(false);
    expect(esApiConAlcance("/api/highlight-photos-admin")).toBe(false);
  });
});
