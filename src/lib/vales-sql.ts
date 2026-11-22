/**
 * Lectura de vales de consumo. La comparten la página pública del vale
 * (/vale/[codigo]) y las acciones de canje, para que las dos vean lo mismo.
 *
 * Resiliente pre-migración: sin la tabla `vales_consumo` devuelve
 * "sin-tabla" en vez de reventar.
 */

import { neon } from "@neondatabase/serverless";
import { estadoEfectivo, type EstadoGuardado, type ItemVale } from "./vales";

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

/** Por qué un vale NO se puede canjear ahora (null = sí se puede). Mensajes para el cajero o el encargado. */
export function motivoNoCanjeable(v: ValeFila, hoy: string): string | null {
  const e = estadoEfectivo(v, hoy);
  if (e === "emitido") return null;
  if (e === "canjeado") {
    return `Este vale YA FUE CANJEADO${v.canjeadoEn ? ` el ${v.canjeadoEn}` : ""}${v.canjeadoPor ? ` (${v.canjeadoPor})` : ""}. No se puede usar otra vez.`;
  }
  if (e === "vencido") return `Este vale VENCIÓ el ${v.venceEl.split("-").reverse().join("/")}.`;
  return "Este vale fue ANULADO por dirección.";
}

/**
 * El candado real del canje: UN solo UPDATE que solo pasa si el vale SIGUE emitido y vigente en este
 * instante. Si dos personas lo intentan a la vez, Postgres deja pasar a una sola. Lo usan el canje del
 * encargado (con sesión) y el de caja (con PIN), para que las dos puertas cierren igual.
 */
export async function ejecutarCanje(
  codigo: string,
  businessId: number,
  quien: string,
): Promise<{ ok: true; vale: ValeFila } | { ok: false; error: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    UPDATE vales_consumo
    SET estado = 'canjeado', canjeado_en = now(), canjeado_por = ${quien}
    WHERE codigo = ${codigo}
      AND business_id = ${businessId}
      AND estado = 'emitido'
      AND vence_el >= (now() AT TIME ZONE 'America/Lima')::date
    RETURNING id::text
  `) as { id: string }[];

  const despues = await buscarVale(codigo);
  if (!despues || despues === "sin-tabla") return { ok: false, error: "No pude confirmar el canje. Revisa el vale." };
  if (rows.length === 1) return { ok: true, vale: despues };
  // No pasó: alguien se adelantó, o venció / se anuló en este instante.
  return { ok: false, error: motivoNoCanjeable(despues, hoyLima()) ?? "No pude canjear el vale. Reintenta." };
}
