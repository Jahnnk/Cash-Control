/**
 * Puerta de lectura para la app de Producción (26-nov-2026, «conectar primero», decisión de Jahnn).
 *
 * Cash Control es el dueño de las recetas de Atelier. Las recetas en «% panadero» conectadas con una receta de
 * Producción (detalle.panadero.produccion) salen aquí con su peso de masa y sus %; Producción las copia a sus tablas
 * (su hoja y su plan siguen calculando igual). Solo LEE.
 *
 * Acceso: cabecera `x-token` igual a RECETAS_SYNC_TOKEN (la misma clave que usa Cash Control para leer Producción).
 * Ruta pública en el middleware: sin la clave responde 401.
 */

import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { recetasParaProduccion } from "@/lib/recetas-panadero";
import type { DetalleReceta } from "@/lib/costos-preparaciones";

export const dynamic = "force-dynamic";

function claveValida(dada: string | null): boolean {
  const esperada = process.env.RECETAS_SYNC_TOKEN;
  if (!esperada || !dada) return false;
  const a = Buffer.from(dada);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!claveValida(req.headers.get("x-token"))) return Response.json({ error: "Sin acceso" }, { status: 401 });
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const filas = (await sql`
      SELECT id, nombre, detalle, actualizado_por AS "por", actualizado_el AS "el"
      FROM recetas_sistema
      WHERE business_id = 1 AND (detalle -> 'panadero' ->> 'produccion') IS NOT NULL
      ORDER BY id`) as { id: number; nombre: string; detalle: DetalleReceta; por: string | null; el: string }[];
    return Response.json({ recetas: recetasParaProduccion(filas) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api:recetas-panadero]", e);
    return Response.json({ error: "No pude leer las recetas." }, { status: 500 });
  }
}
