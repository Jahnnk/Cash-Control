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
import { cifrasDeSede, cifrasDelGrupo, type CifrasSede, type CifrasGrupo, type FilaCifras } from "@/lib/seis-cifras";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];

export type SeisCifras = { mes: string; sedes: CifrasSede[]; grupo: CifrasGrupo };

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
      const corte = c[0]?.corte ?? null;
      const [filas, ventas, caja, rescates, cobros] = await Promise.all([
        corte
          ? sql`
              SELECT category AS categoria, amount::float AS monto,
                     (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS propio
              FROM expenses
              WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${corte} AND archived = false
                AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
                AND payment_method NOT IN ('pendiente_atelier', 'socio')
            ` as unknown as Promise<FilaCifras[]>
          : Promise.resolve([] as FilaCifras[]),
        loadVentaRowsBlended(sql, bId, inicio, hastaHoy),
        totalesMesSede(bId, inicio, hastaHoy),
        // Rescates de fondos mutuos: entran a la caja pero es plata propia que vuelve del ahorro.
        sql`
          SELECT COALESCE(SUM(amount), 0)::float AS t FROM bank_income_items
          WHERE business_id = ${bId} AND date BETWEEN ${inicio} AND ${hastaHoy} AND archived = false
            AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
            AND note ILIKE '%rescate%'
        ` as unknown as Promise<{ t: number }[]>,
        // Lo cobrado de las ventas: ingresos operativos hasta el mismo corte que ventas y gastos.
        corte ? totalesMesSede(bId, inicio, corte) : Promise.resolve(null),
      ]);
      const tope = corte ?? hastaHoy;
      const hasta = ventas.rows.filter((r) => r.date <= tope).reduce((t, r) => t + r.total, 0);
      const despues = ventas.rows.filter((r) => r.date > tope).reduce((t, r) => t + r.total, 0);
      return cifrasDeSede({
        businessId: bId, sede, mes, finDeMes, corte, filas,
        ventas: hasta > 0 ? hasta : null, ventasPosteriores: corte ? despues : 0,
        caja: { entro: caja.entro, salio: caja.salio, rescate: rescates[0]?.t ?? 0 },
        cobrado: cobros ? cobros.ingresos : null,
      });
    }));
    return { ok: true, data: { mes, sedes, grupo: cifrasDelGrupo(sedes) } };
  } catch (e) {
    console.error("[getSeisCifras] failed:", e);
    return { ok: false, error: "No se pudieron calcular las seis cifras." };
  }
}
