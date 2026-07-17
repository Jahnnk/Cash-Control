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

/** Scopes permitidos por rol. Desde jul-2026 Kelly también lleva las
 * finanzas de Atelier (acuerdo de reunión) — ambos roles ven todo;
 * el selector queda como prevención de errores, no como restricción. */
export function allowedScopesForRole(role: Role): Array<"atelier" | "fonavi" | "centro" | "grupo"> {
  void role;
  return ["atelier", "fonavi", "centro", "grupo"];
}

/** True si el rol puede acceder a ese scope. */
export function roleAllowsScope(role: Role, scope: string): boolean {
  return (allowedScopesForRole(role) as string[]).includes(scope);
}
