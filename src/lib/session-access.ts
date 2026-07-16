/**
 * Resolución de sesión ÚNICA para server actions.
 *
 * Antes, cada archivo de actions (incentives, kpis, verifications,
 * liquidations) re-implementaba su propio mapa scope→sede y su propio
 * switch de contraseñas. Código de seguridad duplicado = riesgo de
 * drift: un fix aplicado en una copia y olvidado en otra deja una
 * puerta abierta. Este módulo es la única fuente de verdad.
 *
 * Roles posibles:
 *   - "full"  → contraseña completa (Jahnn/Kelly): acceso total.
 *   - "admin" → administrador de sede (token v2): solo SU sede.
 *   - "verif" → verificador de mando medio (token v2): solo la firma
 *               del conteo de SU sede.
 *   - null    → sin sesión válida.
 *
 * Fail-closed: scope sin contraseña configurada en el entorno nunca
 * valida (lo garantiza verifyScopedToken).
 */

import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";
import { verifyAuthToken, verifyScopedToken, parseUserTokenId, verifyUserToken } from "./auth-token";

const AUTH_COOKIE = "yayis_auth";

/** Sede (business_id) que corresponde a cada scope de token v2. */
const SEDE_BY_SCOPE: Record<string, number> = {
  "admin-atelier": 1, // supervisora operativa (registro diario + ventas Byte)
  "admin-fonavi": 2,
  "admin-centro": 3,
  "verif-fonavi": 2,
  "verif-centro": 3,
};

/** Contraseña del entorno que firma cada scope. */
function secretForScope(scope: string): string | undefined {
  switch (scope) {
    case "admin-atelier": return process.env.ADMIN_PASSWORD_ATELIER;
    case "admin-fonavi": return process.env.ADMIN_PASSWORD_FONAVI;
    case "admin-centro": return process.env.ADMIN_PASSWORD_CENTRO;
    case "verif-fonavi": return process.env.VERIF_PASSWORD_FONAVI;
    case "verif-centro": return process.env.VERIF_PASSWORD_CENTRO;
    default: return undefined;
  }
}

export type SessionRole =
  | { kind: "full" }
  | { kind: "admin" | "verif"; sede: number }
  | null;

/**
 * Resuelve un token v3 (usuario del personal en app_users) a su rol.
 * Fail-closed en cada paso: sin fila, inactivo o firma inválida → null.
 * La firma usa el password_hash guardado: cambiar la contraseña o
 * desactivar al usuario mata sus sesiones al instante.
 */
async function resolveUserToken(token: string, now: number): Promise<SessionRole> {
  const userId = parseUserTokenId(token, now);
  if (userId === null) return null;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = (await sql`
      SELECT scope, password_hash FROM app_users
      WHERE id = ${userId} AND active = true
    `) as { scope: string; password_hash: string }[];
    if (rows.length === 0) return null;
    if (!(await verifyUserToken(token, rows[0].password_hash, now))) return null;
    const sede = SEDE_BY_SCOPE[rows[0].scope];
    if (sede === undefined) return null;
    return { kind: rows[0].scope.startsWith("admin-") ? "admin" : "verif", sede };
  } catch {
    return null; // BD caída o tabla sin migrar → fail-closed
  }
}

/**
 * Resuelve el rol de la sesión actual desde la cookie firmada.
 * No recibe la sede: el CALLER decide qué roles acepta y si la sede
 * del token coincide con la que está operando.
 */
export async function getSessionRole(): Promise<SessionRole> {
  const c = await cookies();
  const token = c.get(AUTH_COOKIE)?.value;
  const now = Math.floor(Date.now() / 1000);
  if (await verifyAuthToken(token, process.env.APP_PASSWORD, now)) {
    return { kind: "full" };
  }
  const scope = await verifyScopedToken(token, secretForScope, now);
  if (scope) {
    const sede = SEDE_BY_SCOPE[scope];
    if (sede === undefined) return null;
    return { kind: scope.startsWith("admin-") ? "admin" : "verif", sede };
  }
  // Tokens v3: usuarios del personal gestionados desde la app.
  if (token) return resolveUserToken(token, now);
  return null;
}

/** true solo con contraseña completa (Jahnn/Kelly). */
export async function requireFullSession(): Promise<boolean> {
  const role = await getSessionRole();
  return role?.kind === "full";
}
