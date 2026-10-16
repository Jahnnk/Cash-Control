"use server";

/**
 * Las seis cifras del dashboard de Grupo · solo dirección. El cálculo vive
 * en lib/seis-cifras.ts; aquí solo se leen los datos.
 *
 *   · Costos y gastos: las mismas filas que la cifra "salió" (igual al
 *     Excel), hasta el último día con Excel de cada sede.
 *   · Ventas: el cargador único (lib/kpis/ventas-loader.ts), hasta ese mismo día.
 *   · Caja: totalesMesSede — lo que entró y salió del mes.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";
import { totalesMesSede } from "@/lib/totales-mes-sede";
import { recuperosDelPeriodo, totalRecuperos } from "@/lib/recuperos-sql";
import { cifrasDeSede, cifrasDelGrupo, corteComun, type IngresosFuera, type CifrasSede, type CifrasGrupo, type FilaCifras } from "@/lib/seis-cifras";
import { leerConfigProfitFirst } from "@/lib/profit-first-config-sql";
import type { ConfigProfitFirst } from "@/lib/regla-33";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];

export type SeisCifras = {
  mes: string; sedes: CifrasSede[]; grupo: CifrasGrupo;
  /** Los ajustes del CEO para Profit First y la regla 33-33-33 (los de por defecto si no hay). */
  config: ConfigProfitFirst;
  /** ¿Se pueden guardar ajustes? (false = falta crear la tabla). */
  configGuardable: boolean;
};

export async function getSeisCifras(mes: string): Promise<{ ok: true; data: SeisCifras } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [y, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`;
  const finDeMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const hastaHoy = finDeMes < hoy ? finDeMes : hoy;
  try {
    const sedes = await Promise.all(SEDES.map(async ([bId, sede]) => {
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
      // Meses que se llenaron a mano (Atelier abr–jul 2026, antes del Excel): si el mes ya cerró y hay
      // movimientos, se mide hasta el último día con datos (auditoría abr–set, 16-oct-2026).
      let corteExcel = c[0]?.corte ?? null;
      const fuenteExcel = corteExcel !== null;
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
      const [ventas, caja, rescates] = await Promise.all([
        loadVentaRowsBlended(sql, bId, inicio, hastaHoy),
        totalesMesSede(bId, inicio, hastaHoy),
        // Rescates de fondos mutuos: entran a la caja pero es plata propia que vuelve del ahorro.
        sql`
          SELECT COALESCE(SUM(amount), 0)::float AS t FROM bank_income_items
          WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${hastaHoy} AND archived = false
            AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
            AND note ILIKE '%rescate%'
        ` as unknown as Promise<{ t: number }[]>,
      ]);
      // Ventas y gastos se cortan el MISMO día: el último con venta de Byte y Excel (corteComun).
      const ultimaVenta = ventas.rows.reduce<string | null>((m, r) => (r.total > 0 && (m === null || r.date > m) ? r.date : m), null);
      // En un mes CERRADO cuenta el mes completo (el último día puede ser un domingo sin venta: Atelier, 31-may,
      // dejaba fuera S/1,185 de gastos). El corte común es para el mes en curso, cuando Byte va atrasado.
      const corte = finDeMes < hoy ? corteExcel : corteComun(corteExcel, ultimaVenta);
      const principal = { ...await cifrasHasta(bId, sede, corte, corteExcel, ventas.rows, caja, rescates[0]?.t ?? 0), fuenteExcel };
      if (corte === corteExcel) return principal;
      // La franja «según el Excel» sigue llegando hasta el último día del Excel, para cuadrar con Kelly.
      return { ...principal, segunExcel: { ...await cifrasHasta(bId, sede, corteExcel, corteExcel, ventas.rows, caja, rescates[0]?.t ?? 0), fuenteExcel } };
    }));
    const { config, guardable } = await leerConfigProfitFirst(sql);
    return { ok: true, data: { mes, sedes, grupo: cifrasDelGrupo(sedes), config, configGuardable: guardable } };
  } catch (e) {
    console.error("[getSeisCifras] failed:", e);
    return { ok: false, error: "No se pudieron calcular las seis cifras." };
  }

  /** Las cifras de una sede con ventas, costos y gastos hasta `corte`. */
  async function cifrasHasta(
    bId: number, sede: string, corte: string | null, corteExcel: string | null,
    ventasRows: { date: string; total: number }[], caja: { entro: number; salio: number }, rescate: number,
  ): Promise<CifrasSede> {
      const [filas, cobros, porVentas, recup, fueraIn] = await Promise.all([
        corte
          ? sql`
              SELECT category AS categoria, concept AS concepto, amount::float AS monto,
                     (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS propio,
                     (payment_method = 'socio') AS "pagadoPorSocio"
              FROM expenses
              WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${corte} AND archived = false
                AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
                -- 'socio': gasto real que pagó el socio de su bolsillo (cuenta como gasto, no salió de la cuenta).
                AND payment_method <> 'pendiente_atelier' AND (payment_method <> 'socio' OR is_special_loan = false)
            ` as unknown as Promise<FilaCifras[]>
          : Promise.resolve([] as FilaCifras[]),
        // Lo cobrado de las ventas: ingresos operativos hasta el mismo corte que ventas y gastos.
        corte ? totalesMesSede(bId, inicio, corte) : Promise.resolve(null),
        // Lo que entró POR VENTAS: las filas con Grupo «Ventas» del Excel (is_byte_sale), hasta el corte.
        corte
          ? sql`
              SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::float AS t FROM bank_income_items
              WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${corte} AND archived = false AND is_byte_sale = true
                AND is_fonavi_reimbursement = false AND is_special_loan = false AND is_internal_transfer = false
                AND non_operative_category IS NULL
            ` as unknown as Promise<{ n: number; t: number }[]>
          : Promise.resolve([] as { n: number; t: number }[]),
        corte ? recuperosDelPeriodo(sql as never, bId, inicio, corte) : Promise.resolve({ recuperos: [], deGastos: [] }),
        // Lo que entró sin ser de la operación, por tipo (conciliación del mes). Mismo filtro que «entró».
        corte
          ? sql`
              SELECT
                COALESCE(SUM(amount) FILTER (WHERE is_fonavi_reimbursement), 0)::float AS "devolucionesSedes",
                COALESCE(SUM(amount) FILTER (WHERE NOT is_fonavi_reimbursement AND (non_operative_category ILIKE '%pr_stamo%' OR is_special_loan)), 0)::float AS prestamos,
                COALESCE(SUM(amount) FILTER (WHERE NOT is_fonavi_reimbursement AND NOT is_special_loan AND non_operative_category IS NOT NULL
                  AND non_operative_category NOT ILIKE '%pr_stamo%' AND (note ILIKE '%rescate%' OR note ILIKE '%fondos mutuos%')), 0)::float AS rescates,
                COALESCE(SUM(amount) FILTER (WHERE NOT is_fonavi_reimbursement AND NOT is_special_loan AND non_operative_category IS NOT NULL
                  AND non_operative_category NOT ILIKE '%pr_stamo%' AND NOT (note ILIKE '%rescate%' OR note ILIKE '%fondos mutuos%')), 0)::float AS otros
              FROM bank_income_items
              WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${corte} AND archived = false
                AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
            ` as unknown as Promise<IngresosFuera[]>
          : Promise.resolve([] as IngresosFuera[]),
      ]);
      const devGastos = totalRecuperos(recup.deGastos);
      const tope = corte ?? hastaHoy;
      const hasta = ventasRows.filter((r) => r.date <= tope).reduce((t, r) => t + r.total, 0);
      const despues = ventasRows.filter((r) => r.date > tope).reduce((t, r) => t + r.total, 0);
      return cifrasDeSede({
        businessId: bId, sede, mes, finDeMes, corte, corteExcel, filas,
        ventas: hasta > 0 ? hasta : null, ventasPosteriores: corte ? despues : 0,
        caja: { entro: caja.entro, salio: caja.salio, rescate },
        // Las devoluciones de personas restan del gasto: dejan de ser «otros ingresos».
        cobrado: cobros ? Math.round((cobros.ingresos - devGastos) * 100) / 100 : null,
        ingresadoVentas: porVentas[0]?.n ? porVentas[0].t : null,
        recuperos: recup.recuperos.map((r) => ({ categoria: r.categoria, monto: r.monto, concepto: r.nota })),
        ingresosFuera: fueraIn[0] ? { ...fueraIn[0], devolucionesGastos: devGastos } : undefined,
      });
  }
}
