"use server";

/**
 * Flujo de caja mensual por sede · Action (solo dirección). Entró y salió
 * salen de totalesMesSede (la ÚNICA definición, la misma de la tarjeta Caja);
 * el ahorro, el rescate y las utilidades a socios solo explican el mes.
 * El cálculo del acumulado vive en lib/flujo-caja.ts.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { totalesMesSede } from "@/lib/totales-mes-sede";
import type { MesFlujo } from "@/lib/flujo-caja";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];

/** El primer mes con datos del sistema. */
const PRIMER_MES = "2026-03";

export type FlujoSede = { businessId: number; sede: string; meses: MesFlujo[] };
export type FlujoCaja = { mes: string; sedes: FlujoSede[] };

function mesesHasta(mes: string): string[] {
  const out: string[] = [];
  let [y, m] = PRIMER_MES.split("-").map(Number);
  while (`${y}-${String(m).padStart(2, "0")}` <= mes) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (m === 12) { y += 1; m = 1; } else m += 1;
  }
  return out;
}

const finDeMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export async function getFlujoCaja(mes: string): Promise<{ ok: true; data: FlujoCaja } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const meses = mesesHasta(mes);
  try {
    const sedes = await Promise.all(SEDES.map(async ([bId, sede]) => {
      const [totales, ahorros, rescates] = await Promise.all([
        Promise.all(meses.map((m) => totalesMesSede(bId, `${m}-01`, finDeMes(m) < hoy ? finDeMes(m) : hoy))),
        // Lo que salió a ahorro y a socios, mes a mes (mismos filtros que "salió").
        sql`
          SELECT to_char(date, 'YYYY-MM') AS mes,
                 COALESCE(SUM(amount) FILTER (WHERE category = 'AHORRO'), 0)::float AS ahorro,
                 COALESCE(SUM(amount) FILTER (WHERE category = 'UTILIDADES A SOCIOS'), 0)::float AS reparto
          FROM expenses
          WHERE business_id = ${bId} AND date BETWEEN ${`${PRIMER_MES}-01`} AND ${finDeMes(mes)} AND archived = false
            AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
            AND payment_method NOT IN ('pendiente_atelier', 'socio')
          GROUP BY 1
        ` as unknown as Promise<{ mes: string; ahorro: number; reparto: number }[]>,
        sql`
          SELECT to_char(date, 'YYYY-MM') AS mes, COALESCE(SUM(amount), 0)::float AS rescate
          FROM bank_income_items
          WHERE business_id = ${bId} AND date BETWEEN ${`${PRIMER_MES}-01`} AND ${finDeMes(mes)} AND archived = false
            AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
            AND note ILIKE '%rescate%'
          GROUP BY 1
        ` as unknown as Promise<{ mes: string; rescate: number }[]>,
      ]);
      return {
        businessId: bId, sede,
        meses: meses.map((m, i): MesFlujo => ({
          mes: m, entro: totales[i].entro, salio: totales[i].salio,
          ahorro: ahorros.find((x) => x.mes === m)?.ahorro ?? 0,
          reparto: ahorros.find((x) => x.mes === m)?.reparto ?? 0,
          rescate: rescates.find((x) => x.mes === m)?.rescate ?? 0,
        })),
      };
    }));
    return { ok: true, data: { mes, sedes } };
  } catch (e) {
    console.error("[getFlujoCaja] failed:", e);
    return { ok: false, error: "No se pudo calcular el flujo de caja." };
  }
}
