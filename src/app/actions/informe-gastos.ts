"use server";

/**
 * "¿A dónde se va la plata?" · Action (solo dirección). El cálculo vive en
 * lib/informe-gastos.ts; aquí solo se leen los datos.
 *
 *   · Gastos: las mismas filas que la cifra "salió" (lib/totales-mes-sede.ts),
 *     así los bolsillos suman lo mismo que el Excel.
 *   · Ventas: el cargador único de venta diaria (lib/kpis/ventas-loader.ts),
 *     el mismo del dashboard y del deck.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";
import { construirInformeSede, type InformeGastosSede, type GastoInforme } from "@/lib/informe-gastos";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];

function mesesAntes(mes: string, n: number): string[] {
  const [y, m] = mes.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 2 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function finDeMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** El último mes cerrado según la fecha de Lima. */
function ultimoMesCerrado(): string {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  return mesesAntes(hoy.slice(0, 7), 1)[0];
}

export type InformeGastos = { mes: string; sedes: InformeGastosSede[] };

export async function getInformeGastos(mesPedido?: string): Promise<{ ok: true; data: InformeGastos } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  const mes = mesPedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesPedido) ? mesPedido : ultimoMesCerrado();
  const previos = mesesAntes(mes, 3);
  const desde = `${previos[previos.length - 1]}-01`;
  const hasta = finDeMes(mes);
  try {
    const sedes = await Promise.all(SEDES.map(async ([bId, sede]) => {
      const [filas, ventas] = await Promise.all([
        sql`
          SELECT to_char(date, 'YYYY-MM') AS mes, date::text AS fecha, category AS categoria, concept AS concepto,
                 amount::float AS monto,
                 (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS propio,
                 imported_from_excel AS "deExcel"
          FROM expenses
          WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} AND archived = false
            AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
            AND payment_method NOT IN ('pendiente_atelier', 'socio')
        ` as unknown as Promise<GastoInforme[]>,
        loadVentaRowsBlended(sql, bId, desde, hasta),
      ]);
      const ventasPorMes: Record<string, number | null> = {};
      for (const m of [mes, ...previos]) {
        const t = ventas.rows.filter((r) => r.date.slice(0, 7) === m).reduce((s, r) => s + r.total, 0);
        ventasPorMes[m] = t > 0 ? t : null;
      }
      return construirInformeSede({ businessId: bId, sede, mes, mesesPrevios: previos, gastos: filas, ventasPorMes });
    }));
    return { ok: true, data: { mes, sedes } };
  } catch (e) {
    console.error("[getInformeGastos] failed:", e);
    return { ok: false, error: "No se pudo armar el informe de gastos." };
  }
}
