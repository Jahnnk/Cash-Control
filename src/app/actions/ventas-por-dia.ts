"use server";

/**
 * Ventas día por día del mes, por sede · solo dirección y llave de lectura (pedido de Jahnn, 1-nov-2026).
 * El total de cada día sale del cargador único de ventas (el mismo de todo el Dashboard); los pedidos y descuentos,
 * del reporte oficial de Byte (byte_ventas_efectiva) en los días que lo trae.
 */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";
import type { EntradaSedeDia } from "@/lib/dashboard-ventas-dia";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];

export async function getVentasPorDia(mes: string): Promise<{ ok: true; entradas: EntradaSedeDia[] } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  const [y, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`;
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  try {
    const entradas = await Promise.all(SEDES.map(async ([businessId, sede]): Promise<EntradaSedeDia> => {
      const { rows } = await loadVentaRowsBlended(sql, businessId, inicio, fin);
      let detalle: EntradaSedeDia["detalle"] = [];
      try {
        detalle = (await sql`
          SELECT date::text AS date, pedidos::int AS pedidos, COALESCE(descuentos, 0)::float AS descuentos
          FROM byte_ventas_efectiva
          WHERE business_id = ${businessId} AND date BETWEEN ${inicio} AND ${fin} AND total > 0
            AND COALESCE(source, 'import') = 'import'
        `) as EntradaSedeDia["detalle"];
      } catch { /* tabla pendiente de migración: queda solo el total */ }
      return { businessId, sede, rows, detalle };
    }));
    return { ok: true, entradas };
  } catch (e) {
    console.error("[getVentasPorDia] failed:", e);
    return { ok: false, error: "No se pudieron leer las ventas por día." };
  }
}
