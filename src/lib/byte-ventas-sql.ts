/**
 * Guardar la venta oficial de Byte de cada día (byte_ventas_daily).
 *
 * La comparten dos caminos: el reporte «Ventas de <MES>» (las 3 sedes) y,
 * desde el 10-oct-2026, el «Reporte de Ventas» de Atelier, que trae lo mismo
 * pedido por pedido (ver lib/atelier-reporte-ventas.ts). Un solo lugar para
 * la regla: el reporte oficial manda (source = 'import').
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

export async function guardarVentasDiarias(
  sql: Sql,
  bId: number,
  dias: { date: string; pedidos: number; descuentos: number; total: number }[],
): Promise<void> {
  for (const d of dias) {
    // El reporte oficial de Byte siempre manda (source='import').
    await sql`
      INSERT INTO byte_ventas_daily (business_id, date, pedidos, descuentos, total, source, updated_at)
      VALUES (${bId}, ${d.date}, ${d.pedidos}, ${d.descuentos}, ${d.total}, 'import', NOW())
      ON CONFLICT (business_id, date) DO UPDATE
        SET pedidos = EXCLUDED.pedidos, descuentos = EXCLUDED.descuentos,
            total = EXCLUDED.total, source = 'import', updated_at = NOW()
    `;
    if (bId === 1) {
      // Atelier: venta y pedidos SON sus KPIs diarios. El reporte
      // oficial pisa lo tecleado; las mermas (otra fuente) se respetan.
      await sql`
        INSERT INTO upselling_daily (business_id, date, personas, revenue, source, updated_at)
        VALUES (1, ${d.date}, ${d.pedidos}, ${d.total}, 'import', NOW())
        ON CONFLICT (business_id, date) DO UPDATE
          SET personas = EXCLUDED.personas, revenue = EXCLUDED.revenue,
              source = 'import', updated_at = NOW()
      `;
    }
  }
}
