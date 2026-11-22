/**
 * Lectura de vales de consumo. La comparten la página pública del vale
 * (/vale/[codigo]) y las acciones de canje, para que las dos vean lo mismo.
 *
 * Resiliente pre-migración: sin la tabla `vales_consumo` devuelve
 * "sin-tabla" en vez de reventar.
 */

import { neon } from "@neondatabase/serverless";
import type { EstadoGuardado, ItemVale } from "./vales";

export type ValeFila = {
  id: string;
  codigo: string;
  businessId: number;
  sede: string;
  items: ItemVale[];
  valorCarta: number;
  para: string | null;
  venceEl: string;
  estado: EstadoGuardado;
  emitidoPor: string;
  /** Ya formateadas para mostrar, hora de Lima: «22/11/2026 15:04». */
  emitidoEn: string;
  canjeadoPor: string | null;
  canjeadoEn: string | null;
  anuladoMotivo: string | null;
};

type Fila = {
  id: string; codigo: string; business_id: number; sede: string; items: ItemVale[];
  valor_carta: number; para: string | null; vence_el: string; estado: EstadoGuardado;
  emitido_por: string; emitido_en: string; canjeado_por: string | null; canjeado_en: string | null;
  anulado_motivo: string | null;
};

export function aValeFila(r: Fila): ValeFila {
  return {
    id: r.id, codigo: r.codigo, businessId: r.business_id, sede: r.sede, items: r.items,
    valorCarta: r.valor_carta, para: r.para, venceEl: r.vence_el, estado: r.estado,
    emitidoPor: r.emitido_por, emitidoEn: r.emitido_en, canjeadoPor: r.canjeado_por,
    canjeadoEn: r.canjeado_en, anuladoMotivo: r.anulado_motivo,
  };
}

/** ¿El error es "la tabla no existe" (migración pendiente)? */
export function faltaTablaVales(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return m.includes("vales_consumo") && /does not exist|no existe/i.test(m);
}

/** Hoy en Lima (YYYY-MM-DD). El vale vale hasta su día de vencimiento, hora de Lima. */
export function hoyLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** Un vale por su código ya normalizado. null = no existe. */
export async function buscarVale(codigo: string): Promise<ValeFila | null | "sin-tabla"> {
  const sql = neon(process.env.DATABASE_URL!);
  try {
    const rows = (await sql`
      SELECT v.id::text, v.codigo, v.business_id, b.name AS sede, v.items,
             v.valor_carta::float AS valor_carta, v.para, v.vence_el::text AS vence_el, v.estado,
             v.emitido_por, to_char(v.emitido_en AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI') AS emitido_en, v.canjeado_por,
             to_char(v.canjeado_en AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI') AS canjeado_en, v.anulado_motivo
      FROM vales_consumo v
      JOIN businesses b ON b.id = v.business_id
      WHERE v.codigo = ${codigo}
    `) as Fila[];
    return rows.length === 0 ? null : aValeFila(rows[0]);
  } catch (e) {
    if (faltaTablaVales(e)) return "sin-tabla";
    throw e;
  }
}
