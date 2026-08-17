/**
 * Guardia del incidente del 17-ago-2026.
 *
 * La cadena que escribe `bank_balance_real` estaba copiada en dos
 * archivos; una copia tenía candado y la otra no. La que no lo tenía
 * escribió saldos calculados desde CERO en Fonavi y el panel terminó
 * mostrando −S/455.61 con S/15,594.02 en el banco.
 *
 * Estos tests no consultan la base: leen el TEXTO de las consultas y
 * exigen que el candado esté ahí. Si alguien vuelve a copiar la cadena
 * a otro archivo sin él, o lo borra de acá, esto se pone rojo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  cadenaSaldoDesdeFecha, cadenaSaldoDesdeAncla, anclaSaldoBcp,
} from "../saldo-bcp-sql";

/** Etiqueta falsa: devuelve el SQL ya armado, para poder inspeccionarlo. */
const tag = (s: TemplateStringsArray, ...v: unknown[]) =>
  s.reduce((acc, part, i) => acc + part + (i < v.length ? String(v[i]) : ""), "");

const CANDADO = /NOT EXISTS\s*\(\s*SELECT 1 FROM businesses b WHERE b\.id = \d+ AND b\.system_start_date IS NOT NULL\s*\)/;

describe("las consultas que ESCRIBEN el saldo llevan el candado", () => {
  it("la cadena desde una fecha no toca sedes con reset", () => {
    expect(cadenaSaldoDesdeFecha(tag, 2, "2026-08-03")).toMatch(CANDADO);
  });

  it("la propagación desde un ancla tampoco", () => {
    // Esta era la otra puerta: entrar el saldo real de un día propagaba
    // valores CALCULADOS a los días siguientes, y el siguiente que leyera
    // el saldo los tomaba por lecturas del banco.
    expect(cadenaSaldoDesdeAncla(tag, 2, "2026-08-03")).toMatch(CANDADO);
  });

  it("el candado va en el WHERE del UPDATE, no antes", () => {
    // Si estuviera en el SELECT de la cadena y no en el UPDATE, la
    // consulta calcularía igual y escribiría igual.
    const q = cadenaSaldoDesdeFecha(tag, 2, "2026-08-03");
    const iUpdate = q.indexOf("UPDATE daily_records");
    expect(iUpdate).toBeGreaterThan(-1);
    expect(q.slice(iUpdate)).toMatch(CANDADO);
  });
});

describe("el ancla ignora lo anterior al corte del sistema", () => {
  it("filtra por system_start_date", () => {
    // Fonavi arrancó el 01-ago y tenía saldos del 28 y 30 de julio (uno
    // en negativo). Un saldo de antes del corte es de otra vida del
    // sistema, no un dato viejo.
    expect(anclaSaldoBcp(tag, 2, "2026-08-17"))
      .toMatch(/b\.system_start_date IS NULL OR dr\.date >= b\.system_start_date/);
  });

  it("sigue tomando el más reciente y solo uno", () => {
    const q = anclaSaldoBcp(tag, 2, "2026-08-17");
    expect(q).toMatch(/ORDER BY dr\.date DESC/);
    expect(q).toMatch(/LIMIT 1/);
    expect(q).toMatch(/dr\.archived = false/);
  });
});

describe("nadie volvió a copiar la cadena a otro archivo", () => {
  it("solo saldo-bcp-sql.ts escribe bank_balance_real con una cadena", () => {
    // El bug nació de un copy-paste. Esta prueba lo detecta: si aparece
    // otro archivo con "SET bank_balance_real = chain.calc_balance",
    // es una copia nueva y hay que traerla acá.
    const raiz = join(process.cwd(), "src");
    const culpables: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) { recorrer(ruta); continue; }
        if (!/\.(ts|tsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
        if (ruta.endsWith("saldo-bcp-sql.ts")) continue;
        if (readFileSync(ruta, "utf8").includes("SET bank_balance_real = chain.calc_balance")) {
          culpables.push(ruta.replace(raiz, "src"));
        }
      }
    };
    recorrer(raiz);
    expect(culpables).toEqual([]);
  });
});
