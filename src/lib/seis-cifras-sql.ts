/**
 * La LECTURA de las seis cifras de una sede en un mes (solo SELECT). El cálculo vive en lib/seis-cifras-mes.ts.
 *
 * La usan getSeisCifras (dashboard y reportes), el punto de equilibrio (app/actions/breakeven.ts) y los controles
 * de fiabilidad: los tres leen lo mismo y calculan con lo mismo.
 */

import { loadVentaRowsBlended } from "./kpis/ventas-loader";
import { recuperosDelPeriodo } from "./recuperos-sql";
import { cifrasDelMes, cortesDelMes, type DatosMesSede, type GastoMes, type IngresoMes } from "./seis-cifras-mes";
import type { AvisoImportador } from "./revisar-tipo";
import type { CifrasSede } from "./seis-cifras";

/** Firma mínima del template tag de @neondatabase/serverless. */
type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

export const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

export function finDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export async function leerDatosMesSede(sql: SqlTag, bId: number, sede: string, mes: string, hoy = hoyLima()): Promise<DatosMesSede> {
  const inicio = `${mes}-01`;
  const finDeMes = finDelMes(mes);
  const hastaHoy = finDeMes < hoy ? finDeMes : hoy;

  // Hasta dónde llega el Excel de esta sede en el mes.
  const c = (await sql`
    SELECT MAX(d)::text AS corte FROM (
      SELECT MAX(date) AS d FROM expenses
        WHERE business_id = ${bId} AND imported_from_excel = true AND archived = false AND date BETWEEN ${inicio} AND ${hastaHoy}
      UNION ALL
      SELECT MAX(date) FROM bank_income_items
        WHERE business_id = ${bId} AND imported_from_excel = true AND archived = false AND date BETWEEN ${inicio} AND ${hastaHoy}
    ) x
  `) as { corte: string | null }[];
  let corteExcel = c[0]?.corte ?? null;
  const fuenteExcel = corteExcel !== null;
  // Meses que se llenaron a mano (Atelier abr–jul 2026, antes del Excel): si el mes ya cerró y hay movimientos,
  // se mide hasta el último día con datos (auditoría abr–set, 16-oct-2026).
  if (corteExcel === null && finDeMes < hoy) {
    const man = (await sql`
      SELECT MAX(d)::text AS corte FROM (
        SELECT MAX(date) AS d FROM expenses WHERE business_id = ${bId} AND archived = false AND date BETWEEN ${inicio} AND ${finDeMes}
        UNION ALL
        SELECT MAX(date) FROM bank_income_items WHERE business_id = ${bId} AND archived = false AND date BETWEEN ${inicio} AND ${finDeMes}
      ) x
    `) as { corte: string | null }[];
    corteExcel = man[0]?.corte ?? null;
  }

  const [gastos, ingresos, ventas, avisos] = await Promise.all([
    sql`
      SELECT id::text, date::text AS fecha, category AS categoria, concept AS concepto, amount::float AS monto,
             (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS propio,
             payment_method AS metodo, is_special_loan AS "prestamoSocio", loan_via_bank AS "viaBanco",
             is_internal_transfer AS "transferenciaInterna", imported_from_excel AS importado
      FROM expenses
      WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${hastaHoy} AND archived = false
      ORDER BY date, sort_order, created_at, id
    ` as unknown as Promise<GastoMes[]>,
    sql`
      SELECT id::text, date::text AS fecha, amount::float AS monto, note AS nota, payment_method AS metodo,
             is_byte_sale AS venta, is_fonavi_reimbursement AS reembolso, non_operative_category AS "noOperativo",
             is_special_loan AS "prestamoSocio", loan_via_bank AS "viaBanco", is_internal_transfer AS "transferenciaInterna",
             imported_from_excel AS importado
      FROM bank_income_items
      WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${hastaHoy} AND archived = false
      ORDER BY date, sort_order, created_at, id
    ` as unknown as Promise<IngresoMes[]>,
    loadVentaRowsBlended(sql, bId, inicio, hastaHoy),
    // Los avisos de las cargas que dejaron filas en el mes (las vigentes).
    sql`
      SELECT b.warnings_json FROM import_batches b
      WHERE b.id IN (
        SELECT import_batch_id FROM expenses WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${hastaHoy} AND archived = false AND import_batch_id IS NOT NULL
        UNION
        SELECT import_batch_id FROM bank_income_items WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${hastaHoy} AND archived = false AND import_batch_id IS NOT NULL
      )
    ` as unknown as Promise<{ warnings_json: unknown }[]>,
  ]);

  const datos: DatosMesSede = {
    businessId: bId, sede, mes, finDeMes, hoy, hastaHoy, corteExcel, fuenteExcel,
    gastos: gastos.map((g) => ({ ...g, monto: Number(g.monto), propio: Number(g.propio) })),
    ingresos: ingresos.map((i) => ({ ...i, monto: Number(i.monto) })),
    ventas: ventas.rows,
    recuperos: {},
    avisos: avisos.flatMap((a) => (Array.isArray(a.warnings_json) ? a.warnings_json : []))
      .filter((w): w is AvisoImportador => typeof w === "object" && w !== null),
  };
  for (const corte of cortesDelMes(datos)) datos.recuperos[corte] = await recuperosDelPeriodo(sql, bId, inicio, corte);
  return datos;
}

/** Leer y calcular: las seis cifras de una sede en un mes. */
export async function cifrasDeSedeEnMes(sql: SqlTag, bId: number, sede: string, mes: string, hoy?: string): Promise<CifrasSede> {
  return cifrasDelMes(await leerDatosMesSede(sql, bId, sede, mes, hoy));
}
