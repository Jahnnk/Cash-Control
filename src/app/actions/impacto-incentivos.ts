"use server";

/**
 * Los datos de la lámina "¿el bono por ticket se paga solo?".
 *
 * Junta lo que ya vive en el sistema —registro diario de las cafeterías,
 * egresos clasificados y la liquidación del mes— y se lo pasa al motor
 * puro `evaluarImpacto`. Acá no se decide nada: solo se recolecta.
 *
 * Los SUPUESTOS DE MARGEN son lo único que merece explicación. Se
 * calculan tres, del más optimista al más conservador, y ninguno se
 * elige a dedo:
 *
 *   1. El del programa — el que está en la política vigente.
 *   2. Contable de dos meses — costos variables sobre ventas del mes
 *      base + el actual. Dos meses y no uno porque el Excel de Kelly
 *      registra la COMPRA el día que se paga: un mes que se abasteció
 *      de más parece pésimo y el siguiente parece buenísimo. En agosto
 *      de Centro esa distorsión fue enorme (42% de costo variable en
 *      julio contra 55% en agosto, vendiendo productos de MÁS margen).
 *   3. Contable del mes actual solo — el peor caso, con toda la
 *      distorsión de caja adentro. Si el programa aguanta este, aguanta.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { buildFixedVariable } from "@/lib/fixed-variable";
import {
  evaluarImpacto,
  type ImpactoIncentivos,
  type MesUpselling,
  type SupuestoMargen,
} from "@/lib/incentives/impacto";
import { bonoDeColaborador, type IncentiveLevel, type StaffMember } from "@/lib/incentives/engine";

const sql = neon(process.env.DATABASE_URL!);

/** Solo las cafeterías: Atelier no tiene programa de ticket. */
const CAFETERIAS: { id: number; nombre: string }[] = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
];

const mesAnterior = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const finDeMes = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

/**
 * Un mes de operación PRESENCIAL: sin delivery ni consumo del personal,
 * igual que el ticket del programa. Si se colaran, el ticket que mide
 * la lámina no sería el mismo que decide el bono.
 */
async function mesDe(bId: number, month: string): Promise<{ mes: MesUpselling; dias: number }> {
  const r = (await sql`
    SELECT COUNT(*) FILTER (WHERE revenue > 0)::int AS dias,
           COALESCE(SUM(personas - COALESCE(delivery_pedidos,0) - COALESCE(personal_pedidos,0)),0)::int AS personas,
           COALESCE(SUM(revenue - COALESCE(delivery_venta,0) - COALESCE(personal_venta,0)),0)::float AS venta,
           SUM(items)::int AS items
    FROM upselling_daily
    WHERE business_id = ${bId} AND date BETWEEN ${month + "-01"} AND ${finDeMes(month)}
      AND revenue > 0
  `) as { dias: number; personas: number; venta: number; items: number | null }[];
  const x = r[0];
  return {
    mes: { month, personas: x.personas, venta: x.venta, items: x.items },
    dias: x.dias,
  };
}

/** Costos variables sobre ventas de un rango de meses. null si no hay ventas. */
async function ratioVariable(bId: number, meses: string[]): Promise<number | null> {
  const cats = (await sql`
    SELECT name, exclude_from_ebitda, cost_group FROM expense_categories WHERE business_id = ${bId}
  `) as { name: string; exclude_from_ebitda: boolean; cost_group: string | null }[];
  let variables = 0;
  let ventas = 0;
  for (const m of meses) {
    const rows = (await sql`
      SELECT category, (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS amount
      FROM expenses
      WHERE business_id = ${bId} AND date BETWEEN ${m + "-01"} AND ${finDeMes(m)}
        AND is_special_loan = false AND is_internal_transfer = false AND archived = false
        AND payment_method <> 'pendiente_atelier'
    `) as { category: string; amount: number }[];
    const rep = buildFixedVariable(
      rows.map((r) => ({ category: r.category, amount: Number(r.amount) })),
      cats.map((c) => ({ name: c.name, excludeFromEbitda: c.exclude_from_ebitda, costGroup: c.cost_group })),
    );
    const v = (await sql`
      SELECT COALESCE(SUM(revenue),0)::float AS v FROM upselling_daily
      WHERE business_id = ${bId} AND date BETWEEN ${m + "-01"} AND ${finDeMes(m)}
    `) as { v: number }[];
    variables += rep.variable.total;
    ventas += v[0].v;
  }
  return ventas > 0 ? 1 - variables / ventas : null;
}

/**
 * El bono que se pagó (o se pagaría) ese mes. Sale de la MISMA función
 * que la liquidación real: si acá se recalculara distinto, la lámina
 * discutiría con el acta.
 */
async function bonoDelMes(bId: number, month: string): Promise<number> {
  const cfg = (await sql`
    SELECT ticket_base::float AS base, margin_pct::float AS margin, traffic_floor,
           pool_pct::float AS pool, levels
    FROM incentive_config WHERE business_id = ${bId} AND effective_month <= ${month}
    ORDER BY effective_month DESC LIMIT 1
  `) as { base: number; margin: number; traffic_floor: number; pool: number; levels: IncentiveLevel[] }[];
  if (cfg.length === 0) return 0;

  const { mes, dias } = await mesDe(bId, month);
  if (mes.personas === 0 || dias === 0) return 0;
  const ticket = mes.venta / mes.personas;
  const delta = ticket - cfg[0].base;
  const personasPorDia = mes.personas / dias;
  if (personasPorDia < cfg[0].traffic_floor) return 0;

  const nivel = [...cfg[0].levels]
    .sort((a, b) => a.delta - b.delta)
    .reverse()
    .find((l) => delta >= l.delta);
  if (!nivel) return 0;

  const staff = (await sql`
    SELECT name, jornada, area, horas_semanales::float AS "horasSemanales"
    FROM staff WHERE business_id = ${bId} AND active = true
  `) as StaffMember[];
  const bonos = staff.reduce((t, s) => t + bonoDeColaborador({ ...s, active: true }, nivel, month), 0);
  return Math.round((bonos + nivel.premio_mv) * 100) / 100;
}

export async function getImpactoIncentivos(month: string): Promise<
  { ok: true; data: ImpactoIncentivos[] } | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };

  try {
    const anterior = mesAnterior(month);
    const data = await Promise.all(
      CAFETERIAS.map(async ({ id, nombre }) => {
        const [base, actual, cfgRaw, ratio2, ratio1, bono] = await Promise.all([
          mesDe(id, anterior),
          mesDe(id, month),
          sql`SELECT margin_pct::float AS m FROM incentive_config
              WHERE business_id = ${id} AND effective_month <= ${month}
              ORDER BY effective_month DESC LIMIT 1`,
          ratioVariable(id, [anterior, month]),
          ratioVariable(id, [month]),
          bonoDelMes(id, month),
        ]);

        const cfg = cfgRaw as { m: number }[];

        // Del más optimista al más conservador, sin repetir supuestos que
        // caigan casi en el mismo número (la tabla se vuelve ruido).
        const crudos: SupuestoMargen[] = [
          ...(cfg.length > 0 ? [{ etiqueta: "El de la política vigente", margen: Number(cfg[0].m) }] : []),
          ...(ratio2 !== null ? [{ etiqueta: `Contable ${anterior.slice(5)}+${month.slice(5)} (compras/ventas)`, margen: ratio2 }] : []),
          ...(ratio1 !== null ? [{ etiqueta: `Contable solo ${month.slice(5)} (el peor caso)`, margen: ratio1 }] : []),
        ];
        const supuestos = crudos
          .sort((a, b) => b.margen - a.margen)
          .filter((s, i, arr) => i === 0 || Math.abs(s.margen - arr[i - 1].margen) > 0.01);

        return evaluarImpacto({
          sede: nombre,
          base: base.mes, actual: actual.mes,
          diasBase: base.dias, diasActual: actual.dias,
          bonoPagado: bono,
          supuestos,
        });
      }),
    );
    return { ok: true, data };
  } catch (err) {
    console.error("[getImpactoIncentivos] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al medir el impacto de incentivos" };
  }
}
