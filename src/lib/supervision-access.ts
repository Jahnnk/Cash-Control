/**
 * Quién puede hacer qué con las supervisiones.
 *
 * Vive acá y NO en el archivo `"use server"`: todo lo que se exporta desde
 * un archivo de acciones queda publicado como endpoint llamable desde el
 * navegador, y estos helpers son de uso interno (acciones y route handler).
 *
 *   · supervisar — registrar visitas, confirmar o rechazar correcciones,
 *                  editar la lista, subir la foto del problema:
 *                  dirección completa y Juani (rol "highlight").
 *   · corregir   — marcar corregida y subir la foto de la corrección:
 *                  el administrador de ESA sede (y dirección, que a veces
 *                  opera un local). Juani no: si pudiera corregir lo que
 *                  ella misma supervisa, se confirmaría sola.
 *   · ver        — dirección, Juani y el administrador de esa sede.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole, type SessionRole } from "@/lib/session-access";
export { SEDES_SUPERVISADAS } from "@/lib/supervisiones";

const sql = neon(process.env.DATABASE_URL!);

export type AccionSupervision = "ver" | "supervisar" | "corregir";
export type TipoFotoSupervision = "supervision_problema" | "supervision_correccion";
export const TIPOS_FOTO_SUPERVISION: TipoFotoSupervision[] = ["supervision_problema", "supervision_correccion"];


export function permiteSupervision(role: SessionRole, bId: number | null, accion: AccionSupervision): boolean {
  if (!role) return false;
  if (role.kind === "full") return true;
  if (role.kind === "highlight") return accion !== "corregir";
  if (role.kind === "admin" && bId !== null && role.sede === bId) return accion !== "supervisar";
  return false;
}

/** El nombre con el que queda firmada cada acción. Nunca se teclea. */
export function nombreDeSesion(role: SessionRole): string {
  if (!role) return "—";
  if (role.kind === "full") return role.quien === "kelly" ? "Kelly" : "Jahnn";
  if (role.kind === "highlight") return role.nombre;
  if (role.kind === "admin") return role.nombre ?? "Administración";
  return "—";
}

export async function sesionPuede(bId: number | null, accion: AccionSupervision) {
  const role = await getSessionRole();
  return { ok: permiteSupervision(role, bId, accion), nombre: nombreDeSesion(role), role };
}

/** Sede dueña de una observación. null = no existe o la BD falló (fail-closed). */
export async function observacionBusinessId(id: string): Promise<number | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const rows = (await sql`SELECT business_id FROM supervision_observations WHERE id = ${id}`) as { business_id: number }[];
    return rows[0]?.business_id ?? null;
  } catch (e) {
    console.error("[observacionBusinessId] failed:", e);
    return null;
  }
}

/** Qué acción exige cada tipo de foto: la del problema es de Juani, la de la corrección del admin. */
export function accionDeFoto(tipo: TipoFotoSupervision): AccionSupervision {
  return tipo === "supervision_problema" ? "supervisar" : "corregir";
}
