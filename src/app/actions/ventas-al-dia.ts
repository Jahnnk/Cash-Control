"use server";

/**
 * Ventas al día según los administradores · solo dirección (19-oct-2026).
 * Lee lo que anota cada administrador en su Panel de Sede y lo contrasta con el reporte de Byte que sube Jahnn.
 * La lógica está en lib/kpis/ventas-al-dia.ts.
 */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import { DIAS_ESPERADOS } from "@/lib/kpis/config-sedes";
import { ventasAlDia, type VentasAlDia } from "@/lib/kpis/ventas-al-dia";
import { getTodosLosDiasPausados } from "./dias-no-operativos";

const sql = neon(process.env.DATABASE_URL!);

export async function getVentasAlDia(mes: string): Promise<{ ok: true; data: VentasAlDia } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  const [y, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`;
  const fin = `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  try {
    const [negocios, admin, byte, byteHasta, pausados] = await Promise.all([
      sql`SELECT id, name FROM businesses ORDER BY id` as unknown as Promise<{ id: number; name: string }[]>,
      // Lo que anotó el administrador: Atelier en venta_admin; las cafeterías, el registro diario (si no vino del reporte de Byte).
      sql`
        SELECT business_id AS b, date::text AS fecha,
               COALESCE(venta_admin, CASE WHEN COALESCE(source, 'manual') <> 'import' THEN revenue END)::float AS total
        FROM upselling_daily WHERE date BETWEEN ${inicio} AND ${fin}
      ` as unknown as Promise<{ b: number; fecha: string; total: number | null }[]>,
      sql`
        SELECT business_id AS b, date::text AS fecha, total::float AS total FROM byte_ventas_efectiva
        WHERE date BETWEEN ${inicio} AND ${fin} AND total > 0 AND COALESCE(source, 'import') = 'import'
      ` as unknown as Promise<{ b: number; fecha: string; total: number }[]>,
      sql`
        SELECT business_id AS b, MAX(date)::text AS hasta FROM byte_ventas_efectiva
        WHERE total > 0 AND COALESCE(source, 'import') = 'import' GROUP BY 1
      ` as unknown as Promise<{ b: number; hasta: string | null }[]>,
      getTodosLosDiasPausados(inicio),
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
    return { ok: true, data: ventasAlDia({ mes, hoy: getToday(), sedes }) };
  } catch (e) {
    console.error("[getVentasAlDia] failed:", e);
    return { ok: false, error: "No se pudieron leer las ventas anotadas." };
  }
}
