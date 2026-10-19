"use server";

/**
 * ¿Llego a la reunión con los datos completos y fiables? · solo dirección (19-oct-2026).
 * Lee lo que suben los administradores para el rango del reporte y lo evalúa con lib/kpis/listo-reunion.ts.
 */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import { leerCargasPorSede } from "@/lib/cargas-semanales-sql";
import { ES_CAFETERIA, DIAS_ESPERADOS } from "@/lib/kpis/config-sedes";
import { listoParaLaReunion, type ListoReunion, type SedeEntrada } from "@/lib/kpis/listo-reunion";
import { getTodosLosDiasPausados } from "./dias-no-operativos";

const sql = neon(process.env.DATABASE_URL!);

export async function getListoParaReunion(start: string, end: string): Promise<{ ok: true; data: ListoReunion } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return { ok: false, error: "Rango inválido." };
  const hoy = getToday();
  try {
    const negocios = (await sql`SELECT id, name, system_start_date::text AS desde FROM businesses ORDER BY id`) as { id: number; name: string; desde: string | null }[];
    const [filas, byte, byteHasta, excel, cargas, pausados] = await Promise.all([
      sql`
        SELECT business_id AS b, date::text AS fecha, revenue::float AS venta, personas, nps::float AS nps, mermas_soles::float AS mermas,
               (tiempo_atencion_min IS NOT NULL OR tiempo_mesa_min IS NOT NULL) AS "conTiempos"
        FROM upselling_daily WHERE date BETWEEN ${start} AND ${end}
      ` as unknown as Promise<{ b: number; fecha: string; venta: number | null; personas: number | null; nps: number | null; mermas: number | null; conTiempos: boolean }[]>,
      sql`
        SELECT business_id AS b, date::text AS fecha, total::float AS total FROM byte_ventas_efectiva
        WHERE date BETWEEN ${start} AND ${end} AND total > 0 AND COALESCE(source, 'import') = 'import'
      ` as unknown as Promise<{ b: number; fecha: string; total: number }[]>,
      sql`
        SELECT business_id AS b, MAX(date)::text AS hasta FROM byte_ventas_efectiva
        WHERE total > 0 AND COALESCE(source, 'import') = 'import' GROUP BY 1
      ` as unknown as Promise<{ b: number; hasta: string | null }[]>,
      sql`
        SELECT business_id AS b, MAX(d)::text AS hasta FROM (
          SELECT business_id, MAX(date) AS d FROM expenses WHERE imported_from_excel = true AND archived = false AND date <= ${hoy} GROUP BY 1
          UNION ALL
          SELECT business_id, MAX(date) FROM bank_income_items WHERE imported_from_excel = true AND archived = false AND date <= ${hoy} GROUP BY 1
        ) x GROUP BY 1
      ` as unknown as Promise<{ b: number; hasta: string | null }[]>,
      leerCargasPorSede(sql as never, start),
      getTodosLosDiasPausados(start),
    ]);
    const pausadosPorSede: Record<number, string[]> = {};
    for (const p of pausados) (pausadosPorSede[p.businessId] ??= []).push(p.fecha);

    const sedes: SedeEntrada[] = [2, 3, 1].map((id) => {
      const n = negocios.find((x) => x.id === id);
      return {
        info: {
          businessId: id, sede: (n?.name ?? `Sede ${id}`).replace(/^Yayi'?s\s+/i, ""), desde: n?.desde ?? null,
          esCafeteria: ES_CAFETERIA[id] ?? true, diasPausados: pausadosPorSede[id] ?? [], diasEsperados: DIAS_ESPERADOS[id] ?? [0, 1, 2, 3, 4, 5, 6],
        },
        dias: filas.filter((f) => f.b === id).map((f) => ({ fecha: f.fecha, venta: f.venta, personas: f.personas, nps: f.nps, mermas: f.mermas, conTiempos: f.conTiempos })),
        byte: byte.filter((x) => x.b === id).map((x) => ({ fecha: x.fecha, total: x.total })),
        byteHasta: byteHasta.find((x) => x.b === id)?.hasta ?? null,
        cargas: cargas.get(id) ?? [],
        excelHasta: excel.find((x) => x.b === id)?.hasta ?? null,
      };
    });
    return { ok: true, data: listoParaLaReunion({ start, end, hoy, sedes }) };
  } catch (e) {
    console.error("[getListoParaReunion] failed:", e);
    return { ok: false, error: "No se pudo revisar si los datos están completos." };
  }
}
