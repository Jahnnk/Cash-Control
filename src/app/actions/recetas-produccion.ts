"use server";

/**
 * Producción vs Excel (Etapa 3c parte 1, 24-nov-2026). Lee las recetas de Producción por su puerta de lectura
 * (yayis-produccion /api/recetas-cash-control, clave RECETAS_SYNC_TOKEN) y las costea con los precios de
 * Cash Control. No cambia ningún costo: solo guarda las parejas de nombres (parte 2, tabla
 * recetas_produccion_parejas). Reglas en src/lib/recetas-produccion.ts.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import { claveInsumo, leerArchivados, leerCatalogo } from "@/lib/catalogo-costos-sql";
import { clasificarInsumos, resumenInsumos, type Candidato, type FilaInsumo } from "@/lib/insumos-produccion";
import { compararRecetas, resumenComparacion, type DatosProduccion, type FilaComparacion, type InsumoProd, type ParejaGuardada } from "@/lib/recetas-produccion";

const sql = neon(process.env.DATABASE_URL!);
const URL_PRODUCCION = process.env.PRODUCCION_URL ?? "https://yayis-produccion.vercel.app";

export type InsumoSinPrecio = { id: number; nombre: string; base: InsumoProd["base"]; recetas: number };
/** Lo que se puede elegir como pareja: insumos y preparaciones (para insumos), productos y preparaciones (para recetas). */
export type OpcionCC = { ref: string; nombre: string; tipo: string; unidad: string; costo: number };
/** Insumos de Producción con pareja guardada, para cambiarla. */
export type InsumoEmparejado = { id: number; nombre: string; base: InsumoProd["base"]; refCC: string | null; factor: number };

type R = {
  ok: true; filas: FilaComparacion[]; resumen: ReturnType<typeof resumenComparacion>; sinPrecio: InsumoSinPrecio[];
  opciones: OpcionCC[]; insumosEmparejados: InsumoEmparejado[];
} | { ok: false; error: string };

async function leerParejas(): Promise<ParejaGuardada[]> {
  try {
    const rows = (await sql`SELECT tipo, prod_clave AS "prodClave", cc_ref AS "refCC", factor::float AS factor FROM recetas_produccion_parejas`) as ParejaGuardada[];
    return rows;
  } catch {
    return []; // antes de la migración del 24-nov-2026
  }
}

/** Lee las recetas e insumos de Producción por su puerta de lectura. */
async function leerProduccion(): Promise<{ ok: true; datos: DatosProduccion } | { ok: false; error: string }> {
  const token = process.env.RECETAS_SYNC_TOKEN;
  if (!token) return { ok: false, error: "Falta la clave para leer las recetas de Producción." };
  try {
    const r = await fetch(`${URL_PRODUCCION}/api/recetas-cash-control`, { headers: { "x-token": token }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, error: r.status === 401 ? "Producción no aceptó la clave." : "Producción no respondió. Intenta de nuevo." };
    return { ok: true, datos: (await r.json()) as DatosProduccion };
  } catch (e) {
    console.error("[recetas-produccion:leer]", e);
    return { ok: false, error: "No pude conectar con Producción. Intenta de nuevo." };
  }
}

export async function getComparacionProduccion(): Promise<R> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  const leido = await leerProduccion();
  if (!leido.ok) return leido;
  const datos = leido.datos;
  try {
    const [{ efectivo }, parejas] = await Promise.all([leerCatalogo(sql, 1), leerParejas()]);
    const filas = compararRecetas(datos, efectivo, parejas);
    const cuenta = new Map<string, Set<number>>();
    for (const f of filas) for (const n of f.sinPrecio) cuenta.set(n, (cuenta.get(n) ?? new Set()).add(f.recetaId));
    const insumoPorNombre = new Map(datos.insumos.map((i) => [i.nombre, i]));
    const sinPrecio = [...cuenta].flatMap(([nombre, s]) => {
      const i = insumoPorNombre.get(nombre);
      return i ? [{ id: i.id, nombre, base: i.base, recetas: s.size }] : [];
    }).sort((a, b) => b.recetas - a.recetas || a.nombre.localeCompare(b.nombre, "es"));
    const opciones = efectivo.map((c) => ({ ref: c.ref, nombre: c.nombre, tipo: c.tipo, unidad: c.unidad, costo: c.costo }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const insumoPorId = new Map(datos.insumos.map((i) => [String(i.id), i]));
    const insumosEmparejados = parejas.filter((p) => p.tipo === "insumo" && insumoPorId.has(p.prodClave)).map((p) => {
      const i = insumoPorId.get(p.prodClave)!;
      return { id: i.id, nombre: i.nombre, base: i.base, refCC: p.refCC, factor: p.factor };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return { ok: true, filas, resumen: resumenComparacion(filas), sinPrecio, opciones, insumosEmparejados };
  } catch (e) {
    console.error("[recetas-produccion:costear]", e);
    return { ok: false, error: "No pude leer los costos. Intenta de nuevo." };
  }
}

/**
 * Guarda (o cambia) una pareja. refCC null = «sin pareja» a propósito. Borrar = volver a la sugerencia por nombre.
 * Solo dirección; el ítem de Cash Control tiene que existir.
 */
export async function guardarParejaProduccion(input: {
  tipo: "insumo" | "receta"; prodClave: string; prodNombre: string; refCC: string | null; factor: number; borrar?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (input.tipo !== "insumo" && input.tipo !== "receta") return { ok: false, error: "Tipo inválido." };
  if (!/^\d+(-\d+)?$/.test(input.prodClave)) return { ok: false, error: "No reconozco esa receta o insumo." };
  try {
    if (input.borrar) {
      await sql`DELETE FROM recetas_produccion_parejas WHERE tipo = ${input.tipo} AND prod_clave = ${input.prodClave}`;
    } else {
      if (!(input.factor > 0) || input.factor > 100000) return { ok: false, error: "La equivalencia tiene que ser un número mayor que 0." };
      if (input.refCC) {
        const { efectivo } = await leerCatalogo(sql, 1);
        if (!efectivo.some((c) => c.ref === input.refCC || c.reemplaza === input.refCC)) return { ok: false, error: "Ese ítem ya no está en Cash Control." };
      }
      const role = await getSessionRole();
      const quien = role?.kind === "full" ? (role.nombre ?? (role.quien === "kelly" ? "Kelly" : "Jahnn")) : "Dirección";
      await sql`
        INSERT INTO recetas_produccion_parejas (tipo, prod_clave, prod_nombre, cc_ref, factor, actualizado_por)
        VALUES (${input.tipo}, ${input.prodClave}, ${input.prodNombre.slice(0, 200)}, ${input.refCC}, ${input.factor}, ${quien})
        ON CONFLICT (tipo, prod_clave) DO UPDATE SET cc_ref = EXCLUDED.cc_ref, factor = EXCLUDED.factor,
          prod_nombre = EXCLUDED.prod_nombre, actualizado_por = EXCLUDED.actualizado_por, actualizado_el = now()`;
    }
    revalidatePath("/grupo/recetas");
    return { ok: true };
  } catch (e) {
    console.error("[recetas-produccion:pareja]", e);
    return { ok: false, error: "No pude guardar. Intenta de nuevo." };
  }
}

// ─────────────────────────────────────────────────────────────────
// Paso 2 de «una sola lista de insumos» (24-nov-2026): cada insumo de Producción con su pareja de Cash Control.

export type DatosConectarInsumos = {
  filas: FilaInsumo[];
  resumen: ReturnType<typeof resumenInsumos>;
  /** Insumos y sub-recetas de Atelier para elegir otra pareja (sin los archivados). */
  opciones: Candidato[];
  /** Recetas de Producción con los insumos que llevan, para revisar receta por receta (pedido de Jahnn, 24-nov-2026). */
  recetas: { id: number; nombre: string; activa: boolean; insumos: number[] }[];
};

async function clasificar(): Promise<{ ok: true; data: DatosConectarInsumos } | { ok: false; error: string }> {
  const leido = await leerProduccion();
  if (!leido.ok) return leido;
  const [{ efectivo }, parejas, archivados] = await Promise.all([leerCatalogo(sql, 1), leerParejas(), leerArchivados(sql)]);
  const filas = clasificarInsumos(leido.datos.insumos, efectivo, parejas);
  const opciones = efectivo
    .filter((c) => (c.tipo === "insumo" && !archivados.has(claveInsumo("Atelier", c.ref))) || c.tipo === "preparacion")
    .map((c) => ({ ref: c.ref, nombre: c.nombre, tipo: c.tipo, unidad: c.unidad, costo: c.costo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const porReceta = new Map<number, Set<number>>();
  for (const g of leido.datos.ingredientes) porReceta.set(g.recetaId, (porReceta.get(g.recetaId) ?? new Set()).add(g.insumoId));
  const recetas = leido.datos.recetas
    .filter((r) => porReceta.has(r.id))
    .map((r) => ({ id: r.id, nombre: r.nombre, activa: r.activa, insumos: [...porReceta.get(r.id)!] }))
    .sort((a, b) => Number(b.activa) - Number(a.activa) || a.nombre.localeCompare(b.nombre, "es"));
  return { ok: true, data: { filas, resumen: resumenInsumos(filas), opciones, recetas } };
}

export async function getConectarInsumos(): Promise<{ ok: true; data: DatosConectarInsumos } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    return await clasificar();
  } catch (e) {
    console.error("[recetas-produccion:insumos]", e);
    return { ok: false, error: "No pude leer los insumos. Intenta de nuevo." };
  }
}

/**
 * Conecta de una vez todos los insumos con el MISMO nombre en las dos apps y unidades que calzan. Se vuelve a
 * calcular aquí (no se confía en la lista de la pantalla). Las parejas ya guardadas no se tocan.
 */
export async function conectarInsumosExactos(): Promise<{ ok: true; conectados: number } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    const r = await clasificar();
    if (!r.ok) return r;
    const exactas = r.data.filas.filter((f) => f.estado === "exacta" && f.pareja && f.factor);
    if (exactas.length === 0) return { ok: true, conectados: 0 };
    const role = await getSessionRole();
    const quien = role?.kind === "full" ? (role.nombre ?? (role.quien === "kelly" ? "Kelly" : "Jahnn")) : "Dirección";
    await sql`
      INSERT INTO recetas_produccion_parejas (tipo, prod_clave, prod_nombre, cc_ref, factor, actualizado_por)
      SELECT 'insumo', t.clave, t.nombre, t.ref, t.factor, ${quien}
      FROM unnest(${exactas.map((f) => String(f.id))}::text[], ${exactas.map((f) => f.nombre.slice(0, 200))}::text[],
                  ${exactas.map((f) => f.pareja!.ref)}::text[], ${exactas.map((f) => f.factor!)}::numeric[]) AS t(clave, nombre, ref, factor)
      ON CONFLICT (tipo, prod_clave) DO NOTHING`;
    revalidatePath("/grupo/recetas");
    return { ok: true, conectados: exactas.length };
  } catch (e) {
    console.error("[recetas-produccion:exactos]", e);
    return { ok: false, error: "No pude guardar. Intenta de nuevo." };
  }
}
