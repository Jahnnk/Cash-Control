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
 *   - "full"  → contraseña completa (Jahnn/Kelly): acceso total. Trae
 *               `quien` para poder FIRMAR lo que cada uno hace (los
 *               Highlights los asignan varias personas y el
 *               administrador tiene que saber de quién viene el encargo).
 *   - "admin" → administrador de sede (token v2): solo SU sede.
 *   - "verif" → verificador de mando medio (token v2): solo la firma
 *               del conteo de SU sede.
 *   - "highlight" → dirección compartida del Highlight (token v3): puede
 *               asignar y supervisar el Highlight de las tres sedes y
 *               NADA más. No ve finanzas. Es un rol acotado a propósito.
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
  | { kind: "full"; quien: "jahnn" | "kelly" }
  // `nombre` solo viene con los usuarios de la tabla app_users. Las
  // contraseñas por sede heredadas (ADMIN_PASSWORD_FONAVI) no saben
  // quién entró, así que queda undefined y quien lo use debe tener un
  // respaldo — no es un dato garantizado.
  | { kind: "admin" | "verif"; sede: number; nombre?: string }
  | { kind: "highlight"; userId: number; nombre: string }
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
      SELECT scope, password_hash, nombre FROM app_users
      WHERE id = ${userId} AND active = true
    `) as { scope: string; password_hash: string; nombre: string }[];
    if (rows.length === 0) return null;
    if (!(await verifyUserToken(token, rows[0].password_hash, now))) return null;

    // El scope de Highlight no está atado a una sede: cubre las tres.
    if (rows[0].scope === "highlight") {
      return { kind: "highlight", userId, nombre: rows[0].nombre };
    }
    const sede = SEDE_BY_SCOPE[rows[0].scope];
    if (sede === undefined) return null;
    return {
      kind: rows[0].scope.startsWith("admin-") ? "admin" : "verif",
      sede,
      nombre: rows[0].nombre,
    };
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
  // Se prueban por separado, no con un OR, para saber QUIÉN entró: la
  // firma del token dice cuál de las dos llaves lo generó.
  if (await verifyAuthToken(token, process.env.APP_PASSWORD, now)) {
    return { kind: "full", quien: "jahnn" };
  }
  if (await verifyAuthToken(token, process.env.APP_PASSWORD_KELLY, now)) {
    return { kind: "full", quien: "kelly" };
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
