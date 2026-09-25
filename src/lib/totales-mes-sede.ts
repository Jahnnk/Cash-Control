/**
 * Ingresos y gastos del mes de una sede · la ÚNICA definición.
 *
 * La usan Grupo → Resumen (tarjetas de sede) y la verificación automática
 * contra el Excel de Kelly (verificacion-kelly.ts). Si cada una calculara
 * por su lado, podrían no coincidir y el control no serviría: por eso el
 * puente de la verificación tiene que terminar EXACTAMENTE en este número.
 *
 *   Ingresos = lo que entró, menos reembolsos entre sedes, préstamos del
 *              socio, transferencias internas e ingresos no operativos
 *              (préstamos recibidos, venta de activos, aportes…).
 *   Gastos   = lo que salió, con la parte PROPIA de los gastos compartidos
 *              (la de Atelier), sin préstamos del socio ni transferencias.
 *   Deuda y ahorro = la parte de Gastos que son cuotas, ahorro o préstamos
 *              a otra sede (CATEGORIAS_DEUDA_Y_AHORRO).
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { CATEGORIAS_DEUDA_Y_AHORRO } from "./reglas-gasto";

export type TotalesMesSede = { ingresos: number; gastos: number; deudaAhorro: number };

export async function totalesMesSede(bId: number, desde: string, hasta: string): Promise<TotalesMesSede> {
  const [ing, gas] = await Promise.all([
    db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) AS t FROM bank_income_items
      WHERE business_id = ${bId} AND date >= ${desde} AND date <= ${hasta}
        AND is_fonavi_reimbursement = false AND is_special_loan = false AND is_internal_transfer = false
        AND archived = false AND non_operative_category IS NULL
    `),
    db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END), 0) AS t,
        COALESCE(SUM(CASE WHEN category IN (${sql.join(CATEGORIAS_DEUDA_Y_AHORRO.map((c) => sql`${c}`), sql`, `)})
          THEN (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END) ELSE 0 END), 0) AS d
      FROM expenses
      WHERE business_id = ${bId} AND date >= ${desde} AND date <= ${hasta}
        AND is_special_loan = false AND is_internal_transfer = false AND archived = false
    `),
  ]);
  const g = gas.rows[0] as { t: string; d: string };
  return {
    ingresos: parseFloat((ing.rows[0] as { t: string }).t),
    gastos: parseFloat(g.t),
    deudaAhorro: parseFloat(g.d),
  };
}
