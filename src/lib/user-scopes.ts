/** Roles asignables a usuarios del personal (tabla app_users).
 * La dirección (APP_PASSWORD) no está aquí a propósito: la llave
 * maestra se gestiona solo en Vercel, nunca desde la app. */

export const USER_SCOPES = [
  "admin-atelier",
  "admin-fonavi",
  "admin-centro",
  "verif-fonavi",
  "verif-centro",
] as const;

export type UserScope = (typeof USER_SCOPES)[number];

export function isUserScope(v: string): v is UserScope {
  return (USER_SCOPES as readonly string[]).includes(v);
}

/** Etiquetas en español para la pantalla de usuarios. */
export const SCOPE_LABELS: Record<UserScope, string> = {
  "admin-atelier": "Supervisora · Panel de Atelier",
  "admin-fonavi": "Administración · Panel de Fonavi",
  "admin-centro": "Administración · Panel de Centro",
  "verif-fonavi": "Verificador de conteo · Fonavi",
  "verif-centro": "Verificador de conteo · Centro",
};
