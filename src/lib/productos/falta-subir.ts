/**
 * Lo que falta subir de una sede, en palabras (puro). Sale de las casillas de
 * cobertura (cobertura-rotacion.ts): «julio (sin reporte)», «agosto (faltan 30
 * y 31 ago)», «octubre (en curso, del 1 a ayer)». Lo completo y lo que está al
 * día en el mes en curso no se pide.
 */

import type { CeldaCobertura } from "./cobertura-rotacion";

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const largo = (m: string) => MESES_LARGOS[Number(m.slice(5, 7)) - 1];

export function faltaDeSede(celdas: CeldaCobertura[], hoy: string): string[] {
  return celdas.flatMap((c) => {
    if (c.estado === "completo" || c.estado === "en-curso") return [];
    const enCurso = c.month === hoy.slice(0, 7);
    if (c.estado === "vacio") return [enCurso ? `${largo(c.month)} (en curso, del 1 a ayer)` : `${largo(c.month)} (sin reporte)`];
    return [`${largo(c.month)} (faltan ${c.faltan ?? "días"})`];
  });
}
