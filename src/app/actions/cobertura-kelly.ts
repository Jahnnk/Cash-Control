"use server";

/**
 * Qué meses del Excel de Kelly están cargados · Action (solo dirección).
 * La regla de cada casilla vive en lib/cobertura-kelly.ts.
 *
 * Todo lo que se cuenta acá es lo que TRAJO el Excel (imported_from_excel):
 * un gasto cargado a mano no dice nada de si llegó el Excel de ese mes.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import type { MesKelly } from "@/lib/cobertura-kelly";
import { totalesMesSede } from "@/lib/totales-mes-sede";

const sql = neon(process.env.DATABASE_URL!);

function mesesHasta(hoy: string, n: number): string[] {
  const [y, m] = hoy.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function getCoberturaKelly(meses = 6): Promise<
  { ok: true; hoy: string; meses: string[]; celdas: MesKelly[] } | { ok: false; error: string }
> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const lista = mesesHasta(hoy, Math.min(12, Math.max(1, meses)));
  const desde = `${lista[0]}-01`;
  try {
    const [ventasCafe, gastos, ingresos, cargas, manuales] = await Promise.all([
      sql`
        SELECT business_id, to_char(date, 'YYYY-MM') AS month,
               COALESCE(SUM(total_pos_excel), 0)::float AS ventas,
               COUNT(*) FILTER (WHERE total_pos_excel > 0)::int AS dias,
               MAX(date) FILTER (WHERE total_pos_excel > 0)::text AS hasta
        FROM byte_sales_daily
        WHERE business_id IN (1, 2, 3) AND date >= ${desde} AND imported_from_excel = true
        GROUP BY 1, 2
      ` as unknown as Promise<{ business_id: number; month: string; ventas: number; dias: number; hasta: string | null }[]>,
      sql`
        SELECT business_id, to_char(date, 'YYYY-MM') AS month, SUM(amount)::float AS gastos, MAX(date)::text AS hasta
        FROM expenses
        WHERE business_id IN (1, 2, 3) AND date >= ${desde} AND imported_from_excel = true AND archived = false
        GROUP BY 1, 2
      ` as unknown as Promise<{ business_id: number; month: string; gastos: number; hasta: string }[]>,
      sql`
        SELECT business_id, to_char(date, 'YYYY-MM') AS month, MAX(date)::text AS hasta
        FROM bank_income_items
        WHERE business_id IN (1, 2, 3) AND date >= ${desde} AND imported_from_excel = true AND archived = false
        GROUP BY 1, 2
      ` as unknown as Promise<{ business_id: number; month: string; hasta: string }[]>,
      // Solo las cargas del Excel de Kelly (llevan sus pestañas en sheet_name),
      // no las de Byte ni las de incentivos, que comparten la tabla.
      sql`
        SELECT business_id, to_char(m, 'YYYY-MM') AS month,
               (MAX(imported_at) AT TIME ZONE 'America/Lima')::date::text AS cargado
        FROM import_batches ib
        CROSS JOIN LATERAL generate_series(date_trunc('month', ib.date_range_start), date_trunc('month', ib.date_range_end), interval '1 month') AS m
        WHERE ib.business_id IN (1, 2, 3) AND ib.status = 'completed' AND ib.date_range_end >= ${desde}
          AND ib.sheet_name IS NOT NULL AND (ib.sheet_name ILIKE '%ing%' OR ib.sheet_name ILIKE '%vtas%')
        GROUP BY 1, 2
      ` as unknown as Promise<{ business_id: number; month: string; cargado: string }[]>,
      sql`
        SELECT business_id, to_char(date, 'YYYY-MM') AS month, SUM(amount)::float AS gastos
        FROM expenses
        WHERE business_id IN (1, 2, 3) AND date >= ${desde} AND imported_from_excel = false AND archived = false
        GROUP BY 1, 2
      ` as unknown as Promise<{ business_id: number; month: string; gastos: number }[]>,
    ]);

    // Atelier no tiene Control de VTAS: su venta del Excel es la pestaña
    // CONTROL VENTAS (ventas_control_diario). La tabla puede no existir.
    let ventasAtelier: { month: string; ventas: number; dias: number; hasta: string | null }[] = [];
    try {
      ventasAtelier = (await sql`
        SELECT to_char(date, 'YYYY-MM') AS month, COALESCE(SUM(total_vendido), 0)::float AS ventas,
               COUNT(*) FILTER (WHERE total_vendido > 0)::int AS dias, MAX(date) FILTER (WHERE total_vendido > 0)::text AS hasta
        FROM ventas_control_diario WHERE business_id = 1 AND date >= ${desde}
        GROUP BY 1
      `) as unknown as typeof ventasAtelier;
    } catch {
      ventasAtelier = [];
    }

    // Entró / salió de cada casilla: la definición única del Resumen.
    const finDeMes = (month: string) => {
      const [y, m] = month.split("-").map(Number);
      return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    };
    const totales = new Map(
      await Promise.all(
        [2, 3, 1].flatMap((bId) => lista.map(async (month) =>
          [`${bId}|${month}`, await totalesMesSede(bId, `${month}-01`, finDeMes(month))] as const)),
      ),
    );

    const mayor = (...fs: (string | null | undefined)[]) => fs.filter((f): f is string => !!f).sort().pop() ?? null;
    const celdas: MesKelly[] = [];
    for (const businessId of [2, 3, 1]) {
      for (const month of lista) {
        const v = businessId === 1
          ? ventasAtelier.find((x) => x.month === month)
          : ventasCafe.find((x) => x.business_id === businessId && x.month === month);
        const g = gastos.find((x) => x.business_id === businessId && x.month === month);
        const i = ingresos.find((x) => x.business_id === businessId && x.month === month);
        const c = cargas.find((x) => x.business_id === businessId && x.month === month);
        celdas.push({
          businessId, month,
          ventas: Math.round((v?.ventas ?? 0) * 100) / 100,
          diasVenta: v?.dias ?? 0,
          gastos: Math.round((g?.gastos ?? 0) * 100) / 100,
          hasta: mayor(v?.hasta, g?.hasta, i?.hasta),
          cargadoEl: c?.cargado ?? null,
          gastosManuales: Math.round((manuales.find((x) => x.business_id === businessId && x.month === month)?.gastos ?? 0) * 100) / 100,
          entro: totales.get(`${businessId}|${month}`)?.entro ?? 0,
          salio: totales.get(`${businessId}|${month}`)?.salio ?? 0,
        });
      }
    }
    return { ok: true, hoy, meses: lista, celdas };
  } catch (e) {
    console.error("[getCoberturaKelly] failed:", e);
    return { ok: false, error: "No se pudo leer qué Excel están cargados." };
  }
}
