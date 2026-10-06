/**
 * Presupuesto · LECTURA (servidor). Una sola forma de leer el plan y lo real de una sede en un
 * mes, para que la pantalla de Presupuesto y los reportes (Executive Brief, reporte ejecutivo,
 * PDF/Excel de exportación) digan lo mismo. Reemplaza a la tabla vieja `budgets` (6-oct-2026).
 */

import { neon } from "@neondatabase/serverless";
import { loadVentaRowsBlended } from "./kpis/ventas-loader";
import { armarSede, type FilaSede, type Linea } from "./presupuesto";

const sql = neon(process.env.DATABASE_URL!);

const finDeMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export type CabeceraPresupuesto = {
  ventaEsperada: number | null;
  aprobadoEl: string | null;
  aprobadoPor: string | null;
  actualizadoEl: string;
  actualizadoPor: string | null;
};

/**
 * Lo que salió por categoría y mes: las mismas filas que «las seis cifras» (la parte PROPIA de
 * los gastos compartidos, sin espejos ni lo que pagó el socio de su bolsillo).
 */
export async function gastoPorCategoria(bId: number, desde: string, hasta: string): Promise<{ mes: string; categoria: string; monto: number }[]> {
  return (await sql`
    SELECT to_char(date, 'YYYY-MM') AS mes, category AS categoria,
           SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS monto
    FROM expenses
    WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} AND archived = false
      AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
      AND payment_method NOT IN ('pendiente_atelier', 'socio')
    GROUP BY 1, 2
  `) as { mes: string; categoria: string; monto: number }[];
}

export async function ventasPorMes(bId: number, desde: string, hasta: string): Promise<Map<string, number>> {
  const v = await loadVentaRowsBlended(sql, bId, desde, hasta);
  const m = new Map<string, number>();
  for (const r of v.rows) m.set(r.date.slice(0, 7), (m.get(r.date.slice(0, 7)) ?? 0) + r.total);
  return m;
}

export async function planDe(bId: number, mes: string): Promise<{ cab: CabeceraPresupuesto | null; lineas: Linea[] }> {
  const [cab, lin] = await Promise.all([
    sql`SELECT venta_esperada::float AS "ventaEsperada", aprobado_el::text AS "aprobadoEl", aprobado_por AS "aprobadoPor",
               actualizado_el::text AS "actualizadoEl", actualizado_por AS "actualizadoPor"
        FROM presupuesto_mes WHERE business_id = ${bId} AND mes = ${mes}` as unknown as Promise<CabeceraPresupuesto[]>,
    sql`SELECT categoria, modo, valor::float AS valor FROM presupuesto_linea WHERE business_id = ${bId} AND mes = ${mes}` as unknown as Promise<Linea[]>,
  ]);
  return { cab: cab[0] ?? null, lineas: lin };
}

/**
 * El presupuesto de una sede en un mes, ya comparado contra lo real (hasta hoy si el mes está
 * en curso). null = la sede no tiene presupuesto para ese mes.
 */
export async function presupuestoDeSede(bId: number, sede: string, mes: string): Promise<FilaSede | null> {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const plan = await planDe(bId, mes);
  if (!plan.lineas.length) return null;
  const enCurso = mes === hoy.slice(0, 7);
  const futuro = mes > hoy.slice(0, 7);
  const hasta = finDeMes(mes) < hoy ? finDeMes(mes) : hoy;
  const [gasto, ventas] = futuro
    ? [[], new Map<string, number>()] as const
    : await Promise.all([gastoPorCategoria(bId, `${mes}-01`, hasta), ventasPorMes(bId, `${mes}-01`, hasta)]);
  const real: Record<string, number> = {};
  for (const g of gasto) real[g.categoria] = (real[g.categoria] ?? 0) + g.monto;
  const dias = Number(finDeMes(mes).slice(8, 10));
  const avanceMes = enCurso ? Math.round((Number(hoy.slice(8, 10)) / dias) * 1000) / 10 : futuro ? 0 : 100;
  return armarSede({
    businessId: bId, sede, lineas: plan.lineas, ventaEsperada: plan.cab?.ventaEsperada ?? null,
    ventaReal: ventas.get(mes) ?? null, real,
  }, { enCurso, avanceMes });
}

export const NOMBRE_SEDE: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

/** El semáforo del presupuesto en el idioma de los reportes viejos (verde / amarillo / rojo). */
export const colorDe = (s: string): "green" | "yellow" | "red" => (s === "rojo" ? "red" : s === "ambar" ? "yellow" : "green");

/** Las categorías con presupuesto (o con gasto fuera del plan) de una sede, en una lista plana. */
export function categoriasPresupuestadas(f: FilaSede) {
  return f.areas.filter((a) => a.area.bloque !== "fuera").flatMap((a) => a.categorias);
}
