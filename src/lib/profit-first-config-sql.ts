/**
 * Lee los ajustes de Profit First (tabla profit_first_config, una sola fila).
 * Tolerante: si la tabla todavía no existe o no tiene fila, devuelve los valores por defecto
 * (25% de utilidad, EBITDA objetivo de un tercio, socios dentro de la planilla), para que las
 * pantallas funcionen aunque la migración no esté aplicada.
 */

import { CONFIG_PROFIT_FIRST, type ConfigProfitFirst } from "./regla-33";

type Sql = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

export async function leerConfigProfitFirst(sql: Sql): Promise<{ config: ConfigProfitFirst; guardable: boolean }> {
  try {
    const r = (await sql`SELECT utilidad_pct::float AS u, ebitda_pct::float AS e, socios_de_utilidad AS s FROM profit_first_config WHERE id = 1`) as { u: number; e: number; s: boolean }[];
    if (r[0]) return { config: { utilidadPct: r[0].u, ebitdaPct: r[0].e, sociosDeUtilidad: r[0].s }, guardable: true };
    return { config: CONFIG_PROFIT_FIRST, guardable: true };
  } catch {
    // La tabla no existe todavía: valores por defecto, y no se puede guardar hasta crearla.
    return { config: CONFIG_PROFIT_FIRST, guardable: false };
  }
}
