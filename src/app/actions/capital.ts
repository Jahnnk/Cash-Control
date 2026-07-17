"use server";

/**
 * Capital inyectado · la respuesta permanente a "¿cuánto he metido yo
 * al negocio y cuánto entró que no es venta?" (pregunta de Jahnn,
 * jul-2026 — los datos existían pero dispersos en el feed de
 * movimientos).
 *
 * Fuentes (mismas definiciones que el resto del sistema):
 *  - Aportes de socios / Venta de activos / Préstamos-financiamiento:
 *    bank_income_items.non_operative_category (ya EXCLUIDOS de ventas,
 *    EBITDA y equilibrio por diseño — aquí solo se SUMAN y muestran).
 *  - Préstamos socio: is_special_loan (idéntico a getLoansSummary de
 *    la página Préstamos Socio: prestado − devuelto = pendiente; sin
 *    filtro de archived, para que ambas pantallas cuadren siempre).
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { activeBusinessId } from "@/lib/active-business";
import { requireFullSession } from "@/lib/session-access";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type CapitalItem = { date: string; amount: number; note: string };

export type CapitalInjections = {
  /** Aportes tuyos que NO se devuelven (condonados). */
  aportes: { total: number; items: CapitalItem[] };
  /** Préstamos socio: prestado − devuelto = pendiente. */
  socio: { prestado: number; devuelto: number; pendiente: number; items: CapitalItem[] };
  /** Otros financiamientos recibidos (clasificados a mano). */
  financiamiento: { total: number; items: CapitalItem[] };
  /** Ventas de activos (congeladora, equipos…): entra plata, no es venta. */
  ventaActivos: { total: number; items: CapitalItem[] };
  /** Todo lo que has puesto tú: aportes + prestado + financiamiento. */
  totalTuyo: number;
};

export async function getCapitalInjections(): Promise<
  | { ok: true; data: CapitalInjections }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "Solo dirección." };
  }
  const bId = await activeBusinessId();
  try {
    const nonOp = (await db.execute(sql`
      SELECT date::text AS date, amount::float AS amount,
             COALESCE(note, '') AS note, non_operative_category AS cat
      FROM bank_income_items
      WHERE business_id = ${bId} AND archived = false
        AND non_operative_category IN ('Aportes de socios', 'Venta de activos', 'Préstamos / financiamiento recibido')
      ORDER BY date DESC
    `)).rows as { date: string; amount: number; note: string; cat: string }[];

    const pick = (cat: string): { total: number; items: CapitalItem[] } => {
      const items = nonOp
        .filter((r) => r.cat === cat)
        .map((r) => ({ date: r.date, amount: r2(Number(r.amount)), note: r.note }));
      return { total: r2(items.reduce((s, i) => s + i.amount, 0)), items };
    };
    const aportes = pick("Aportes de socios");
    const ventaActivos = pick("Venta de activos");
    const financiamiento = pick("Préstamos / financiamiento recibido");

    // Préstamos socio — misma cuenta que la página Préstamos Socio.
    const loans = (await db.execute(sql`
      SELECT date::text AS date, amount::float AS amount, COALESCE(note, 'Préstamo del socio') AS note
      FROM bank_income_items WHERE business_id = ${bId} AND is_special_loan = true
      ORDER BY date DESC
    `)).rows as CapitalItem[];
    const refunds = (await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::float AS t
      FROM expenses WHERE business_id = ${bId} AND is_special_loan = true
    `)).rows[0] as { t: number };

    const prestado = r2(loans.reduce((s, l) => s + Number(l.amount), 0));
    const devuelto = r2(Number(refunds.t));

    return {
      ok: true,
      data: {
        aportes,
        socio: {
          prestado,
          devuelto,
          pendiente: r2(prestado - devuelto),
          items: loans.map((l) => ({ date: l.date, amount: r2(Number(l.amount)), note: l.note })),
        },
        financiamiento,
        ventaActivos,
        totalTuyo: r2(aportes.total + prestado + financiamiento.total),
      },
    };
  } catch (err) {
    console.error("[getCapitalInjections] failed:", err);
    return { ok: false, error: "No pude leer el capital inyectado." };
  }
}
