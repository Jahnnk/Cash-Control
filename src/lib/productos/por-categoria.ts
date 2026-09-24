/**
 * Candidatos a reemplazo repartidos por categoría (pedido de Jahnn,
 * 24-sep-2026). No es otro análisis: son los MISMOS candidatos de la sección
 * general, filtrados por categoría y sede, así el dashboard y el deck nunca
 * se contradicen.
 */

import type { Candidato } from "./candidatos";

const ORDEN = ["sacar", "preparar", "revisar", "confirmar"] as const;

/** Los de una categoría que se venden (o vendían) en la sede; sin los "en observación". */
export function candidatosDeCategoria(cs: Candidato[], familia: string, sede: number): Candidato[] {
  return cs
    .filter((c) => c.familia === familia && c.veredicto !== "observar" && c.sedes.some((x) => x.businessId === sede))
    .sort((a, b) => ORDEN.indexOf(a.veredicto as (typeof ORDEN)[number]) - ORDEN.indexOf(b.veredicto as (typeof ORDEN)[number]) || b.puntos - a.puntos);
}
