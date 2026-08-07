"use server";

/**
 * Cuadre contra el extracto del BCP.
 *
 * Nació de la auditoría de las socias (ago-2026): Kelly tenía que armar en
 * Excel, día por día, algo que el sistema podía calcular solo — y sin una
 * cifra comparable terminaba restando "Egresos totales" contra el extracto,
 * que miden cosas distintas.
 *
 * La regla que manda acá es la PRUEBA DEL SALDO:
 *
 *     saldo de ayer + lo que entró al banco − lo que salió = saldo de hoy
 *
 * El saldo lo copia Jahnn del BCP cada mañana, así que es el dato más duro
 * que existe. Si un día cuadra, los movimientos de ese día están completos.
 * Cuando el extracto y el saldo se contradicen, gana el saldo: es el mismo
 * banco, pero sin depender de que una suma manual esté completa (pasó dos
 * veces en la auditoría — en ambas faltaban movimientos en la suma, no en
 * el sistema).
 *
 * "Tocó el banco" NO es lo mismo que "es gasto del negocio":
 *  - se INCLUYEN las devoluciones de préstamos del socio: salen de la cuenta
 *    aunque no sean gasto (esto hizo parecer que el 15-jun no cuadraba);
 *  - se EXCLUYE el efectivo, que nunca aparece en un extracto bancario;
 *  - de los gastos compartidos se toma el monto COMPLETO, no la porción de
 *    la sede: del banco sale entero aunque el costo se reparta después.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { activeBusinessId } from "@/lib/active-business";

export type BcpDay = {
  date: string;
  ingresos: number;
  egresos: number;
  saldoEsperado: number | null;
  saldoReal: number | null;
  descuadre: number | null;
};

export type BcpReconciliation = {
  month: string;
  saldoInicial: number | null;
  saldoInicialFecha: string | null;
  saldoFinal: number | null;
  saldoFinalFecha: string | null;
  ingresos: number;
  egresos: number;
  /** ingresos − egresos, lo que el sistema dice que se movió la cuenta */
  variacionSistema: number;
  /** saldoFinal − saldoInicial, lo que la cuenta se movió de verdad */
  variacionReal: number | null;
  /** Días con descuadre contra el saldo. Vacío = el mes está probado. */
  diasConDescuadre: BcpDay[];
  diasVerificados: number;
  days: BcpDay[];
  /** Movimientos que salieron/entraron sin explicar qué son. */
  sinDescripcion: { ingresos: number; ingresosMonto: number; egresos: number };
};

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function getBcpReconciliation(month: string): Promise<BcpReconciliation> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Mes inválido (YYYY-MM)");
  const bId = await activeBusinessId();
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  // Saldo de arranque: el último anotado ANTES del mes. Si no existe (el
  // primer mes cargado), no hay contra qué probar y se avisa en la UI.
  const prev = (await db.execute(sql`
    SELECT date::text AS date, bank_balance_real::float AS saldo FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND archived = false
      AND date < ${start}
    ORDER BY date DESC LIMIT 1
  `)).rows[0] as { date: string; saldo: number } | undefined;

  const last = (await db.execute(sql`
    SELECT date::text AS date, bank_balance_real::float AS saldo FROM daily_records
    WHERE business_id = ${bId} AND bank_balance_real IS NOT NULL AND archived = false
      AND date BETWEEN ${start} AND ${end}
    ORDER BY date DESC LIMIT 1
  `)).rows[0] as { date: string; saldo: number } | undefined;

  const rows = (await db.execute(sql`
    SELECT
      d::text AS date,
      COALESCE((
        SELECT SUM(amount) FROM bank_income_items
        WHERE business_id = ${bId} AND date = d AND archived = false
          AND payment_method <> 'efectivo'
          AND (is_special_loan = false OR loan_via_bank = true)
      ), 0)::float AS ingresos,
      COALESCE((
        SELECT SUM(amount) FROM expenses
        WHERE business_id = ${bId} AND date = d AND archived = false
          AND payment_method IN ('transferencia', 'yape')
      ), 0)::float AS egresos,
      (
        SELECT bank_balance_real::float FROM daily_records
        WHERE business_id = ${bId} AND date = d AND archived = false
      ) AS saldo_real
    FROM generate_series(${start}::date, ${end}::date, '1 day') d
    ORDER BY d
  `)).rows as { date: string; ingresos: number; egresos: number; saldo_real: number | null }[];

  const days: BcpDay[] = [];
  let anterior: number | null = prev ? num(prev.saldo) : null;
  let verificados = 0;
  for (const row of rows) {
    const fecha = row.date.slice(0, 10);
    const ingresos = r2(num(row.ingresos));
    const egresos = r2(num(row.egresos));
    const saldoReal = row.saldo_real === null ? null : r2(num(row.saldo_real));
    const saldoEsperado = anterior === null ? null : r2(anterior + ingresos - egresos);
    const descuadre =
      saldoEsperado === null || saldoReal === null ? null : r2(saldoReal - saldoEsperado);
    if (descuadre !== null) verificados++;
    days.push({ date: fecha, ingresos, egresos, saldoEsperado, saldoReal, descuadre });
    // La cadena sigue por el saldo REAL: un día sin anotar no rompe los siguientes.
    if (saldoReal !== null) anterior = saldoReal;
  }

  const totales = days.reduce(
    (acc, d) => ({ ing: acc.ing + d.ingresos, egr: acc.egr + d.egresos }),
    { ing: 0, egr: 0 },
  );

  const sd = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM bank_income_items WHERE business_id = ${bId}
         AND date BETWEEN ${start} AND ${end} AND archived = false
         AND payment_method <> 'efectivo' AND (note IS NULL OR trim(note) = ''))::int AS ing_n,
      (SELECT COALESCE(SUM(amount), 0) FROM bank_income_items WHERE business_id = ${bId}
         AND date BETWEEN ${start} AND ${end} AND archived = false
         AND payment_method <> 'efectivo' AND (note IS NULL OR trim(note) = ''))::float AS ing_t,
      (SELECT COUNT(*) FROM expenses WHERE business_id = ${bId}
         AND date BETWEEN ${start} AND ${end} AND archived = false
         AND payment_method IN ('transferencia','yape')
         AND (concept IS NULL OR trim(concept) = '' OR category ILIKE 'desconocid%'))::int AS egr_n
  `)).rows[0] as { ing_n: number; ing_t: number; egr_n: number };

  const saldoInicial = prev ? r2(num(prev.saldo)) : null;
  const saldoFinal = last ? r2(num(last.saldo)) : null;

  return {
    month,
    saldoInicial,
    saldoInicialFecha: prev?.date.slice(0, 10) ?? null,
    saldoFinal,
    saldoFinalFecha: last?.date.slice(0, 10) ?? null,
    ingresos: r2(totales.ing),
    egresos: r2(totales.egr),
    variacionSistema: r2(totales.ing - totales.egr),
    variacionReal:
      saldoInicial === null || saldoFinal === null ? null : r2(saldoFinal - saldoInicial),
    diasConDescuadre: days.filter((d) => d.descuadre !== null && Math.abs(d.descuadre) > 0.005),
    diasVerificados: verificados,
    days: days.filter((d) => d.ingresos !== 0 || d.egresos !== 0 || d.saldoReal !== null),
    sinDescripcion: {
      ingresos: sd.ing_n,
      ingresosMonto: r2(num(sd.ing_t)),
      egresos: sd.egr_n,
    },
  };
}
