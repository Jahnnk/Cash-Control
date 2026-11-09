import type { NeonQueryFunction } from "@neondatabase/serverless";
import { armarFinanciamientos, type Financiamiento, type PagoDeuda, type EstadoFinanciamiento } from "./financiamientos";

const SEDE: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

/** Las deudas activas con lo pagado. Nunca lanza: si la tabla no existe todavía, devuelve vacío. */
export async function leerFinanciamientos(sql: NeonQueryFunction<false, false>): Promise<{ deudas: EstadoFinanciamiento[]; sinDeuda: PagoDeuda[] }> {
  try {
    const filas = (await sql`
      SELECT id, business_id AS "businessId", nombre, acreedor, patron, dia_pago AS "diaPago", cuota::float AS cuota,
             monto_original::float AS "montoOriginal", cuotas_total AS "cuotasTotal", incluye_intereses AS "incluyeIntereses", desde::text AS desde
      FROM financiamientos WHERE activo = true ORDER BY business_id, id
    `) as Omit<Financiamiento, "sede">[];
    if (filas.length === 0) return { deudas: [], sinDeuda: [] };
    const pagos = (await sql`
      SELECT business_id AS "businessId", date::text AS fecha, amount::float AS monto, concept AS concepto FROM expenses
      WHERE archived = false AND category = 'PRÉSTAMOS Y TARJETAS' AND is_internal_transfer = false AND is_special_loan = false
        AND business_id = ANY(${[...new Set(filas.map((f) => f.businessId))]})
        -- Las cuotas que Atelier devuelve a Fonavi y Centro tienen su propia tarjeta (préstamos entre sedes).
        AND concept NOT ILIKE '%GASTRONOMIC%'
    `) as PagoDeuda[];
    return armarFinanciamientos(filas.map((f) => ({ ...f, sede: SEDE[f.businessId] ?? "Sede" })), pagos);
  } catch {
    return { deudas: [], sinDeuda: [] };
  }
}
