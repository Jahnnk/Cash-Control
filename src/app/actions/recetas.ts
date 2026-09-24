"use server";

/**
 * Recetas del sistema · Actions (solo dirección: Jahnn y Kelly — decisión
 * de Jahnn, 23-sep-2026; la administradora registra mermas pero no cambia
 * costos). La lógica de costos vive en lib/recetas.ts.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole } from "@/lib/session-access";
import { leerCatalogo, type Catalogo } from "@/lib/catalogo-costos-sql";
import { erroresDeReceta, refDeReceta, type RecetaSistema } from "@/lib/recetas";
import type { DetalleReceta } from "@/lib/costos-preparaciones";

const sql = neon(process.env.DATABASE_URL!);

/** Por ahora solo Atelier (ver actions/costos-preparaciones.ts). */
const ATELIER = 1;

async function quien(): Promise<string | null> {
  const role = await getSessionRole();
  return role?.kind === "full" ? role.quien : null;
}

export async function getRecetas(): Promise<{ ok: true; catalogo: Catalogo } | { ok: false; error: string }> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  return { ok: true, catalogo: await leerCatalogo(sql, ATELIER) };
}

export type RecetaInput = {
  /** null = receta nueva. */
  id: number | null;
  nombre: string;
  tipo: RecetaSistema["tipo"];
  categoria: string | null;
  detalle: DetalleReceta;
  /** Ref del ítem del Excel que reemplaza (al modificar una receta del Excel). */
  reemplaza: string | null;
};

export async function guardarReceta(input: RecetaInput): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const autor = await quien();
  if (!autor) return { ok: false, error: "Solo dirección." };
  const detalle: DetalleReceta = {
    rendimiento: input.detalle.rendimiento && input.detalle.rendimiento > 0 ? Number(input.detalle.rendimiento) : null,
    merma: Number(input.detalle.merma) || 0,
    ingredientes: (input.detalle.ingredientes ?? []).map((i) => ({
      ref: i.ref, nombre: String(i.nombre ?? "").trim(), unidad: String(i.unidad ?? "").trim().toLowerCase(), cantidad: Number(i.cantidad),
    })),
  };
  const errores = erroresDeReceta({ nombre: input.nombre ?? "", tipo: input.tipo, detalle });
  if (errores.length > 0) return { ok: false, error: errores[0] };

  const { excel, recetas } = await leerCatalogo(sql, ATELIER);
  const refs = new Set([...excel.map((i) => i.ref), ...recetas.map((r) => refDeReceta(r.id))]);
  const faltan = detalle.ingredientes.filter((i) => !i.ref || !refs.has(i.ref));
  if (faltan.length > 0) return { ok: false, error: `"${faltan[0].nombre}" ya no está en la lista de costos. Vuelve a elegirlo.` };
  if (input.id !== null && detalle.ingredientes.some((i) => i.ref === refDeReceta(input.id!))) {
    return { ok: false, error: "Una receta no puede usarse a sí misma como ingrediente." };
  }
  const reemplaza = input.reemplaza && excel.some((i) => i.ref === input.reemplaza) ? input.reemplaza : null;
  const nombre = input.nombre.trim();
  const json = JSON.stringify(detalle);
  try {
    if (input.id === null) {
      const rows = (await sql`
        INSERT INTO recetas_sistema (business_id, nombre, tipo, categoria, detalle, reemplaza_ref, actualizado_por)
        VALUES (${ATELIER}, ${nombre}, ${input.tipo}, ${input.categoria}, ${json}::jsonb, ${reemplaza}, ${autor})
        RETURNING id
      `) as { id: number }[];
      revalidatePath("/grupo/recetas");
      return { ok: true, ref: refDeReceta(rows[0].id) };
    }
    const rows = (await sql`
      UPDATE recetas_sistema
      SET nombre = ${nombre}, tipo = ${input.tipo}, categoria = ${input.categoria}, detalle = ${json}::jsonb,
          actualizado_por = ${autor}, actualizado_el = NOW()
      WHERE id = ${input.id} AND business_id = ${ATELIER}
      RETURNING id
    `) as { id: number }[];
    if (rows.length === 0) return { ok: false, error: "Esa receta ya no existe." };
    revalidatePath("/grupo/recetas");
    return { ok: true, ref: refDeReceta(input.id) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/recetas_sistema_reemplaza_uq/.test(msg)) return { ok: false, error: "Esa receta del Excel ya tiene una versión en el sistema: edita esa." };
    if (/recetas_sistema/.test(msg) && /does not exist/.test(msg)) return { ok: false, error: "Falta crear la tabla de recetas (migración pendiente)." };
    console.error("[guardarReceta] failed:", e);
    return { ok: false, error: "No se pudo guardar la receta." };
  }
}

/**
 * Borra una receta del sistema. Si reemplazaba a una del Excel, vuelve a
 * valer la del Excel. Las mermas ya registradas guardan su costo: no cambian.
 */
export async function eliminarReceta(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  const { recetas } = await leerCatalogo(sql, ATELIER);
  const usadaPor = recetas.filter((r) => r.id !== id && r.detalle.ingredientes.some((i) => i.ref === refDeReceta(id)));
  const propia = recetas.find((r) => r.id === id);
  if (usadaPor.length > 0 && !propia?.reemplaza) {
    return { ok: false, error: `No se puede borrar: la usa "${usadaPor[0].nombre}". Quítala de esa receta primero.` };
  }
  try {
    await sql`DELETE FROM recetas_sistema WHERE id = ${id} AND business_id = ${ATELIER}`;
  } catch (e) {
    console.error("[eliminarReceta] failed:", e);
    return { ok: false, error: "No se pudo borrar la receta." };
  }
  revalidatePath("/grupo/recetas");
  return { ok: true };
}
