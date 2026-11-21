/** Roles asignables a usuarios del personal (tabla app_users).
 * Desde el 21-nov-2026 (puerta única, decisión de Jahnn) la dirección también tiene cuenta personal: «direccion-jahnn»
 * y «direccion-kelly» dan el mismo acceso total que la llave maestra. La llave maestra (APP_PASSWORD) sigue en Vercel
 * solo para emergencias. */

export const USER_SCOPES = [
  "direccion-jahnn",
  "direccion-kelly",
  "admin-atelier",
  "admin-fonavi",
  "admin-centro",
  "verif-fonavi",
  "verif-centro",
  // Dirección compartida del Highlight y las supervisiones: asigna el
  // Highlight de las tres sedes y registra las visitas de supervisión,
  // sin ver nada financiero. Es de Juani (socia), que supervisa los
  // locales una o dos veces por semana.
  "highlight",
  // Solo lectura (18-oct-2026): para herramientas externas como Muse (Meta) que entran a MIRAR el
  // Dashboard de Grupo y Reportes. No puede guardar, subir ni borrar nada. Se apaga con un clic.
  "lector",
  // Acuerdos y tareas (19-nov-2026): coordinadora de marketing, socias. Ve todos los acuerdos, crea y
  // asigna tareas; sin acceso financiero.
  "equipo",
] as const;

export type UserScope = (typeof USER_SCOPES)[number];

export function isUserScope(v: string): v is UserScope {
  return (USER_SCOPES as readonly string[]).includes(v);
}

/** Etiquetas en español para la pantalla de usuarios. */
export const SCOPE_LABELS: Record<UserScope, string> = {
  "direccion-jahnn": "Dirección · Jahnn (acceso total)",
  "direccion-kelly": "Dirección · Kelly (acceso total)",
  "admin-atelier": "Administración · Panel de Atelier",
  "admin-fonavi": "Administración · Panel de Fonavi",
  "admin-centro": "Administración · Panel de Centro",
  "verif-fonavi": "Verificador de conteo · Fonavi",
  "verif-centro": "Verificador de conteo · Centro",
  highlight: "Highlight y supervisiones · 3 sedes (sin acceso financiero)",
  equipo: "Acuerdos y tareas · ve, crea y asigna (sin acceso financiero)",
  lector: "Solo lectura · Dashboard de Grupo y Reportes (no puede cambiar nada)",
};

/** Cuenta personal de la dirección → quién es (mismo acceso que la llave maestra). null = no es de dirección. */
export function quienDireccion(scope: string): "jahnn" | "kelly" | null {
  return scope === "direccion-jahnn" ? "jahnn" : scope === "direccion-kelly" ? "kelly" : null;
}

/** Correo válido y normalizado (minúsculas, sin espacios). null = vacío o mal escrito. */
export function normalizarEmail(v: string | null | undefined): string | null {
  const e = (v ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120 ? e : null;
}
