"use server";

/**
 * La liquidez del grupo, para quien la necesite.
 *
 * ÚNICA fuente: el dashboard, el panel de presupuesto y cualquier
 * pantalla futura leen de acá. El 10-sep-2026 hubo dos cifras distintas
 * en la misma pantalla (S/2,472 y S/16,747) porque había dos cálculos;
 * este archivo existe para que no vuelva a pasar.
 *
 * La decisión de qué manda —lo declarado sobre lo derivado— vive en el
 * motor puro `lib/liquidez.ts`. Acá solo se recolecta.
 */

import { neon } from "@neondatabase/serverless";
import { calcularLiquidez, type EntradaSede, type LiquidezGrupo } from "@/lib/liquidez";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: { id: number; nombre: string }[] = [
  { id: 1, nombre: "Atelier" },
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
];

const todayLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

/** Efectivo acumulado a una fecha: caja inicial + entradas − salidas. */
async function cajaA(bId: number, hasta: string): Promise<number> {
  const r = (await sql`
    SELECT (
      COALESCE((SELECT initial_cash_balance FROM businesses WHERE id = ${bId}), 0)
      + COALESCE((SELECT SUM(amount) FROM bank_income_items
          WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date <= ${hasta}), 0)
      - COALESCE((SELECT SUM(amount) FROM expenses
          WHERE business_id = ${bId} AND payment_method = 'efectivo' AND archived = false AND date <= ${hasta}), 0)
    )::float AS c
  `) as { c: number }[];
  return Number(r[0].c);
}

/**
 * El arrastre desde el ancla: el último saldo conocido más los
 * movimientos que NO son efectivo. Es el método que ya usaba el
 * dashboard; se conserva como estimación cuando no hay saldo declarado.
 */
async function derivado(bId: number, hoy: string): Promise<EntradaSede["derivado"]> {
  let ancla = (await sql`
    SELECT bank_balance_real::float AS saldo, date::text AS fecha
    FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND archived = false
    ORDER BY date DESC LIMIT 1
  `) as { saldo: number; fecha: string }[];

  if (ancla.length === 0) {
    ancla = (await sql`
      SELECT initial_bcp_balance::float AS saldo, initial_balance_date::text AS fecha
      FROM businesses
      WHERE id = ${bId} AND system_start_date IS NOT NULL AND initial_balance_date IS NOT NULL
    `) as { saldo: number; fecha: string }[];
  }
  if (ancla.length === 0) return null;

  const { saldo, fecha } = ancla[0];
  const mov = (await sql`
    SELECT
      COALESCE((SELECT SUM(amount) FROM bank_income_items
        WHERE business_id = ${bId} AND date > ${fecha} AND date <= ${hoy}
          AND (is_special_loan = false OR loan_via_bank = true)
          AND payment_method <> 'efectivo' AND archived = false), 0)::float AS entra,
      COALESCE((SELECT SUM(amount) FROM expenses
        WHERE business_id = ${bId} AND date > ${fecha} AND date <= ${hoy}
          AND payment_method NOT IN ('efectivo','pendiente_atelier','socio')
          AND (is_special_loan = false OR loan_via_bank = true) AND archived = false), 0)::float AS sale
  `) as { entra: number; sale: number }[];

  return {
    banco: Number(saldo) + Number(mov[0].entra) - Number(mov[0].sale),
    caja: await cajaA(bId, hoy),
    fechaAncla: fecha,
  };
}

/** Nunca lanza: una pantalla no se cae porque falte un saldo. */
export async function getLiquidezGrupo(): Promise<LiquidezGrupo | null> {
  try {
    const hoy = todayLima();
    const sedes: EntradaSede[] = await Promise.all(
      SEDES.map(async ({ id, nombre }) => {
        const dec = (await sql`
          SELECT fecha::text, banco::float AS banco, caja::float AS caja
          FROM sede_balances WHERE business_id = ${id} ORDER BY fecha DESC LIMIT 1
        `) as { fecha: string; banco: number | null; caja: number }[];
        return {
          businessId: id, nombre,
          declarado: dec.length > 0
            ? { banco: dec[0].banco === null ? null : Number(dec[0].banco), caja: Number(dec[0].caja), fecha: dec[0].fecha }
            : null,
          derivado: dec.length > 0 ? null : await derivado(id, hoy),
        };
      }),
    );
    return calcularLiquidez({ todayISO: hoy, sedes });
  } catch (err) {
    console.error("[getLiquidezGrupo] failed:", err);
    return null;
  }
}
