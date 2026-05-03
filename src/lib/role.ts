import { cookies } from "next/headers";

/**
 * Roles del selector simple (NO es login con contraseña, es prevención
 * de errores accidentales). Si alguien usa URLs hackeadas puede entrar
 * igual — esto NO es seguridad, es UX defensiva.
 */
export type Role = "admin" | "kelly";

export const ROLE_COOKIE = "yayis_role";

/** Lee el rol activo de la cookie. Devuelve null si no hay seleccionado. */
export async function getActiveRole(): Promise<Role | null> {
  const c = await cookies();
  const v = c.get(ROLE_COOKIE)?.value;
  if (v === "admin" || v === "kelly") return v;
  return null;
}

/** Scopes permitidos por rol (NO incluye 'grupo' — se decide aparte). */
export function allowedScopesForRole(role: Role): Array<"atelier" | "fonavi" | "centro" | "grupo"> {
  if (role === "admin") return ["atelier", "fonavi", "centro", "grupo"];
  return ["fonavi", "centro", "grupo"]; // Kelly NO ve Atelier
}

/** True si el rol puede acceder a ese scope. */
export function roleAllowsScope(role: Role, scope: string): boolean {
  return (allowedScopesForRole(role) as string[]).includes(scope);
}
