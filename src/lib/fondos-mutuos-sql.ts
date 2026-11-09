import type { NeonQueryFunction } from "@neondatabase/serverless";
import { estadoDelFondo, type EstadoFondo, type NotaFondo } from "./fondos-mutuos";

/**
 * El estado del fondo mutuo de una sede: lo último que anotó Jahnn y lo que se movió desde esa fecha.
 * Mismos filtros que el flujo de caja (lib/flujo-caja): depósito = gasto AHORRO; rescate = ingreso con «rescate» en la nota.
 * Nunca lanza: si la tabla no está, devuelve «sin anotar».
 */
export async function leerFondo(sql: NeonQueryFunction<false, false>, bId: number): Promise<EstadoFondo> {
  try {
    const n = (await sql`
      SELECT saldo::float AS saldo, fecha::text AS fecha FROM fondos_mutuos_saldo
      WHERE business_id = ${bId} ORDER BY fecha DESC LIMIT 1
    `) as NotaFondo[];
    const nota = n[0] ?? null;
    if (!nota) return estadoDelFondo(null, 0, 0);
    const [dep, res] = await Promise.all([
      sql`
        SELECT COALESCE(SUM(amount), 0)::float AS t FROM expenses
        WHERE business_id = ${bId} AND date > ${nota.fecha} AND archived = false AND category = 'AHORRO'
          AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
          AND payment_method NOT IN ('pendiente_atelier', 'socio')
      ` as unknown as Promise<{ t: number }[]>,
      sql`
        SELECT COALESCE(SUM(amount), 0)::float AS t FROM bank_income_items
        WHERE business_id = ${bId} AND date > ${nota.fecha} AND archived = false
          AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
          AND note ILIKE '%rescate%'
      ` as unknown as Promise<{ t: number }[]>,
    ]);
    return estadoDelFondo(nota, dep[0]?.t ?? 0, res[0]?.t ?? 0);
  } catch {
    return estadoDelFondo(null, 0, 0);
  }
}
