/**
 * Guardia de las páginas públicas del vale (Primer cliente, 22-nov-2026).
 *
 * `/vale/[codigo]` y `/vale` se abren SIN login: el invitado y el cajero no
 * tienen cuenta. Eso solo es seguro si (1) el middleware abre ÚNICAMENTE eso,
 * (2) las páginas no importan las acciones de dirección (emitir, anular,
 * canje con sesión) y (3) lo único que se puede hacer sin sesión es el canje
 * en caja, que exige el PIN con bloqueo por intentos.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");
const MIDDLEWARE = leer("src/middleware.ts");
const PAGINA = leer("src/app/vale/[codigo]/page.tsx");
const PAGINA_CAJA = leer("src/app/vale/page.tsx");
const COMPONENTE_CAJA = leer("src/components/vales/canje-caja.tsx");
const ACCION_CAJA = leer("src/app/actions/vales-caja.ts");

/** Réplica de la regla del middleware, para probar el comportamiento. */
const PUBLIC_PAGE_PREFIXES = ["/vale/"];
const esPublica = (p: string) => p === "/vale" || PUBLIC_PAGE_PREFIXES.some((x) => p.startsWith(x));

describe("el middleware abre solo /vale/", () => {
  it("la excepción existe en el código y va ANTES de pedir sesión", () => {
    expect(MIDDLEWARE).toContain('const PUBLIC_PAGE_PREFIXES = ["/vale/"]');
    const excepcion = MIDDLEWARE.indexOf("PUBLIC_PAGE_PREFIXES.some");
    const pideSesion = MIDDLEWARE.indexOf("AUTH_PUBLIC_PATHS.includes(pathname)");
    expect(excepcion).toBeGreaterThan(0);
    expect(excepcion).toBeLessThan(pideSesion);
  });

  it("deja ver el vale y el canje suelto en caja", () => {
    expect(esPublica("/vale/7K3Q-M2PA")).toBe(true);
    expect(esPublica("/vale")).toBe(true);
    expect(MIDDLEWARE).toContain('pathname === "/vale"');
  });

  it("no abre rutas parecidas ni las de la app", () => {
    for (const ruta of ["/vales", "/fonavi/vales", "/valet/x", "/fonavi/panel", "/grupo/dashboard"]) {
      expect(esPublica(ruta), ruta).toBe(false);
    }
  });
});

describe("las páginas públicas no pueden emitir, anular ni canjear con sesión", () => {
  it("no importan las acciones de dirección", () => {
    for (const [nombre, codigo] of [["página del vale", PAGINA], ["página de caja", PAGINA_CAJA], ["componente de caja", COMPONENTE_CAJA]]) {
      expect(codigo, nombre).not.toContain("@/app/actions/vales\"");
      expect(codigo, nombre).not.toMatch(/emitirVale|anularVale|generarPinCaja|canjearVale\b/);
    }
  });

  it("la página del vale sigue siendo un componente de servidor y no se indexa", () => {
    expect(PAGINA).not.toContain('"use client"');
    expect(PAGINA).toContain("index: false");
    expect(PAGINA_CAJA).toContain("index: false");
  });
});

describe("lo único que se hace sin sesión es el canje en caja, con PIN", () => {
  it("vales-caja.ts exporta UNA sola acción", () => {
    const exportadas = ACCION_CAJA.match(/export async function \w+/g) ?? [];
    expect(exportadas).toEqual(["export async function canjearEnCaja"]);
  });

  it("verifica el PIN con hash y cuenta el intento ANTES de comparar", () => {
    expect(ACCION_CAJA).toContain("verifyPassword(pin");
    const cuenta = ACCION_CAJA.indexOf("SET intentos = CASE");
    const compara = ACCION_CAJA.indexOf("verifyPassword(pin");
    expect(cuenta).toBeGreaterThan(0);
    expect(cuenta).toBeLessThan(compara);
    // La caja bloqueada no deja pasar ninguna fila del UPDATE.
    expect(ACCION_CAJA).toContain("bloqueado_hasta IS NULL OR bloqueado_hasta <= now()");
  });

  it("canjea con el mismo candado atómico que el encargado", () => {
    expect(ACCION_CAJA).toContain("ejecutarCanje(");
    expect(leer("src/app/actions/vales.ts")).toContain("ejecutarCanje(");
  });

  it("solo Jahnn genera el PIN y nunca se devuelve el guardado", () => {
    const acciones = leer("src/app/actions/vales.ts");
    expect(acciones).toMatch(/generarPinCaja[\s\S]*?esJahnn\(role\)/);
    expect(acciones).not.toMatch(/SELECT[^`]*pin_hash/);
  });
});
