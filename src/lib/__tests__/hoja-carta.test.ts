import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { leerHojaCarta } from "../costos-preparaciones-excel";

describe("leerHojaCarta", () => {
  it("lee sección, nombre y precio por ID de PRICING", () => {
    const ws = XLSX.utils.aoa_to_sheet([["CARTA"], [], ["Sección", "Producto en carta", "Precio carta (S/)", "ID en PRICING"], ["Postres", "Pie de Manzana", 8, "AT-034"], ["Extras", "Humita", 5, "CF-110"], ["Extras", "Sin enlace", 3, null]]);
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    const m = leerHojaCarta(filas as never);
    expect(m?.get("AT-034")).toEqual({ seccion: "Postres", nombre: "Pie de Manzana", precio: 8 });
    expect(m?.size).toBe(2);
  });
  it("sin hoja Carta devuelve null", () => {
    expect(leerHojaCarta(null)).toBeNull();
    expect(leerHojaCarta([["x"]] as never)).toBeNull();
  });
});
