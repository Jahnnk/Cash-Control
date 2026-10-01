import { describe, it, expect } from "vitest";
import { emparejarVendedor } from "../emparejar-vendedor";

const fonavi = ["Alisson", "Claudio Arribasplata", "Piero", "Piero Renato", "Mirssy"];

describe("emparejarVendedor", () => {
  it("empareja el nombre corto con el comienzo del nombre de Byte", () => {
    expect(emparejarVendedor("ALISSON NICOLL RUMAY VALLEJOS", fonavi)).toBe("Alisson");
    expect(emparejarVendedor("CLAUDIO ARRIBASPLATA", fonavi)).toBe("Claudio Arribasplata");
  });

  it("con dos Pieros gana el nombre más largo que sea comienzo", () => {
    expect(emparejarVendedor("PIERO RENATO OBANDO ALVAREZ", fonavi)).toBe("Piero Renato");
    expect(emparejarVendedor("PIERO ANDRE MANOSALVA ALVAREZ", fonavi)).toBe("Piero");
  });

  it("ignora tildes y mayúsculas", () => {
    expect(emparejarVendedor("VERÓNICA ELIZABETH CELIS", ["Verónica"])).toBe("Verónica");
    expect(emparejarVendedor("veronica elizabeth", ["Verónica"])).toBe("Verónica");
  });

  it("sin coincidencia o con empate devuelve null (que elija una persona)", () => {
    expect(emparejarVendedor("JUAN PEREZ", fonavi)).toBeNull();
    expect(emparejarVendedor("PIERO X", ["Piero", "piero"])).toBeNull();
  });

  it("no confunde un nombre con parte de otra palabra", () => {
    expect(emparejarVendedor("PIEROTTI LOPEZ", ["Piero"])).toBeNull();
  });
});
