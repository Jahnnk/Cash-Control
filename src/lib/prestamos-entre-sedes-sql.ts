import type { NeonQueryFunction } from "@neondatabase/serverless";
import { armarPrestamosEntreSedes, type PrestamoEntreSedes } from "./prestamos-entre-sedes";

const SEDES: Record<number, string> = { 2: "Fonavi", 3: "Centro" };

/** Préstamos de Fonavi y Centro a Atelier con lo devuelto y lo que falta. Nunca lanza: si algo falla, lista vacía. */
export async function leerPrestamosEntreSedes(sql: NeonQueryFunction<false, false>): Promise<PrestamoEntreSedes[]> {
  try {
    const [dados, cuotas] = await Promise.all([
      sql`
        SELECT business_id AS "prestamistaId", date::text AS fecha, amount::float AS monto FROM expenses
        WHERE business_id IN (2, 3) AND archived = false AND category = 'PRÉSTAMOS ENTRE SEDES'
          AND concept ILIKE 'PRESTAMO A ATELIER%'
      ` as unknown as Promise<{ prestamistaId: number; fecha: string; monto: number }[]>,
      sql`
        SELECT business_id AS "prestamistaId", date::text AS fecha, amount::float AS monto FROM bank_income_items
        WHERE business_id IN (2, 3) AND archived = false AND is_special_loan = false AND is_internal_transfer = false
          AND note ILIKE '%pr_stamo%' AND note ILIKE '%cuota%'
      ` as unknown as Promise<{ prestamistaId: number; fecha: string; monto: number }[]>,
    ]);
    return armarPrestamosEntreSedes(dados.map((d) => ({ ...d, prestamista: SEDES[d.prestamistaId] ?? "Sede" })), cuotas);
  } catch {
    return [];
  }
}
