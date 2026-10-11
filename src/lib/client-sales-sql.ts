/**
 * Guardar un snapshot del ranking de clientes de Atelier
 * (client_sales_snapshots + client_sales_rows).
 *
 * Lo comparten el reporte «Ventas por Cliente» de Byte y, desde el
 * 10-oct-2026, el «Reporte de Ventas» de Atelier (semana por semana, ver
 * lib/atelier-reporte-ventas.ts). Reimportar el mismo rango lo reemplaza.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { ClientSalesRow } from "./client-sales-parser";

type Sql = NeonQueryFunction<false, false>;

const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

export async function guardarSnapshotClientes(
  sql: Sql,
  bId: number,
  filas: ClientSalesRow[],
  periodo: { inicio: string; fin: string },
  archivo: string | null,
): Promise<{ reemplazo: boolean }> {
  const ventas = r2(filas.reduce((s, f) => s + f.totalVentas, 0));
  const ventasSedes = r2(filas.filter((f) => f.esSede).reduce((s, f) => s + f.totalVentas, 0));

  const previo = await sql`
    SELECT id FROM client_sales_snapshots
    WHERE business_id = ${bId} AND periodo_inicio = ${periodo.inicio} AND periodo_fin = ${periodo.fin}
  `;
  const reemplazo = previo.length > 0;

  // Reimportar el mismo rango reemplaza: se borra el snapshot anterior
  // (las filas caen por ON DELETE CASCADE) y se vuelve a insertar.
  if (reemplazo) {
    await sql`DELETE FROM client_sales_snapshots WHERE id = ${previo[0].id}`;
  }

  const [snap] = await sql`
    INSERT INTO client_sales_snapshots
      (business_id, periodo_inicio, periodo_fin, archivo,
       total_ventas, total_pedidos, total_clientes, ventas_externas, ventas_sedes)
    VALUES (${bId}, ${periodo.inicio}, ${periodo.fin}, ${archivo},
            ${ventas}, ${filas.reduce((s, f) => s + f.totalPedidos, 0)}, ${filas.length},
            ${r2(ventas - ventasSedes)}, ${ventasSedes})
    RETURNING id
  `;

  for (const f of filas) {
    await sql`
      INSERT INTO client_sales_rows
        (snapshot_id, documento, tipo_doc, cliente, es_sede, sede_id,
         total_pedidos, con_comprobante, sin_comprobante,
         total_ventas, ticket_promedio, primera_compra, ultima_compra)
      VALUES (${snap.id}, ${f.documento}, ${f.tipoDoc}, ${f.cliente.trim()},
              ${f.esSede}, ${f.sedeId},
              ${f.totalPedidos}, ${f.conComprobante}, ${f.sinComprobante},
              ${f.totalVentas}, ${f.ticketPromedio}, ${f.primeraCompra}, ${f.ultimaCompra})
    `;
  }
  return { reemplazo };
}
