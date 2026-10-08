/**
 * «¿Cómo vamos este mes?» · reglas compartidas (UX, 8-oct-2026). Las usan el Resumen de Grupo y el
 * dashboard de cada sede, para que las dos pantallas digan exactamente lo mismo.
 */

import type { BreakevenResult } from "@/lib/breakeven";

export type Tono = "bien" | "ojo" | "mal" | "neutro";

/**
 * En cuánto cerraría el mes una sede al ritmo actual. Con menos de 7 días cargados manda el ritmo de
 * los últimos 7 días con venta (el inicio de mes engaña: Atelier factura a empresas en días sueltos).
 */
export function proyeccionSede(v: { mes: number; hasta: string | null; serie14: number[] }, diasDelMes: number): number {
  const dia = v.hasta ? Number(v.hasta.slice(8, 10)) : 0;
  if (!dia) return 0;
  const ult7 = v.serie14.slice(-7);
  return dia >= 7 || ult7.length < 7 ? (v.mes / dia) * diasDelMes : (ult7.reduce((a, x) => a + x, 0) / 7) * diasDelMes;
}

/**
 * El punto de equilibrio en una frase. En una sede, con `alRitmo` el estado se decide con el MISMO
 * ritmo que la proyección de ventas de la cabecera (si no, Atelier con 3 días cargados decía
 * «cierra sobre la meta» y «el equilibrio está en riesgo» a la vez).
 */
export function textoEquilibrio(
  r: BreakevenResult | null, enCurso: boolean,
  alRitmo?: { ventas: number; proyeccion: number; diasDelMes: number },
): { texto: string; detalle: string; tono: Tono } {
  if (!r || r.estado === "sin_datos") return { texto: "—", detalle: "Sin datos suficientes", tono: "neutro" };
  if (enCurso && alRitmo && r.breakEven && r.breakEven > 0 && alRitmo.proyeccion > 0) {
    const pe = r.breakEven;
    const avance = Math.round((alRitmo.ventas / pe) * 100);
    if (alRitmo.ventas >= pe) return { texto: "Cubierto", detalle: "Las ventas ya pagan los costos del mes", tono: "bien" };
    if (alRitmo.proyeccion < pe) return { texto: "En riesgo", detalle: `Al ritmo actual no se cubre (va en ${avance}%)`, tono: "mal" };
    const dia = Math.ceil(pe / (alRitmo.proyeccion / alRitmo.diasDelMes));
    return { texto: `Se cubre el día ${Math.min(dia, alRitmo.diasDelMes)}`, detalle: `Va en ${avance}% al ritmo actual`, tono: "neutro" };
  }
  const avance = Math.round(r.avancePct ?? 0);
  if (r.estado === "superado") return { texto: "Cubierto", detalle: enCurso ? "Las ventas ya pagan los costos del mes" : "Las ventas pagaron los costos del mes", tono: "bien" };
  if (r.estado === "en_riesgo") {
    return enCurso
      ? { texto: "En riesgo", detalle: `Al ritmo actual no se cubre (va en ${avance}%)`, tono: "mal" }
      : { texto: "No se cubrió", detalle: `Se llegó al ${avance}%`, tono: "mal" };
  }
  return { texto: r.diaEstimadoCruce ? `Se cubre el día ${r.diaEstimadoCruce}` : `${avance}% cubierto`, detalle: `Va en ${avance}% al ritmo actual`, tono: "neutro" };
}

/** La ganancia real en una cifra y su explicación corta. */
export function textoGanancia(c: { ganancia: number | null; gananciaPct: number | null; provisional?: boolean } | null): { valor: number | null; detalle: string } {
  if (!c || c.ganancia === null) return { valor: null, detalle: "Se calcula con el Excel desde el día 10" };
  const pct = c.gananciaPct !== null ? `${c.gananciaPct.toLocaleString("es-PE", { maximumFractionDigits: 1 })}% de lo vendido` : "";
  return { valor: c.ganancia, detalle: `${pct}${c.provisional ? " · provisional" : ""}` };
}
