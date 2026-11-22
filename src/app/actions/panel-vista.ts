"use server";

/**
 * ¿Esta sesión puede usar «Ver como administrador» en el Panel de Sede? Solo la dirección (llave maestra).
 * Es una vista: no da ni quita permisos (cada action sigue revisando la sesión real).
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";

const sql = neon(process.env.DATABASE_URL!);

export async function puedeVerComoAdmin(): Promise<boolean> {
  const role = await getSessionRole();
  return role?.kind === "full";
}

const SEDE_SCOPE: Record<number, string> = { 1: "admin-atelier", 2: "admin-fonavi", 3: "admin-centro" };
const NEGOCIO_SCOPE: Record<string, string> = { atelier: "admin-atelier", fonavi: "admin-fonavi", centro: "admin-centro" };

/** El primer administrador activo de la sede (para el saludo con la contraseña heredada o «Ver como administrador»). */
async function adminDeSede(scope: string): Promise<string | null> {
  try {
    const rows = (await sql`SELECT nombre FROM app_users WHERE active AND scope = ${scope} ORDER BY id LIMIT 1`) as { nombre: string }[];
    return rows[0]?.nombre ?? null;
  } catch {
    return null;
  }
}

/**
 * A quién saluda el Panel de Sede («¡Buenos días, Sol!», 20-nov-2026). Con «Ver como administrador», la dirección
 * ve el saludo del administrador de esa sede. null = saludo sin nombre.
 */
export async function getNombreSaludo(comoAdminDe?: string): Promise<string | null> {
  const role = await getSessionRole();
  if (!role) return null;
  if (role.kind === "full") {
    const scope = comoAdminDe ? NEGOCIO_SCOPE[comoAdminDe] : undefined;
    if (scope) return adminDeSede(scope);
    if (role.finanzas && role.nombre) return role.nombre;
    return role.quien === "kelly" ? "Kelly" : "Jahnn";
  }
  if (role.kind === "admin") return role.nombre ?? adminDeSede(SEDE_SCOPE[role.sede] ?? "");
  if (role.kind === "highlight" || role.kind === "equipo" || role.kind === "lector") return role.nombre;
  return null;
}
