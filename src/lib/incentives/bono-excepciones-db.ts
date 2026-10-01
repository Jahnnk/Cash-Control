/**
 * Lectura de las excepciones al bono (tabla `bono_exclusiones`).
 *
 * La tabla se crea con scripts/migrations/2026-10-01-bono-exclusiones.sql. Mientras
 * no exista, todo sigue funcionando solo con la regla automática y la pantalla
 * avisa que falta crearla (`disponible: false`): un bono no puede depender de
 * que una migración ya haya corrido.
 */

import type { ReglaExcepcion } from "./elegibilidad-bono";

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<unknown>;

export async function leerExcepciones(sql: Sql, bId: number): Promise<{ disponible: boolean; reglas: ReglaExcepcion[] }> {
  try {
    const rows = (await sql`
      SELECT id::int AS id, dni, accion, desde_mes AS "desdeMes", hasta_mes AS "hastaMes", motivo
      FROM bono_exclusiones WHERE business_id = ${bId} ORDER BY desde_mes, id
    `) as ReglaExcepcion[];
    return { disponible: true, reglas: rows };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!/bono_exclusiones/.test(msg)) console.error(`[bono-excepciones] sede ${bId}:`, err);
    return { disponible: false, reglas: [] };
  }
}
