"use server";

/**
 * Resumen B2B de Atelier para el dashboard de Grupo.
 *
 * POR QUÉ EXISTE (pedido de Jahnn, 10-ago-2026): el dashboard de Grupo
 * traía enteras las secciones de "Clientes de Atelier" y "Cuentas por
 * cobrar" — ranking completo, tabla de deudores, documento por
 * documento. Es información correcta pero de OPERACIÓN, no de
 * dirección: para decidir, Jahnn necesita tres números, no 36 filas.
 *
 * Este action devuelve solo esos tres números con agregados baratos.
 * El detalle completo se carga aparte, solo si Jahnn lo abre — así el
 * dashboard no paga el costo de traer datos que casi nunca mira.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { getToday } from "@/lib/utils";

const sql = neon(process.env.DATABASE_URL!);

const ATELIER = 1;

/** Mismo umbral que la pantalla de cobranza (decisión de Jahnn). */
const DIAS_PARA_ATRASO = 8;

const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

export type AtelierB2BResumen = {
  hayDatos: boolean;
  /** Cobranza */
  hayCobranza: boolean;
  porCobrar: number;
  porCobrarDocs: number;
  atrasado: number;
  atrasadoDocs: number;
  /** Ventas a clientes externos del último reporte semanal */
  hayClientes: boolean;
  ventaClientes: number;
  variacionPct: number | null;
  clientesExternos: number;
  periodoFin: string | null;
};

const VACIO: AtelierB2BResumen = {
  hayDatos: false,
  hayCobranza: false, porCobrar: 0, porCobrarDocs: 0, atrasado: 0, atrasadoDocs: 0,
  hayClientes: false, ventaClientes: 0, variacionPct: null, clientesExternos: 0,
  periodoFin: null,
};

export async function getAtelierB2BResumen(): Promise<AtelierB2BResumen> {
  const role = await getSessionRole();
  const puede = role?.kind === "full" || (role?.kind === "admin" && role.sede === ATELIER);
  if (!puede) return VACIO;

  const hoy = getToday();

  // Cobranza y clientes viven en tablas distintas y cualquiera de las
  // dos puede faltar (migración sin correr, o Luis aún no subió nada).
  // Se consultan por separado para que una vacía no tumbe a la otra.
  let cobranza = { hay: false, porCobrar: 0, docs: 0, atrasado: 0, atrasadoDocs: 0 };
  try {
    const [c] = (await sql`
      SELECT
        COALESCE(SUM(total), 0)::float                                       AS por_cobrar,
        COUNT(*)::int                                                        AS docs,
        COALESCE(SUM(total) FILTER (WHERE fecha <= ${hoy}::date - ${DIAS_PARA_ATRASO}::int), 0)::float AS atrasado,
        COUNT(*) FILTER (WHERE fecha <= ${hoy}::date - ${DIAS_PARA_ATRASO}::int)::int                  AS atrasado_docs
      FROM invoice_documents
      WHERE business_id = ${ATELIER}
        AND estado_cuota = 'PENDIENTE'
        AND estado_factura IS DISTINCT FROM 'ANULADO'
    `) as { por_cobrar: number; docs: number; atrasado: number; atrasado_docs: number }[];
    cobranza = {
      hay: (c?.docs ?? 0) > 0,
      porCobrar: r2(c?.por_cobrar ?? 0),
      docs: c?.docs ?? 0,
      atrasado: r2(c?.atrasado ?? 0),
      atrasadoDocs: c?.atrasado_docs ?? 0,
    };
  } catch (e) {
    console.error("[getAtelierB2BResumen] cobranza:", e);
  }

  let clientes = { hay: false, ventas: 0, variacion: null as number | null, n: 0, fin: null as string | null };
  try {
    // Solo las dos últimas semanas: la actual y con qué comparar.
    // OJO: `total_clientes` del snapshot cuenta TODAS las filas, sedes
    // incluidas. Acá interesa cuántos clientes de AFUERA compraron, así
    // que se cuentan las filas con es_sede = false.
    const snaps = (await sql`
      SELECT s.periodo_fin::text AS fin,
             s.ventas_externas::float AS externas,
             (SELECT COUNT(*)::int FROM client_sales_rows r
               WHERE r.snapshot_id = s.id AND r.es_sede = false) AS externos
      FROM client_sales_snapshots s
      WHERE s.business_id = ${ATELIER}
      ORDER BY s.periodo_fin DESC
      LIMIT 2
    `) as { fin: string; externas: number; externos: number }[];

    if (snaps.length > 0) {
      const act = snaps[0];
      const ant = snaps[1];
      clientes = {
        hay: true,
        ventas: r2(act.externas),
        variacion:
          ant && ant.externas > 0
            ? r2(((act.externas - ant.externas) / ant.externas) * 100)
            : null,
        n: act.externos,
        fin: act.fin,
      };
    }
  } catch (e) {
    console.error("[getAtelierB2BResumen] clientes:", e);
  }

  return {
    hayDatos: cobranza.hay || clientes.hay,
    hayCobranza: cobranza.hay,
    porCobrar: cobranza.porCobrar,
    porCobrarDocs: cobranza.docs,
    atrasado: cobranza.atrasado,
    atrasadoDocs: cobranza.atrasadoDocs,
    hayClientes: clientes.hay,
    ventaClientes: clientes.ventas,
    variacionPct: clientes.variacion,
    clientesExternos: clientes.n,
    periodoFin: clientes.fin,
  };
}
