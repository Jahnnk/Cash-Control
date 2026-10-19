/**
 * Las cargas de los archivos que suben los administradores (rotación, cortesías, ventas por trabajador, ventas de
 * Byte, cobros de Atelier), por sede: de dónde sale «se subió esta semana». Lo comparten el control de cumplimiento
 * de Grupo y la verificación de datos de la reunión de los lunes (18-oct-2026): una sola lectura, una sola verdad.
 */

import { claveDesdeNota, cargaDeVentas, cargasDeCobros, type CargaRegistrada } from "./incentivos/reportes-semanales";

/** Firma mínima del template tag de @neondatabase/serverless. */
type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown> & { catch: (f: () => unknown[]) => Promise<unknown> };

export async function leerCargasPorSede(sql: SqlTag, desde: string): Promise<Map<number, CargaRegistrada[]>> {
  // De import_batches y no de los datos: Cortesías y Cambios de Precio
  // pueden venir legítimamente vacíos, y "no hubo" no es lo mismo que
  // "no lo subiste".
  const subidas = (await sql`
    SELECT business_id, notes,
           (imported_at AT TIME ZONE 'America/Lima')::date::text AS fecha
    FROM import_batches
    WHERE notes IS NOT NULL AND imported_at >= (${desde}::date - INTERVAL '60 days')
    ORDER BY imported_at DESC
    LIMIT 600
  `) as { business_id: number; notes: string | null; fecha: string }[];

  const porSede = new Map<number, CargaRegistrada[]>();
  for (const s of subidas) {
    const clave = claveDesdeNota(s.notes);
    if (!clave) continue;
    const lista = porSede.get(s.business_id) ?? [];
    lista.push({ clave, fecha: s.fecha });
    porSede.set(s.business_id, lista);
  }
  // "Ventas del mes" no deja fila en import_batches: se lee de byte_ventas_daily.
  const ventas = (await sql`
    SELECT business_id, (MAX(updated_at) AT TIME ZONE 'America/Lima')::date::text AS fecha
    FROM byte_ventas_daily WHERE source = 'import' GROUP BY business_id
  `) as { business_id: number; fecha: string | null }[];
  for (const v of ventas) {
    porSede.set(v.business_id, [...(porSede.get(v.business_id) ?? []), ...cargaDeVentas(v.fecha)]);
  }
  // Atelier: sus dos reportes de cobros (invoice_imports).
  const cobros = (await sql`
    SELECT business_id, tipo_reporte AS tipo, (MAX(creado_en) AT TIME ZONE 'America/Lima')::date::text AS fecha
    FROM invoice_imports GROUP BY business_id, tipo_reporte
  `.catch(() => [])) as { business_id: number; tipo: string; fecha: string | null }[];
  for (const c of cobros) {
    porSede.set(c.business_id, [...(porSede.get(c.business_id) ?? []), ...cargasDeCobros([c])]);
  }
  return porSede;
}
