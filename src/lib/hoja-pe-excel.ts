/**
 * La pestaña «PE <MES>» del Excel de Kelly: ¿apunta a las hojas del mes? · lógica pura + lectura.
 *
 * Auditoría de los tres Excel de octubre (6-nov-2026): cada mes Kelly copia la pestaña PE del mes anterior y debe
 * cambiar solo 2 celdas amarillas (C3 = hoja de gastos, C4 = hoja de ventas). En Centro y Fonavi la pestaña «PE OCT26»
 * (y «PE NOV») seguía apuntando a setiembre; en Atelier apuntaba a «Ing&Gtos OCT26», una hoja que no existe (la hoja
 * se llama «Ing&Gtos OCT»), así que el equilibrio de octubre salía vacío.
 *
 * El resultado se guarda en las notas del lote («pe_estado=…», «pe_apunta=…») y lo muestra el control C9.
 */

import * as XLSX from "xlsx";
import { sheetMonthKey } from "./excel-month-pairing";

export type EstadoPe = "ok" | "otra_hoja" | "rota" | "sin_pestana";
export type PeLeido = { estado: EstadoPe; /** La hoja a la que apunta la pestaña cuando está mal. */ apunta: string | null };
/** Una pestaña PE con las dos celdas que importan. */
export type PestanaPe = { nombre: string; gastos: string | null; ventas: string | null };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** ¿Es una pestaña PE de un mes? («PE Resumen», «Categorías PE» y «Hoja…» no.) */
const esPestanaPe = (nombre: string) => /^PE\s/i.test(nombre.trim()) && !/resumen/i.test(nombre);

/**
 * Evalúa la pestaña PE del mes contra las hojas que de verdad existen.
 * `hojas` son los nombres de todas las pestañas del libro.
 */
export function evaluarPeDelMes(mes: string, pestanas: PestanaPe[], hojas: string[]): PeLeido {
  const delMes = pestanas.filter((p) => esPestanaPe(p.nombre) && sheetMonthKey(p.nombre) === mes);
  // Si hay una copia («PE SEP26_2») se prefiere la pestaña sin sufijo.
  const pe = delMes.find((p) => !/_\d+$/.test(p.nombre.trim())) ?? delMes[0];
  if (!pe) return { estado: "sin_pestana", apunta: null };
  const existentes = new Set(hojas.map(norm));
  for (const apunta of [pe.gastos, pe.ventas]) {
    if (!apunta) return { estado: "rota", apunta: null };
    if (!existentes.has(norm(apunta))) return { estado: "rota", apunta };
    if (sheetMonthKey(apunta) !== mes) return { estado: "otra_hoja", apunta };
  }
  return { estado: "ok", apunta: null };
}

/** Lee las pestañas PE del libro y las evalúa para el mes. Nunca lanza: si no se puede leer, devuelve null. */
export function peDelLibro(buf: Buffer, mes: string): PeLeido | null {
  try {
    const nombres = XLSX.read(buf, { type: "buffer", bookSheets: true }).SheetNames;
    const peNombres = nombres.filter((n) => esPestanaPe(n) && sheetMonthKey(n) === mes);
    const libro = peNombres.length ? XLSX.read(buf, { type: "buffer", sheets: peNombres }) : null;
    const texto = (hoja: string, celda: string) => {
      const v = libro?.Sheets[hoja]?.[celda]?.v;
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    return evaluarPeDelMes(mes, peNombres.map((n) => ({ nombre: n, gastos: texto(n, "C3"), ventas: texto(n, "C4") })), nombres);
  } catch (err) {
    console.error("[peDelLibro] no se pudo leer la pestaña PE (la carga sigue):", err);
    return null;
  }
}

/** Las notas del lote guardan «clave=valor» separados por coma: el nombre de la hoja va codificado. */
export function peANotas(p: PeLeido | null): string[] {
  if (!p) return [];
  return [`pe_estado=${p.estado}`, ...(p.apunta ? [`pe_apunta=${encodeURIComponent(p.apunta)}`] : [])];
}

export function peDeNotas(notas: string | null): PeLeido | null {
  const estado = notas?.match(/(?:^|[^a-z_])pe_estado=(ok|otra_hoja|rota|sin_pestana)/)?.[1] as EstadoPe | undefined;
  if (!estado) return null;
  const apunta = notas?.match(/(?:^|[^a-z_])pe_apunta=([^,\s]+)/)?.[1];
  return { estado, apunta: apunta ? decodeURIComponent(apunta) : null };
}
