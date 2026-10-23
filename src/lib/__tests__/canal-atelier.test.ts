/**
 * Atelier vende el mismo producto por dos canales: «Y-» a las cafeterías y «P-» a otros B2B (22-oct-2026). El matching
 * quita el prefijo para encontrar el catálogo, pero las dos líneas nunca se suman en una.
 */
import { describe, it, expect } from "vitest";
import { canalDeLinea, normalizeProductName } from "../product-matching";
import { keyDeProducto } from "../portfolio/facts-sql";

describe("canal de una línea de Atelier", () => {
  it("Y- es cafeterías, P- es B2B, sin prefijo es null", () => {
    expect(canalDeLinea("Y-BROWNIE TRIPLE CHOCOLATE")).toBe("Y");
    expect(canalDeLinea("P-BROWNIE TRIPLE CHOCOLATE")).toBe("P");
    expect(canalDeLinea("p - cookie xl")).toBe("P");
    expect(canalDeLinea("[ELIMINADO 2026-09-03 12:04:24] Y-CHEESCAKE DE FRESA")).toBe("Y");
    expect(canalDeLinea("PAN DE HAMBURGUESA 5UND")).toBeNull();
    expect(canalDeLinea("PAVO POR KILO")).toBeNull(); // empieza con P pero sin guion
    expect(canalDeLinea("EMPANADA MIXTA")).toBeNull();
  });

  it("el matching sigue encontrando el mismo producto del catálogo para Y- y P-", () => {
    expect(normalizeProductName("Y-BROWNIE TRIPLE CHOCOLATE")).toBe(normalizeProductName("P-BROWNIE TRIPLE CHOCOLATE"));
  });

  it("pero la clave del portafolio separa los dos canales", () => {
    const pid = "abc-123";
    expect(keyDeProducto(pid, "Y-BROWNIE TRIPLE CHOCOLATE")).toBe("abc-123|Y");
    expect(keyDeProducto(pid, "P-BROWNIE TRIPLE CHOCOLATE")).toBe("abc-123|P");
    expect(keyDeProducto(pid, "EMPANADA MIXTA")).toBe("abc-123"); // cafeterías: sin cambio
    expect(keyDeProducto(null, "P-COOKIE XL")).toBe("raw:COOKIE XL|P");
  });
});
