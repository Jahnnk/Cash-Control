/**
 * La llave de SOLO LECTURA (Muse de Meta, 18-oct-2026). Puede VER el Dashboard de Grupo y Reportes; no puede
 * guardar, subir ni borrar nada. Estas pruebas clavan las tres capas para que nadie las afloje sin darse cuenta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { puedeLeerDireccion } from "../session-access";

const MW = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

describe("capa 1 · el control de entrada solo le abre Dashboard de Grupo y Reportes", () => {
  const rama = MW.slice(MW.indexOf('if (scopedScope === "lector")'), MW.indexOf('if (scopedScope === "highlight")'));
  it("la rama del lector existe y lista solo esas dos páginas", () => {
    expect(rama).toContain('"/grupo/dashboard"');
    expect(rama).toContain('"/grupo/reportes"');
    expect(rama.match(/"\/[a-z/-]+"/g)?.filter((x) => x !== '"/grupo/dashboard"' && x !== '"/grupo/reportes"')).toEqual([]);
  });
  it("no le abre ninguna API (fotos, adjuntos)", () => {
    expect(rama).not.toContain("esApiConAlcance");
  });
});

describe("capa 2 · quién puede leer cifras de dirección", () => {
  it("dirección y solo lectura sí; administradores de sede, verificadores y Highlight no", () => {
    expect(puedeLeerDireccion({ kind: "full", quien: "jahnn" })).toBe(true);
    expect(puedeLeerDireccion({ kind: "lector", userId: 1, nombre: "Muse" })).toBe(true);
    expect(puedeLeerDireccion({ kind: "admin", sede: 2 })).toBe(false);
    expect(puedeLeerDireccion({ kind: "verif", sede: 3 })).toBe(false);
    expect(puedeLeerDireccion({ kind: "highlight", userId: 2, nombre: "Juani" })).toBe(false);
    expect(puedeLeerDireccion(null)).toBe(false);
  });
});

describe("capa 3 · ninguna acción que ESCRIBE acepta la llave de solo lectura", () => {
  const dir = join(process.cwd(), "src/app/actions");
  const archivos = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  it("toda función que hace INSERT/UPDATE/DELETE no usa requireLectura ni puedeLeerDireccion", () => {
    const malas: string[] = [];
    for (const f of archivos) {
      const s = readFileSync(join(dir, f), "utf8");
      if (!s.slice(0, 200).includes('"use server"')) continue;
      const re = /export async function (\w+)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const resto = s.slice(re.lastIndex);
        const fin = resto.search(/\nexport (async )?function |\nexport const /);
        const cuerpo = s.slice(m.index, re.lastIndex + (fin === -1 ? resto.length : fin));
        const escribe = /\b(INSERT|UPDATE|DELETE)\b|db\.(insert|update|delete)\(/.test(cuerpo);
        if (escribe && /requireLectura|puedeLeerDireccion/.test(cuerpo)) malas.push(`${f}:${m[1]}`);
      }
    }
    expect(malas).toEqual([]);
  });
});
