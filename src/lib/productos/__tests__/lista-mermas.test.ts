import { describe, expect, it } from "vitest";
import { estaEnLaLista, listaParaMermas } from "../lista-mermas";

describe("listaParaMermas", () => {
  const lista = listaParaMermas(
    ["EMPANADA MIXTA", "Brownie Vegano", "[ELIMINADO 2026-09-11 19:07:53] REPOSICION CAKE CHOCOLATE", "CARROT CAKE PORCIÓN", "EXTRA QUESO"],
    ["Y-BROWNIE VEGANO", "Y-PAN IMG NORMAL 550G", "P-COOKIE XL", "MASA DE PIE"],
  );
  it("junta lo que vende la sede con lo que Atelier manda a las cafeterías, sin duplicados ni ajustes", () => {
    expect(lista).toEqual(["BROWNIE VEGANO", "CARROT CAKE PORCIÓN", "EMPANADA MIXTA", "PAN IMG NORMAL 550G"]);
  });
  it("reconoce el nombre aunque cambien tildes, mayúsculas o «de»", () => {
    expect(estaEnLaLista("carrot cake porcion", lista)).toBe(true);
    expect(estaEnLaLista("Pan IMG normal 550g", lista)).toBe(true);
    expect(estaEnLaLista("mixta", lista)).toBe(false);
    expect(estaEnLaLista("", lista)).toBe(false);
  });
});
