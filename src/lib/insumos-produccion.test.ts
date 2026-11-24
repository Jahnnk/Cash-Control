import { describe, expect, it } from "vitest";
import { clasificarInsumos, resumenInsumos, textoEquivalencia, unidadesCalzan } from "./insumos-produccion";
import type { CostoPreparacion } from "./costos-preparaciones";
import type { InsumoProd } from "./recetas-produccion";

const c = (ref: string, tipo: CostoPreparacion["tipo"], nombre: string, unidad: CostoPreparacion["unidad"], costo: number): CostoPreparacion =>
  ({ ref, tipo, nombre, categoria: null, unidad, costo });
const catalogo = [
  c("AC005", "insumo", "Mantequilla sin sal", "kg", 28),
  c("HV001", "insumo", "Huevos de corral", "kg", 12.7),
  c("HR009", "insumo", "Harina Pastelera Nicolini", "kg", 2.78),
  c("BL001", "insumo", "Bolsa Celofán 11x16 (Und)", "und", 0.1),
  c("SUB:crema", "preparacion", "Crema Pastelera", "kg", 10),
  c("AT-1", "producto", "Mantequilla de maní", "und", 5),
];
const i = (id: number, nombre: string, base: InsumoProd["base"] = "peso", usos = 1): InsumoProd => ({ id, nombre, activo: true, base, subrecetaId: null, usos });

describe("conectar insumos de Producción (paso 2)", () => {
  const filas = clasificarInsumos([
    i(1, "Mantequilla Sin Sal", "peso", 9),
    i(2, "Huevos de corral", "unidad"),
    i(3, "Harina Pastelera"),
    i(4, "crema pastelera"),
    i(5, "Nueces"),
    i(6, "Bolsa Celofán 10x15", "unidad"),
    i(7, "Sal"),
  ], catalogo, [{ tipo: "insumo", prodClave: "7", refCC: null, factor: 1 }]);
  const f = (id: number) => filas.find((x) => x.id === id)!;

  it("mismo nombre y unidades que calzan: exacta con su equivalencia", () => {
    expect(f(1)).toMatchObject({ estado: "exacta", factor: 0.001, pareja: { ref: "AC005" } });
    expect(f(4)).toMatchObject({ estado: "exacta", pareja: { ref: "SUB:crema" } }); // sub-receta del Excel
    expect(filas[0].id).toBe(1); // los más usados primero
  });

  it("mismo nombre pero Producción cuenta y Cash Control pesa: se revisa a mano", () => {
    expect(f(2)).toMatchObject({ estado: "probable", unidadOk: false, factor: null });
  });

  it("parecidos, nada parecido y «no aplica» guardado", () => {
    expect(f(3)).toMatchObject({ estado: "probable", pareja: { ref: "HR009" } });
    expect(f(5).estado).toBe("nada");
    expect(f(6)).toMatchObject({ estado: "probable", pareja: { ref: "BL001" }, factor: 1 });
    expect(f(7).estado).toBe("noAplica");
    expect(filas.some((x) => x.pareja?.ref === "AT-1")).toBe(false); // los productos no son insumos
    expect(resumenInsumos(filas)).toMatchObject({ total: 7, exacta: 2, listos: 1 });
  });

  it("una pareja guardada manda sobre el nombre", () => {
    const [g] = clasificarInsumos([i(3, "Harina Pastelera")], catalogo, [{ tipo: "insumo", prodClave: "3", refCC: "HR009", factor: 0.001 }]);
    expect(g).toMatchObject({ estado: "conectado", factor: 0.001 });
  });

  it("unidades y texto de la equivalencia", () => {
    expect(unidadesCalzan("volumen", "l")).toBe(true);
    expect(unidadesCalzan("unidad", "kg")).toBe(false);
    expect(textoEquivalencia("unidad", "kg", 0.06)).toBe("1 unidad de Producción = 0.06 kg");
  });
});
