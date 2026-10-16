import { describe, expect, it } from "vitest";
import { proyeccionSede, textoEquilibrio, textoGanancia } from "./estado-mes";
import type { BreakevenResult } from "@/lib/breakeven";

const r = (o: Partial<BreakevenResult>): BreakevenResult => ({
  fijos: 0, variables: 0, sinClasificar: 0, ventas: 0, varRatio: null, contributionMargin: null, breakEven: 36000, avancePct: 7,
  ventasProyectadas: 24800, diaEstimadoCruce: null, estado: "en_riesgo", referenceMonths: null, warnings: [], ...o,
} as BreakevenResult);

describe("¿cómo vamos? — reglas compartidas", () => {
  it("con menos de 7 días cargados, el ritmo sale de los últimos 7 días con venta", () => {
    const serie = [1200, 1100, 1300, 1250, 1150, 1200, 1210];
    expect(Math.round(proyeccionSede({ mes: 2401, hasta: "2026-10-03", serie14: serie }, 31))).toBe(Math.round((8410 / 7) * 31));
    expect(proyeccionSede({ mes: 7000, hasta: "2026-10-07", serie14: serie }, 31)).toBe(31000);
  });
  it("en una sede, el equilibrio usa el mismo ritmo que la proyección de ventas", () => {
    // El motor dice «en riesgo» con 3 días, pero al ritmo de la semana se cubre: no se contradicen.
    const t = textoEquilibrio(r({}), true, { ventas: 2401, proyeccion: 43533, diasDelMes: 31 });
    expect(t.texto).toBe("Se cubre el día 26");
    expect(textoEquilibrio(r({}), true, { ventas: 2401, proyeccion: 30000, diasDelMes: 31 }).texto).toBe("En riesgo");
    expect(textoEquilibrio(r({}), true).texto).toBe("En riesgo");
    expect(textoEquilibrio(r({ estado: "superado" }), false).texto).toBe("Cubierto");
  });
  it("ganancia: antes del día 10 no se inventa", () => {
    expect(textoGanancia(null).valor).toBeNull();
    expect(textoGanancia({ ganancia: 6232, gananciaPct: 16.7, provisional: true }).detalle).toBe("16.7% de lo vendido · provisional");
  });
  it("el equilibrio dice el piso diario de la asesoría: (costos fijos + food cost) ÷ 30", () => {
    const con = (o: Partial<BreakevenResult>) => r({ pisoDia: 1031.4, ...o });
    expect(textoEquilibrio(con({ estado: "superado" }), false).detalle).toBe("Piso S/1,031 al día · las ventas cubrieron el mes");
    expect(textoEquilibrio(con({}), true, { ventas: 2401, proyeccion: 43533, diasDelMes: 31 }).detalle).toBe("Piso S/1,031 al día · va en 7% al ritmo actual");
    expect(textoEquilibrio(con({}), true, { ventas: 2401, proyeccion: 30000, diasDelMes: 31 }).detalle).toBe("Piso S/1,031 al día · al ritmo actual no se cubre (va en 7%)");
    expect(textoEquilibrio(con({ estado: "en_riesgo", avancePct: 82 }), false).detalle).toBe("Piso S/1,031 al día · se llegó al 82%");
  });
});
