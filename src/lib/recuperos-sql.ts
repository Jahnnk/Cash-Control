/**
 * Las devoluciones que restan del gasto, leídas de la base · el MISMO cálculo para toda pantalla que sume
 * gastos (Fase 1 de «una sola fuente», 16-oct-2026): seis cifras, Gastos por categoría y deck, Punto de
 * equilibrio, Presupuesto real, reporte fijo/variable y reporte ejecutivo. Antes solo las seis cifras
 * restaban lo que otras sedes o personas devolvían, y la planilla de Fonavi podía decir dos cifras.
 * La regla vive en lib/recuperos-entre-sedes.ts; aquí solo se leen los datos.
 *
 * No lo usa nada del bono por ticket ni el candado de ventas (solo ventas, no gastos).
 */

import { recuperosDeOtrasSedes, devolucionesDeGastos, type DevolucionRecibida, type GastoDeLaSede, type GastoRepartido, type Recupero } from "./recuperos-entre-sedes";
import { CATEGORIAS_FUERA_DE_OPERACION, tipoDeCategoria } from "./reglas-gasto";

/** Firma mínima del template tag de @neondatabase/serverless. */
type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

export type RecuperosDelPeriodo = {
  /** Todas las que restan del gasto (otras sedes + personas), con su categoría y fecha. */
  recuperos: Recupero[];
  /** Solo las de personas: además de restar del gasto, dejan de ser «otros ingresos». */
  deGastos: Recupero[];
};

/**
 * Mes por mes: emparejar una devolución con «su» gasto repartido depende de la ventana que se mire (el
 * alquiler de S/900 se repite cada mes), así que cada mes se resuelve solo. Así un informe de 4 meses da,
 * para cada mes, exactamente lo mismo que las seis cifras de ese mes.
 */
export async function recuperosDelPeriodo(sql: SqlTag, bId: number, desde: string, hasta: string): Promise<RecuperosDelPeriodo> {
  const tramos: [string, string][] = [];
  for (let d = desde; d <= hasta;) {
    const [y, m] = d.split("-").map(Number);
    const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    tramos.push([d, fin < hasta ? fin : hasta]);
    d = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }
  const partes = await Promise.all(tramos.map(([a, b]) => recuperosDeUnMes(sql, bId, a, b)));
  return { recuperos: partes.flatMap((p) => p.recuperos), deGastos: partes.flatMap((p) => p.deGastos) };
}

async function recuperosDeUnMes(sql: SqlTag, bId: number, desde: string, hasta: string): Promise<RecuperosDelPeriodo> {
  const [devoluciones, repartidos, otrosOp, gastos] = await Promise.all([
    sql`
      SELECT date::text AS fecha, amount::float AS monto, COALESCE(note, '') AS nota FROM bank_income_items
      WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} AND archived = false AND is_fonavi_reimbursement = true
        -- Una fila con Grupo «Ventas» es venta aunque su nota parezca un reembolso (A4, 24-oct-2026).
        AND is_byte_sale = false
    ` as Promise<DevolucionRecibida[]>,
    sql`
      SELECT date::text AS fecha, (amount - COALESCE(atelier_amount, amount))::float AS otras FROM expenses
      WHERE business_id = ${bId} AND archived = false AND is_shared = true
        AND date BETWEEN (${desde}::date - 45) AND (${hasta}::date + 45) AND amount - COALESCE(atelier_amount, amount) > 0
    ` as Promise<GastoRepartido[]>,
    sql`
      SELECT date::text AS fecha, amount::float AS monto, COALESCE(note, '') AS nota FROM bank_income_items
      WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} AND archived = false AND is_byte_sale = false
        AND is_fonavi_reimbursement = false AND is_special_loan = false AND is_internal_transfer = false AND non_operative_category IS NULL
    ` as Promise<DevolucionRecibida[]>,
    // Gastos de la sede que una devolución por «pago mal ejecutado» puede estar devolviendo (25-oct-2026).
    sql`
      SELECT date::text AS fecha, amount::float AS monto, category AS categoria, COALESCE(concept, '') AS concepto FROM expenses
      WHERE business_id = ${bId} AND archived = false AND is_shared = false AND is_internal_transfer = false
        AND date BETWEEN (${desde}::date - 45) AND ${hasta}
      ORDER BY date, sort_order, created_at
    ` as Promise<GastoDeLaSede[]>,
  ]);
  const deGastos = devolucionesDeGastos(otrosOp);
  // Solo gastos de la operación (fijos, variables o sin aclarar): lo que está en DEVOLUCIONES ya no es gasto.
  const operacion = gastos.filter((g) => { const t = tipoDeCategoria(g.categoria); return t === null || t === "Fijo" || t === "Variable" || t === "Desconocido"; });
  return { recuperos: [...recuperosDeOtrasSedes(devoluciones, repartidos, operacion), ...deGastos], deGastos };
}

/** Suma de una lista de recuperos (S/, 2 decimales). */
export const totalRecuperos = (rs: Recupero[]) => Math.round(rs.reduce((t, r) => t + r.monto, 0) * 100) / 100;

/**
 * Lo que restan las devoluciones por categoría, solo en las categorías de la operación (lista única).
 * Clave = categoría, valor = S/ a restar.
 */
export async function recuperosOperativosPorCategoria(sql: SqlTag, bId: number, desde: string, hasta: string): Promise<Map<string, number>> {
  const rec = await recuperosDelPeriodo(sql, bId, desde, hasta);
  const fuera = new Set(CATEGORIAS_FUERA_DE_OPERACION);
  const m = new Map<string, number>();
  for (const r of rec.recuperos) if (!fuera.has(r.categoria)) m.set(r.categoria, Math.round(((m.get(r.categoria) ?? 0) + r.monto) * 100) / 100);
  return m;
}
