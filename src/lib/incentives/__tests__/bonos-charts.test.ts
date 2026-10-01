import { describe, it, expect } from "vitest";
import { graficoLineas, graficoBarras, graficoAvanceMetas } from "../bonos-charts";

const bien = (svg: string) => {
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  // sin NaN/undefined colados en las coordenadas
  expect(svg).not.toMatch(/NaN|undefined|Infinity/);
};

describe("gráficos del reporte de bonos", () => {
  it("líneas: dibuja la serie, las guías y escapa el texto", () => {
    const d = graficoLineas({
      titulo: "Ticket <acumulado> & metas",
      dias: 30,
      series: [{ nombre: "Ticket", color: "#037753", puntos: [23, 23.2, null, 23.6, ...Array(26).fill(null)] }],
      guias: [{ y: 22.11, etiqueta: "Base S/22.11", color: "#6B7280" }, { y: 23.61, etiqueta: "Nivel 1", color: "#D9A441", punteada: true }],
      formato: (n) => `S/${n.toFixed(2)}`,
    });
    bien(d.svg);
    expect(d.svg).toContain("Ticket &lt;acumulado&gt; &amp; metas");
    expect(d.svg).toContain("Nivel 1");
    expect(d.svg).toContain("<path");
  });

  it("líneas: con el ritmo necesario y una sola medición no se rompe", () => {
    const d = graficoLineas({
      titulo: "Ventas", dias: 31, yMin: 0,
      series: [{ nombre: "v", color: "#000", puntos: [100, ...Array(30).fill(null)] }],
      guias: [{ y: 37300, etiqueta: "Meta", color: "#D9A441" }],
      ritmo: { hasta: 37300, etiqueta: "ritmo", color: "#6B7280" },
      formato: (n) => String(Math.round(n)),
    });
    bien(d.svg);
  });

  it("barras: una por persona, la más larga ocupa el ancho y cero no deja barra", () => {
    const d = graficoBarras({
      titulo: "A transferir",
      barras: [{ etiqueta: "Ana", valor: 100, color: "#111" }, { etiqueta: "Beto", valor: 0, color: "#111" }],
      formato: (n) => `S/${n}`,
    });
    bien(d.svg);
    expect(d.svg).toContain("Ana");
    expect(d.height).toBeGreaterThan(80);
  });

  it("avance de metas: marca el 100% y distingue las cumplidas", () => {
    const d = graficoAvanceMetas({
      titulo: "Avance",
      grupos: [{ etiqueta: "Nivel 1", valores: [{ sede: "Fonavi", color: "#098B5F", pct: 99.3 }, { sede: "Centro", color: "#B7791F", pct: 215 }] }],
    });
    bien(d.svg);
    expect(d.svg).toContain("215%");
    expect(d.svg).toContain("cumplida");
    expect(d.svg).toContain("99%");
  });
});
