import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { armarMatriz, lecturaDe, type CartaSede, type ProductoMatriz, type ProductoMatrizSede } from "./matriz-carta";
import { MatrizCarta } from "../../app/grupo/productos/matriz-carta";
import { GraficoDemanda } from "../../components/productos/grafico-demanda";

const MESES = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const serie = (porDia: number[]) => MESES.map((month, i) => ({ month, completo: true, porDia: porDia[i] }));
const carta = (id: number, sede: string, base = 100): CartaSede => ({ businessId: id, sede, serie: serie(MESES.map(() => base)) });

function sedeP(id: number, sede: string, porDia: number[], precio: number, costo: number | null, estado: ProductoMatrizSede["estado"] = "bien"): ProductoMatrizSede {
  const ult = porDia.slice(-3).reduce((s, v) => s + v, 0) / 3;
  return {
    businessId: id, sede, estado, unidadesDia: ult, unidadesSemana: ult * 7, ventaDia: ult * precio, precio, costo,
    gananciaDia: costo === null ? null : ult * (precio - costo), serie: serie(porDia),
  };
}
const prod = (clave: string, nombre: string, sedes: ProductoMatrizSede[], familia = "Panadería" as ProductoMatriz["familia"]): ProductoMatriz => ({ clave, nombre, familia, sedes });
const plano = (v: number) => MESES.map(() => v);

// Cuatro productos que caen cada uno en una caja (mediana de 4 → 2 y 2).
const base: ProductoMatriz[] = [
  prod("estrella", "ESTRELLA", [sedeP(2, "Fonavi", plano(3), 15, 5)]),         // vende mucho, deja S/10
  prod("vaca", "VACA", [sedeP(2, "Fonavi", plano(4), 6, 4)]),                  // vende más, deja S/2
  prod("interrogante", "INTERROGANTE", [sedeP(2, "Fonavi", plano(0.5), 20, 8)]), // vende poco, deja S/12
  prod("perro", "PERRO", [sedeP(2, "Fonavi", plano(0.4), 5, 4)]),              // vende poco, deja S/1
];
const cartas = [carta(2, "Fonavi")];

describe("la matriz de la carta", () => {
  it("ubica cada producto en su caja con la mediana como corte", () => {
    const m = armarMatriz(base, cartas, { sedeId: null, familia: null });
    const caja = (c: string) => m.puntos.find((p) => p.clave === c)?.cuadrante;
    expect(caja("estrella")).toBe("estrella");
    expect(caja("vaca")).toBe("vaca");
    expect(caja("interrogante")).toBe("interrogante");
    expect(caja("perro")).toBe("perro");
  });

  it("el eje de ventas es la demanda en unidades por semana, no los soles", () => {
    const m = armarMatriz(base, cartas, { sedeId: null, familia: null });
    expect(m.puntos.find((p) => p.clave === "vaca")?.unidadesSemana).toBe(28);
  });

  it("dice cuánto de lo que se gana está en cada caja (suma 100)", () => {
    const m = armarMatriz(base, cartas, { sedeId: null, familia: null });
    const suma = Object.values(m.cuadrantes).reduce((t, c) => t + c.pctGanancia, 0);
    expect(suma).toBeGreaterThanOrEqual(99);
    expect(suma).toBeLessThanOrEqual(101);
    expect(m.cuadrantes.perro.n).toBe(1);
  });

  it("un producto sin costo no se ubica: se cuenta aparte", () => {
    const conSinCosto = [...base, prod("sc", "SIN COSTO", [sedeP(2, "Fonavi", plano(2), 8, null)])];
    const m = armarMatriz(conSinCosto, cartas, { sedeId: null, familia: null });
    expect(m.puntos.some((p) => p.clave === "sc")).toBe(false);
    expect(m.sinCosto.map((x) => x.clave)).toEqual(["sc"]);
  });

  it("nuevos, sin ventas y acompañamientos quedan fuera", () => {
    const extra = [
      prod("nuevo", "NUEVO", [sedeP(2, "Fonavi", plano(2), 10, 5, "nuevo")]),
      prod("fuera", "YA NO SE VENDE", [sedeP(2, "Fonavi", plano(0), 10, 5, "dejo-de-venderse")]),
    ];
    const m = armarMatriz([...base, ...extra], cartas, { sedeId: null, familia: null });
    expect(m.puntos).toHaveLength(4);
    expect(m.fuera).toBe(2);
  });

  it("filtra por familia y por sede", () => {
    const dos: ProductoMatriz[] = [
      prod("a", "A", [sedeP(2, "Fonavi", plano(3), 10, 4), sedeP(3, "Centro", plano(1), 10, 4)], "Panadería"),
      prod("b", "B", [sedeP(2, "Fonavi", plano(2), 10, 4)], "Empanadas"),
    ];
    const cs = [carta(2, "Fonavi"), carta(3, "Centro")];
    expect(armarMatriz(dos, cs, { sedeId: null, familia: "Empanadas" }).puntos.map((p) => p.clave)).toEqual(["b"]);
    const soloCentro = armarMatriz(dos, cs, { sedeId: 3, familia: null });
    expect(soloCentro.puntos.map((p) => p.clave)).toEqual(["a"]);
    // Juntas suma lo de las dos sedes; sola, solo la suya.
    expect(armarMatriz(dos, cs, { sedeId: null, familia: null }).puntos.find((p) => p.clave === "a")?.unidadesSemana).toBe(28);
    expect(soloCentro.puntos[0].unidadesSemana).toBe(7);
  });

  it("la tendencia del producto se mide contra la carta: matcha cae mientras la carta se mantiene", () => {
    const matcha = prod("matcha", "MATCHA", [sedeP(2, "Fonavi", [0.6, 0.5, 0.25, 0.09, 0.13, 0.07], 14, 4)]);
    const m = armarMatriz([...base, matcha], cartas, { sedeId: null, familia: null });
    const p = m.puntos.find((x) => x.clave === "matcha")!;
    expect(p.tendencia.clase).toBe("cayendo");
    expect(p.lectura).toMatch(/cada vez menos|Reemplazar/);
  });

  it("la lectura cambia según la caja y la tendencia", () => {
    expect(lecturaDe("perro", "cayendo")).toMatch(/Reemplazar/);
    expect(lecturaDe("perro", "poco-siempre")).toMatch(/Retirar/);
    expect(lecturaDe("perro", "subiendo")).toMatch(/Observar/);
    expect(lecturaDe("estrella", "cayendo")).toMatch(/se apaga/);
    expect(lecturaDe("vaca", "estable")).toMatch(/rentabilizar/);
    expect(lecturaDe("interrogante", "subiendo")).toMatch(/Impulsar/);
  });

  it("sin productos no revienta", () => {
    const m = armarMatriz([], cartas, { sedeId: null, familia: null });
    expect(m.puntos).toEqual([]);
    expect(m.cortes).toEqual({ unidadesSemana: 0, margenUnidad: 0 });
  });
});

describe("lo que se dibuja", () => {
  it("la matriz muestra las 4 cajas, sus acciones y los productos en la lista", () => {
    const html = renderToStaticMarkup(createElement(MatrizCarta, { matriz: base, cartas, veredictos: new Map() }));
    for (const t of ["Estrella", "Vaca", "Interrogante", "Perro", "Potenciar", "Mantener y rentabilizar", "Probar / impulsar", "Reemplazar / retirar"]) expect(html).toContain(t);
    expect(html).toContain("PERRO"); // en la lista de la caja elegida
    expect(html).toMatch(/Fonavi \+ Centro/);
    expect(html).toContain("unidades por semana");
  });

  it("el gráfico de demanda tiene una línea por sede, tendencia y marca el mes a medias", () => {
    const html = renderToStaticMarkup(createElement(GraficoDemanda, {
      series: [
        { nombre: "Fonavi", color: "#098B5F", forma: "circulo", puntos: [{ month: "2026-07", completo: true, porSemana: 4 }, { month: "2026-08", completo: true, porSemana: 3 }, { month: "2026-09", completo: true, porSemana: 2 }, { month: "2026-10", completo: false, porSemana: 0.5 }] },
        { nombre: "Centro", color: "#6B4FA0", forma: "cuadrado", puntos: [{ month: "2026-07", completo: true, porSemana: 6 }, { month: "2026-08", completo: true, porSemana: 5 }, { month: "2026-09", completo: true, porSemana: 4 }] },
      ],
    }));
    expect(html).toContain("Fonavi");
    expect(html).toContain("Centro");
    expect(html).toContain("tendencia");
    expect(html).toContain("<rect"); // la forma cuadrada de la segunda sede
    expect(html).toContain('fill="white"'); // punto hueco del mes a medias
    expect(html).toMatch(/aria-label="Unidades por semana\./);
  });
});
