/**
 * Guardia de la página pública del vale (Primer cliente, 22-nov-2026).
 *
 * `/vale/[codigo]` se abre SIN login: el invitado no tiene cuenta. Eso solo
 * es seguro mientras la página sea de LECTURA. Estas pruebas clavan las dos
 * mitades: que el middleware abra solo ese prefijo, y que la página nunca
 * importe las acciones que canjean (el canje exige sesión del encargado).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");
const MIDDLEWARE = leer("src/middleware.ts");
const PAGINA = leer("src/app/vale/[codigo]/page.tsx");

/** Réplica de la regla del middleware, para probar el comportamiento. */
const PUBLIC_PAGE_PREFIXES = ["/vale/"];
const esPublica = (p: string) => PUBLIC_PAGE_PREFIXES.some((x) => p.startsWith(x));

describe("el middleware abre solo /vale/", () => {
  it("la excepción existe en el código y va ANTES de pedir sesión", () => {
    expect(MIDDLEWARE).toContain('const PUBLIC_PAGE_PREFIXES = ["/vale/"]');
    const excepcion = MIDDLEWARE.indexOf("PUBLIC_PAGE_PREFIXES.some");
    const pideSesion = MIDDLEWARE.indexOf("AUTH_PUBLIC_PATHS.includes(pathname)");
    expect(excepcion).toBeGreaterThan(0);
    expect(excepcion).toBeLessThan(pideSesion);
  });

  it("deja ver el vale", () => {
    expect(esPublica("/vale/7K3Q-M2PA")).toBe(true);
  });

  it("no abre rutas parecidas ni las de la app", () => {
    for (const ruta of ["/vale", "/vales", "/fonavi/vales", "/valet/x", "/fonavi/panel", "/grupo/dashboard"]) {
      expect(esPublica(ruta), ruta).toBe(false);
    }
  });
});

describe("la página pública es de solo lectura", () => {
  it("no importa las acciones de canje, anulación ni emisión", () => {
    expect(PAGINA).not.toContain("@/app/actions/vales");
    expect(PAGINA).not.toContain('"use client"');
    expect(PAGINA).not.toMatch(/canjearVale|anularVale|emitirVale/);
  });

  it("no se indexa en buscadores", () => {
    expect(PAGINA).toContain("index: false");
  });
});
