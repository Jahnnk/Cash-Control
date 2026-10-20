/**
 * Lee lo que anotan los administradores y lo que dice el reporte de Byte, y arma «Ventas al día» (19-oct-2026).
 * Lo comparten la vista de Grupo (action getVentasAlDia) y el cierre del bono (liquidations.ts): una sola lectura.
 * No es "use server": es una ayuda interna del servidor.
 */

import { DIAS_ESPERADOS } from "./config-sedes";
import { ventasAlDia, type VentasAlDia } from "./ventas-al-dia";

/** Firma mínima del template tag de @neondatabase/serverless. */
type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

export async function leerVentasAlDia(
  sql: SqlTag, mes: string, hoy: string, pausados: { businessId: number; fecha: string }[],
): Promise<VentasAlDia> {
  const [y, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`;
  const fin = `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const [negocios, admin, byte, byteHasta] = await Promise.all([
    sql`SELECT id, name FROM businesses ORDER BY id` as Promise<{ id: number; name: string }[]>,
    // Lo que anotó el administrador: Atelier en venta_admin; las cafeterías, el registro diario (si no vino del reporte de Byte).
    sql`
      SELECT business_id AS b, date::text AS fecha,
             COALESCE(venta_admin, CASE WHEN COALESCE(source, 'manual') <> 'import' THEN revenue END)::float AS total
      FROM upselling_daily WHERE date BETWEEN ${inicio} AND ${fin}
    ` as Promise<{ b: number; fecha: string; total: number | null }[]>,
    sql`
      SELECT business_id AS b, date::text AS fecha, total::float AS total FROM byte_ventas_efectiva
      WHERE date BETWEEN ${inicio} AND ${fin} AND total > 0 AND COALESCE(source, 'import') = 'import'
    ` as Promise<{ b: number; fecha: string; total: number }[]>,
    sql`
      SELECT business_id AS b, MAX(date)::text AS hasta FROM byte_ventas_efectiva
      WHERE total > 0 AND COALESCE(source, 'import') = 'import' GROUP BY 1
    ` as Promise<{ b: number; hasta: string | null }[]>,
  ]);
  const pausadosPorSede: Record<number, string[]> = {};
  for (const p of pausados) (pausadosPorSede[p.businessId] ??= []).push(p.fecha);
  const sedes = [2, 3, 1].map((id) => ({
    businessId: id,
    sede: (negocios.find((n) => n.id === id)?.name ?? `Sede ${id}`).replace(/^Yayi'?s\s+/i, ""),
    diasEsperados: DIAS_ESPERADOS[id] ?? [0, 1, 2, 3, 4, 5, 6],
    diasPausados: pausadosPorSede[id] ?? [],
    admin: admin.filter((x) => x.b === id && x.total !== null && x.total > 0).map((x) => ({ fecha: x.fecha, total: x.total as number })),
    byte: byte.filter((x) => x.b === id).map((x) => ({ fecha: x.fecha, total: x.total })),
    byteHasta: byteHasta.find((x) => x.b === id)?.hasta ?? null,
  }));
  return ventasAlDia({ mes, hoy, sedes });
}
