/**
 * Tests de los vales de consumo.
 *
 * Lo que se clava acá: que el código sea legible y no adivinable, que lo
 * que escribe la cajera o el encargado (minúsculas, sin guion, el link
 * pegado) llegue al mismo código guardado, y que «vencido» se deduzca del
 * día en vez de guardarse.
 */
import { describe, it, expect } from "vitest";
import {
  ALFABETO_CODIGO, generarCodigo, normalizarCodigo, estadoEfectivo, valorCarta,
  validarEmision, sumarDias, resumenItems, mensajeWhatsApp, MAX_ITEMS,
  enteroAlAzar, barajar, sortear, textoTodosLosVales, PARTICIPANTES_SORTEO, MAX_PREMIOS_SORTEO,
} from "./vales";

const HOY = "2026-11-22";

const item = (over: Partial<{ ref: string; nombre: string; cantidad: number; precio: number }> = {}) => ({
  ref: "CF-011", nombre: "Cappuccino", cantidad: 1, precio: 9.5, ...over,
});

describe("generarCodigo", () => {
  it("tiene la forma XXXX-XXXX y solo símbolos legibles", () => {
    for (let i = 0; i < 200; i++) {
      const c = generarCodigo();
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      for (const ch of c.replace("-", "")) expect(ALFABETO_CODIGO).toContain(ch);
      expect(c).not.toMatch(/[IO01]/);
    }
  });

  it("no repite códigos en una tanda grande (billón de combinaciones)", () => {
    const vistos = new Set(Array.from({ length: 2000 }, () => generarCodigo()));
    expect(vistos.size).toBe(2000);
  });

  it("descarta los bytes que sesgarían el reparto (>= 224)", () => {
    // Con todo 255 nunca podría armar un código; con mezcla, ignora los altos.
    let llamada = 0;
    const azar = () => {
      llamada++;
      return llamada === 1 ? new Uint8Array(16).fill(255) : new Uint8Array(16).fill(0);
    };
    // byte 0 → primer símbolo del alfabeto ("A")
    expect(generarCodigo(azar)).toBe("AAAA-AAAA");
  });
});

describe("normalizarCodigo", () => {
  it("acepta minúsculas, espacios y sin guion", () => {
    expect(normalizarCodigo("7k3q m2pa")).toBe("7K3Q-M2PA");
    expect(normalizarCodigo("7K3QM2PA")).toBe("7K3Q-M2PA");
    expect(normalizarCodigo("  7k3q-m2pa  ")).toBe("7K3Q-M2PA");
  });

  it("acepta el link pegado completo", () => {
    expect(normalizarCodigo("https://cash-control-delta.vercel.app/vale/7K3Q-M2PA")).toBe("7K3Q-M2PA");
    expect(normalizarCodigo("https://x.app/vale/7k3q-m2pa?utm=1")).toBe("7K3Q-M2PA");
  });

  it("rechaza lo que no es un código", () => {
    expect(normalizarCodigo("")).toBeNull();
    expect(normalizarCodigo("7K3Q")).toBeNull();
    expect(normalizarCodigo("7K3Q-M2PA-X")).toBeNull();
    // 0, O, 1 e I no existen en el alfabeto
    expect(normalizarCodigo("0K3Q-M2PA")).toBeNull();
    expect(normalizarCodigo("7K3Q-M2PI")).toBeNull();
  });
});

describe("estadoEfectivo — vencido se deduce, no se guarda", () => {
  it("vale hasta el día de vencimiento inclusive", () => {
    expect(estadoEfectivo({ estado: "emitido", venceEl: HOY }, HOY)).toBe("emitido");
    expect(estadoEfectivo({ estado: "emitido", venceEl: "2026-11-21" }, HOY)).toBe("vencido");
  });
  it("canjeado y anulado no se vuelven vencidos", () => {
    expect(estadoEfectivo({ estado: "canjeado", venceEl: "2026-01-01" }, HOY)).toBe("canjeado");
    expect(estadoEfectivo({ estado: "anulado", venceEl: "2026-01-01" }, HOY)).toBe("anulado");
  });
});

describe("valorCarta", () => {
  it("suma en céntimos sin errores de coma flotante", () => {
    // 0.1 + 0.2 en flotante da 0.30000000000000004
    expect(valorCarta([{ cantidad: 1, precio: 0.1 }, { cantidad: 1, precio: 0.2 }])).toBe(0.3);
    expect(valorCarta([{ cantidad: 2, precio: 9.5 }, { cantidad: 1, precio: 14.9 }])).toBe(33.9);
    expect(valorCarta([])).toBe(0);
  });
});

describe("validarEmision", () => {
  const base = { items: [item()], para: "", venceEl: "2026-12-22", hoy: HOY };

  it("acepta un vale normal y limpia el nombre vacío a null", () => {
    const r = validarEmision(base);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.para).toBeNull(); expect(r.items).toHaveLength(1); }
  });

  it("exige al menos un producto y tope de productos", () => {
    expect(validarEmision({ ...base, items: [] }).ok).toBe(false);
    const muchos = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => item({ ref: `R${i}` }));
    expect(validarEmision({ ...base, items: muchos }).ok).toBe(false);
  });

  it("rechaza productos repetidos y cantidades fuera de rango", () => {
    expect(validarEmision({ ...base, items: [item(), item()] }).ok).toBe(false);
    expect(validarEmision({ ...base, items: [item({ cantidad: 0 })] }).ok).toBe(false);
    expect(validarEmision({ ...base, items: [item({ cantidad: 6 })] }).ok).toBe(false);
    expect(validarEmision({ ...base, items: [item({ cantidad: 1.5 })] }).ok).toBe(false);
  });

  it("no emite vencido ni a más de 180 días", () => {
    expect(validarEmision({ ...base, venceEl: "2026-11-21" }).ok).toBe(false);
    expect(validarEmision({ ...base, venceEl: HOY }).ok).toBe(true);
    expect(validarEmision({ ...base, venceEl: sumarDias(HOY, 180) }).ok).toBe(true);
    expect(validarEmision({ ...base, venceEl: sumarDias(HOY, 181) }).ok).toBe(false);
    expect(validarEmision({ ...base, venceEl: "mañana" }).ok).toBe(false);
  });

  it("limita el largo del nombre", () => {
    expect(validarEmision({ ...base, para: "x".repeat(61) }).ok).toBe(false);
  });
});

describe("textos", () => {
  it("resumenItems y mensaje de WhatsApp dicen qué cubre y hasta cuándo", () => {
    const items = [
      { ref: "a", nombre: "Cappuccino", cantidad: 1, precio: 9.5 },
      { ref: "b", nombre: "Croissant", cantidad: 2, precio: 6 },
    ];
    expect(resumenItems(items)).toBe("1 Cappuccino + 2 Croissant");
    const m = mensajeWhatsApp({ link: "https://x/vale/7K3Q-M2PA", sede: "Fonavi", items, venceEl: "2026-12-22" });
    expect(m).toContain("Sede: Fonavi");
    expect(m).toContain("1 Cappuccino + 2 Croissant");
    expect(m).toContain("22/12/2026");
    expect(m).toContain("https://x/vale/7K3Q-M2PA");
    expect(m).toContain("Muéstralo en caja al momento de pagar:");
  });
});

describe("mensajes con nombre", () => {
  const items = [{ ref: "a", nombre: "Sánguche de pollo", cantidad: 1, precio: 14 }];
  it("el WhatsApp dice para quién es, si se sabe", () => {
    const con = mensajeWhatsApp({ link: "https://x/vale/AAAA-BBBB", sede: "Centro", items, venceEl: "2026-12-22", para: "Luis" });
    expect(con).toContain("Para: Luis");
    const sin = mensajeWhatsApp({ link: "https://x/vale/AAAA-BBBB", sede: "Centro", items, venceEl: "2026-12-22" });
    expect(sin).not.toContain("Para:");
  });

  it("«copiar todos» lista cada vale con su link", () => {
    const t = textoTodosLosVales([
      { codigo: "AAAA-BBBB", sede: "Fonavi", items, venceEl: "2026-12-22", para: "Luis" },
      { codigo: "CCCC-DDDD", sede: "Centro", items, venceEl: "2026-12-22", para: null },
    ]);
    expect(t).toContain("1) Luis · Fonavi: 1 Sánguche de pollo (hasta el 22/12/2026)");
    expect(t).toContain("2) Centro: 1 Sánguche de pollo");
    expect(t).toContain("/vale/AAAA-BBBB");
    expect(t).toContain("/vale/CCCC-DDDD");
  });
});

describe("enteroAlAzar", () => {
  it("descarta lo que sesgaría el reparto", () => {
    // Con máximo 6, el límite es 2^32 - (2^32 % 6) = 4294967292: los 4 valores de arriba se tiran.
    const valores = [4_294_967_295, 4_294_967_292, 13];
    let i = 0;
    expect(enteroAlAzar(6, () => valores[i++])).toBe(13 % 6);
    expect(i).toBe(3);
  });
  it("rechaza máximos inválidos", () => {
    expect(() => enteroAlAzar(0)).toThrow();
    expect(() => enteroAlAzar(1.5)).toThrow();
  });
});

describe("barajar", () => {
  it("devuelve las mismas personas, sin perder ni repetir, y no toca la lista original", () => {
    const original = ["a", "b", "c", "d", "e", "f"];
    const copia = [...original];
    const r = barajar(original);
    expect([...r].sort()).toEqual(copia);
    expect(original).toEqual(copia);
  });
});

describe("sortear", () => {
  const premios = ["P1", "P2", "P3", "P4", "P5", "P6"];

  it("reparte un premio por persona, sin repetir a nadie", () => {
    for (let i = 0; i < 200; i++) {
      const r = sortear([...PARTICIPANTES_SORTEO], premios);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.ganadores).toHaveLength(6);
      expect(new Set(r.ganadores.map((g) => g.persona)).size).toBe(6);
      expect(r.ganadores.map((g) => g.premio)).toEqual(premios); // los premios conservan su orden
      expect(r.sinPremio).toEqual([]);
    }
  });

  it("con menos premios que personas, gana solo una parte y el resto queda en sinPremio", () => {
    const r = sortear([...PARTICIPANTES_SORTEO], ["P1", "P2"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ganadores).toHaveLength(2);
    expect(r.sinPremio).toHaveLength(4);
    const todos = [...r.ganadores.map((g) => g.persona), ...r.sinPremio].sort();
    expect(todos).toEqual([...PARTICIPANTES_SORTEO].sort());
  });

  it("es justo: cada persona gana el primer premio ~1/6 de las veces", () => {
    const veces: Record<string, number> = {};
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const r = sortear([...PARTICIPANTES_SORTEO], premios);
      if (r.ok) veces[r.ganadores[0].persona] = (veces[r.ganadores[0].persona] ?? 0) + 1;
    }
    // Esperado 1000 por persona; la desviación típica es ~29, así que ±200 son 7σ: no falla por casualidad.
    for (const n of PARTICIPANTES_SORTEO) expect(veces[n]).toBeGreaterThan(800);
    for (const n of PARTICIPANTES_SORTEO) expect(veces[n]).toBeLessThan(1200);
  });

  it("rechaza lo que no se puede sortear, con un mensaje claro", () => {
    expect(sortear([], premios).ok).toBe(false);
    expect(sortear(["Luis"], []).ok).toBe(false);
    const masPremios = sortear(["Luis", "Chari"], ["P1", "P2", "P3"]);
    expect(masPremios.ok).toBe(false);
    if (!masPremios.ok) expect(masPremios.error).toContain("3 premios y solo 2 participantes");
    expect(sortear(["Luis", "luis "], ["P1"]).ok).toBe(false);
    expect(sortear(["Luis"], Array.from({ length: MAX_PREMIOS_SORTEO + 1 }, (_, i) => i)).ok).toBe(false);
  });

  it("ignora los nombres vacíos y recorta espacios", () => {
    const r = sortear(["  Luis ", "", "Chari"], ["P1"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(["Luis", "Chari"]).toContain(r.ganadores[0].persona);
  });
});
