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
  });
});
