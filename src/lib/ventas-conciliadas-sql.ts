/**
 * Venta del mes conciliada (Byte + registro del administrador + copia de
 * Kelly), leída de la base. La usan Reportes y la meta de ventas del bono:
 * los dos tienen que hablar del MISMO total vendido.
 * No es "use server": es una ayuda interna del servidor.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  conciliarVentasDelMes, limpiarNotaKelly, METODOS_ATELIER, METODOS_CAFETERIA,
  type ConciliacionVentasMes, type FilaByte, type FilaCuentas, type FilaRegistro,
} from "@/lib/ventas-control-conciliacion";

const ATELIER = 1;

/**
 * Venta diaria de Byte (carga de cada sede) conciliada con el registro de
 * Kelly, del mes. Una sola regla para las tres sedes: ver
 * lib/ventas-control-conciliacion.ts. null = no hay nada cargado.
 *
 * Fuentes del total: archivo de Byte (byte_ventas_daily), venta que tecleó
 * el administrador en su registro diario (upselling_daily) y la copia de
 * Kelly — y se controlan entre sí.
 *
 *   · Atelier: crédito/contado de la pestaña CONTROL VENTAS
 *     (ventas_control_diario). Tolerante a que la tabla no exista.
 *   · Fonavi/Centro: Control de VTAS — efectivo, Yape y POS
 *     (byte_sales_daily), crédito y propinas (tips_pending) y las notas de
 *     Kelly (rounding_alerts / tips_pending).
 */
export async function conciliacionVentas(bId: number, startDate: string, endDate: string): Promise<ConciliacionVentasMes | null> {
  const byte = (await db.execute(sql`
    SELECT date::text AS date, pedidos::int AS pedidos, COALESCE(descuentos, 0)::float AS descuentos, total::float AS total,
           -- Subido el mismo día (hora Lima): el local podía seguir vendiendo.
           (date >= (updated_at AT TIME ZONE 'America/Lima')::date) AS parcial
    FROM byte_ventas_daily
    WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
    ORDER BY date
  `)).rows as FilaByte[];

  const registro = (await db.execute(sql`
    SELECT date::text AS date, revenue::float AS total
    FROM upselling_daily
    WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate} AND revenue > 0
  `)).rows as FilaRegistro[];

  let cuentas: FilaCuentas[] = [];
  if (bId === ATELIER) {
    try {
      const rows = (await db.execute(sql`
        SELECT date::text AS date, pedidos, descuentos::float AS descuentos, total_vendido::float AS total_vendido,
               venta_credito::float AS credito, venta_contado::float AS contado, nota
        FROM ventas_control_diario
        WHERE business_id = ${bId} AND date BETWEEN ${startDate} AND ${endDate}
      `)).rows as { date: string; pedidos: number; descuentos: number; total_vendido: number; credito: number; contado: number; nota: string | null }[];
      cuentas = rows.map((r) => ({
        date: r.date, pedidos: r.pedidos, descuentos: r.descuentos, copiaTotalByte: r.total_vendido,
        montos: { credito: r.credito, contado: r.contado }, notas: r.nota ? [r.nota] : [],
      }));
    } catch (err) {
      console.error("[conciliacionVentas] ventas_control_diario no disponible:", err);
    }
  } else {
    const rows = (await db.execute(sql`
      SELECT s.date::text AS date, s.efectivo::float AS efectivo, s.yape_plin::float AS yape, s.pos::float AS pos,
             COALESCE(s.total_pos_excel, 0)::float AS copia,
             COALESCE((SELECT SUM(t.amount) FROM tips_pending t
               WHERE t.business_id = s.business_id AND t.date = s.date AND t.imported_from_excel = true
                 AND t.source_concept = 'Ventas al Crédito'), 0)::float AS credito,
             COALESCE((SELECT SUM(t.amount) FROM tips_pending t
               WHERE t.business_id = s.business_id AND t.date = s.date AND t.imported_from_excel = true
                 AND t.source_concept <> 'Ventas al Crédito'), 0)::float AS propinas,
             ARRAY(
               SELECT a.note_text FROM rounding_alerts a
               WHERE a.business_id = s.business_id AND a.date = s.date AND a.imported_from_excel = true
               UNION ALL
               SELECT t.note_text FROM tips_pending t
               WHERE t.business_id = s.business_id AND t.date = s.date AND t.imported_from_excel = true
             ) AS notas
      FROM byte_sales_daily s
      WHERE s.business_id = ${bId} AND s.date BETWEEN ${startDate} AND ${endDate}
    `)).rows as { date: string; efectivo: number; yape: number; pos: number; copia: number; credito: number; propinas: number; notas: (string | null)[] }[];
    cuentas = rows.map((r) => ({
      date: r.date, copiaTotalByte: r.copia,
      montos: { efectivo: r.efectivo, yape: r.yape, pos: r.pos, credito: r.credito, propinas: -r.propinas },
      notas: [...new Set((r.notas ?? []).map(limpiarNotaKelly).filter((n): n is string => n !== null))],
    }));
  }

  // Meses viejos sin ninguna fuente del total (ni archivo de Byte, ni
  // registro del administrador, ni copia en el Excel): no hay contra qué
  // conciliar. Se deja el detalle anterior en vez de inventar variaciones.
  if (byte.length === 0 && registro.length === 0 && cuentas.every((c) => c.copiaTotalByte === 0)) return null;
  return conciliarVentasDelMes(byte, cuentas, bId === ATELIER ? METODOS_ATELIER : METODOS_CAFETERIA, registro);
}

