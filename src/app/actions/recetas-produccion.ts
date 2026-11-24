"use server";

/**
 * Producción vs Excel (Etapa 3c parte 1, 24-nov-2026). Lee las recetas de Producción por su puerta de lectura
 * (yayis-produccion /api/recetas-cash-control, clave RECETAS_SYNC_TOKEN) y las costea con los precios de
 * Cash Control. Solo mira: no guarda nada. Reglas en src/lib/recetas-produccion.ts.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { leerCatalogo } from "@/lib/catalogo-costos-sql";
import { compararRecetas, resumenComparacion, type DatosProduccion, type FilaComparacion } from "@/lib/recetas-produccion";

const sql = neon(process.env.DATABASE_URL!);
const URL_PRODUCCION = process.env.PRODUCCION_URL ?? "https://yayis-produccion.vercel.app";

export type InsumoSinPrecio = { nombre: string; recetas: number };

type R = { ok: true; filas: FilaComparacion[]; resumen: ReturnType<typeof resumenComparacion>; sinPrecio: InsumoSinPrecio[] } | { ok: false; error: string };

export async function getComparacionProduccion(): Promise<R> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  const token = process.env.RECETAS_SYNC_TOKEN;
  if (!token) return { ok: false, error: "Falta la clave para leer las recetas de Producción." };
  let datos: DatosProduccion;
  try {
    const r = await fetch(`${URL_PRODUCCION}/api/recetas-cash-control`, { headers: { "x-token": token }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, error: r.status === 401 ? "Producción no aceptó la clave." : "Producción no respondió. Intenta de nuevo." };
    datos = (await r.json()) as DatosProduccion;
  } catch (e) {
    console.error("[recetas-produccion:leer]", e);
    return { ok: false, error: "No pude conectar con Producción. Intenta de nuevo." };
  }
  try {
    const { efectivo } = await leerCatalogo(sql, 1);
    const filas = compararRecetas(datos, efectivo);
    const cuenta = new Map<string, Set<number>>();
    for (const f of filas) for (const n of f.sinPrecio) cuenta.set(n, (cuenta.get(n) ?? new Set()).add(f.recetaId));
    const sinPrecio = [...cuenta].map(([nombre, s]) => ({ nombre, recetas: s.size })).sort((a, b) => b.recetas - a.recetas || a.nombre.localeCompare(b.nombre, "es"));
    return { ok: true, filas, resumen: resumenComparacion(filas), sinPrecio };
  } catch (e) {
    console.error("[recetas-produccion:costear]", e);
    return { ok: false, error: "No pude leer los costos. Intenta de nuevo." };
  }
}
