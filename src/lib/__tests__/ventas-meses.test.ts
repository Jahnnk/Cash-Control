import { describe, it, expect } from "vitest";
import { armarFilas } from "@/lib/ventas-meses";

const sede = (businessId: number, ventas: number | null, posteriores = 0, compraAtelier = 0) => ({ businessId, ventas, ventasPosteriores: posteriores, compraAtelier }) as never;

describe("Reportes · Ventas por mes", () => {
  const filas = armarFilas({ hoy: "2026-10-23", meses: [
    { mes: "2026-09", sedes: [sede(2, 37294, 0, 12000), sede(3, 41336, 0, 9000), sede(1, 36285)] },
    { mes: "2026-10", sedes: [sede(2, 16491, 4248), sede(3, 19560, 9788), sede(1, 14866, 5803)] },
  ] });
  it("el grupo cuenta una sola vez lo que Atelier le vende a las cafeterías", () => {
    expect(filas[0].grupo).toBe(37294 + 41336 + 36285 - 12000 - 9000);
  });
  it("el mes en curso suma lo que Byte ya trae después del último día con Excel", () => {
    expect(filas[1].enCurso).toBe(true);
    expect(filas[1].sedes[3]).toBe(19560 + 9788);
  });
});
