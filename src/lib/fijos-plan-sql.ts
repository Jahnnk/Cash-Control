/**
 * Los costos fijos que el PRESUPUESTO APROBADO espera de cada sede en un mes · lectura (servidor).
 *
 * Los usa «De cada S/ 100 que vendes» (lib/cada-100.ts) para estimar el EBITDA del mes abierto: a mitad de mes el Excel
 * todavía no trae la planilla ni el alquiler, así que los fijos del mes completo salen del plan. Solo cuenta un
 * presupuesto APROBADO con venta esperada; si no hay, el Dashboard usa el promedio de los meses cerrados.
 */

import { planDe } from "./presupuesto-datos";
import { montoDe } from "./presupuesto";
import { rubroDe } from "./seis-cifras";

export type PlanFijos = { fijos: number; ventaEsperada: number };

export async function fijosDelPlanAprobado(mes: string, sedes: number[] = [1, 2, 3]): Promise<Record<number, PlanFijos>> {
  const out: Record<number, PlanFijos> = {};
  await Promise.all(sedes.map(async (bId) => {
    try {
      const { cab, lineas } = await planDe(bId, mes);
      const venta = cab?.aprobadoEl ? cab.ventaEsperada : null;
      if (!venta || venta <= 0 || lineas.length === 0) return;
      const fijos = lineas.filter((l) => rubroDe(l.categoria) === "gastos").reduce((t, l) => t + (montoDe(l, venta) ?? 0), 0);
      if (fijos > 0) out[bId] = { fijos: Math.round(fijos * 100) / 100, ventaEsperada: venta };
    } catch { /* sin presupuesto o sin la tabla: se usa el promedio */ }
  }));
  return out;
}
