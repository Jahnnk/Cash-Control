/**
 * La lista de productos para anotar mermas en una cafetería (14-nov-2026). Lógica pura.
 *
 * En octubre de 2026, 46 mermas de Fonavi y Centro no se pudieron cargar a un producto porque el nombre se escribía a
 * mano («IMG 550g», «mixta», «CARROT»). La lista ofrece los nombres tal como los conoce el sistema:
 *   · lo que la sede vende (nombres de Byte, sin la marca «[ELIMINADO …]» ni los ajustes de caja), y
 *   · lo que Atelier manda a las cafeterías (líneas «Y-», sin el prefijo): pan de molde, ciabatta, bases…
 * Sin duplicados (un mismo producto escrito con y sin tilde cuenta una vez; gana el nombre de la sede).
 */

import { esAjuste, esLineaEliminada, nombreLimpio } from "./panorama";
import { clave, esParaCafeterias } from "./cruce-atelier";

export function listaParaMermas(deLaSede: string[], deAtelier: string[]): string[] {
  const porClave = new Map<string, string>();
  const agregar = (nombre: string) => {
    const limpio = nombre.replace(/\s+/g, " ").trim();
    const k = clave(limpio);
    if (k && !esAjuste(limpio) && !porClave.has(k)) porClave.set(k, limpio.toUpperCase());
  };
  for (const n of deLaSede) if (!esLineaEliminada(n)) agregar(nombreLimpio(n));
  for (const n of deAtelier) if (!esLineaEliminada(n) && esParaCafeterias(n)) agregar(nombreLimpio(n).replace(/^\s*Y\s*-\s*/i, ""));
  return [...porClave.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** ¿El nombre escrito es uno de la lista? (sin tildes, mayúsculas ni «de», «con»). */
export function estaEnLaLista(nombre: string, lista: string[]): boolean {
  const k = clave(nombre);
  return !!k && lista.some((n) => clave(n) === k);
}
