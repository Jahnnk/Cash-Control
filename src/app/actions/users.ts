"use server";

/**
 * Gestión de usuarios del personal (Grupo → Configuración) — SOLO
 * dirección (sesión completa). Reglas de diseño:
 *
 *  - La contraseña se GENERA (nunca la elige un humano): garantiza
 *    fuerza y evita colisiones — aquí la contraseña ES la identidad.
 *  - Se muestra UNA sola vez al crearla/renovarla; solo guardamos el
 *    hash (scrypt). No existe "ver contraseña", solo "renovar".
 *  - Inhabilitar (active=false) corta el acceso al instante: los
 *    tokens v3 se validan contra la fila en cada request.
 *  - La dirección (APP_PASSWORD) NO se gestiona aquí a propósito: la
 *    llave maestra vive solo en Vercel.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { requireFullSession } from "@/lib/session-access";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { generateStaffPassword } from "@/lib/password-generator";
import { isUserScope, type UserScope } from "@/lib/user-scopes";

const sql = neon(process.env.DATABASE_URL!);

export type AppUser = {
  id: number;
  nombre: string;
  scope: UserScope;
  active: boolean;
  createdAt: string;
  lastLogin: string | null;
};

export type UsersOverview = {
  users: AppUser[];
  /** Contraseñas heredadas por sede aún configuradas en Vercel (solo
   * presencia, nunca el valor) — para recordar borrarlas al migrar. */
  legacyEnv: { envVar: string; scope: UserScope; configured: boolean }[];
};

const NO_ACCESS = { ok: false as const, error: "La gestión de usuarios es solo para la dirección." };

export async function listUsers(): Promise<{ ok: true; data: UsersOverview } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return NO_ACCESS;
  try {
    const users = (await sql`
      SELECT id, nombre, scope, active,
             created_at::text AS "createdAt", last_login::text AS "lastLogin"
      FROM app_users ORDER BY active DESC, scope, nombre
    `) as AppUser[];
    const legacy: [string, UserScope][] = [
      ["ADMIN_PASSWORD_ATELIER", "admin-atelier"],
      ["ADMIN_PASSWORD_FONAVI", "admin-fonavi"],
      ["ADMIN_PASSWORD_CENTRO", "admin-centro"],
      ["VERIF_PASSWORD_FONAVI", "verif-fonavi"],
      ["VERIF_PASSWORD_CENTRO", "verif-centro"],
    ];
    return {
      ok: true,
      data: {
        users,
        legacyEnv: legacy.map(([envVar, scope]) => ({ envVar, scope, configured: Boolean(process.env[envVar]) })),
      },
    };
  } catch (err) {
    console.error("[listUsers] failed:", err);
    return { ok: false, error: "No pude leer los usuarios. ¿Ya corriste la migración app_users?" };
  }
}

/** La contraseña nueva no puede coincidir con NINGUNA llave existente:
 * aquí la contraseña es la identidad, una colisión daría el acceso de
 * otra persona. Con 45 bits de azar es casi imposible — se verifica
 * igual porque el costo es nada y el fallo sería gravísimo. */
async function passwordCollides(pw: string): Promise<boolean> {
  const envSecrets = [
    process.env.APP_PASSWORD,
    process.env.ADMIN_PASSWORD_ATELIER,
    process.env.ADMIN_PASSWORD_FONAVI,
    process.env.ADMIN_PASSWORD_CENTRO,
    process.env.VERIF_PASSWORD_FONAVI,
    process.env.VERIF_PASSWORD_CENTRO,
  ];
  if (envSecrets.some((s) => s && s === pw)) return true;
  const rows = (await sql`SELECT password_hash FROM app_users`) as { password_hash: string }[];
  return rows.some((r) => verifyPassword(pw, r.password_hash));
}

async function freshPassword(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const pw = generateStaffPassword();
    if (!(await passwordCollides(pw))) return pw;
  }
  throw new Error("No pude generar una contraseña única");
}

export async function createUser(input: {
  nombre: string;
  scope: string;
}): Promise<{ ok: true; id: number; password: string } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return NO_ACCESS;
  const nombre = input.nombre.trim();
  if (nombre.length < 2 || nombre.length > 60) return { ok: false, error: "Escribe el nombre de la persona (2-60 letras)." };
  if (!isUserScope(input.scope)) return { ok: false, error: "Rol inválido." };
  try {
    const password = await freshPassword();
    const rows = (await sql`
      INSERT INTO app_users (nombre, scope, password_hash)
      VALUES (${nombre}, ${input.scope}, ${hashPassword(password)})
      RETURNING id
    `) as { id: number }[];
    revalidatePath("/grupo/configuracion");
    return { ok: true, id: rows[0].id, password };
  } catch (err) {
    console.error("[createUser] failed:", err);
    return { ok: false, error: "No pude crear el usuario. ¿Ya corriste la migración app_users?" };
  }
}

export async function resetUserPassword(
  id: number,
): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return NO_ACCESS;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Usuario inválido." };
  try {
    const password = await freshPassword();
    // Cambiar el hash invalida las sesiones abiertas de esa persona al
    // instante (los tokens v3 se firman con el hash guardado).
    const rows = (await sql`
      UPDATE app_users SET password_hash = ${hashPassword(password)}, updated_at = NOW()
      WHERE id = ${id} RETURNING id
    `) as { id: number }[];
    if (rows.length === 0) return { ok: false, error: "Ese usuario no existe." };
    revalidatePath("/grupo/configuracion");
    return { ok: true, password };
  } catch (err) {
    console.error("[resetUserPassword] failed:", err);
    return { ok: false, error: "No pude renovar la contraseña." };
  }
}

export async function setUserActive(input: {
  id: number;
  active: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return NO_ACCESS;
  if (!Number.isInteger(input.id) || input.id <= 0) return { ok: false, error: "Usuario inválido." };
  try {
    const rows = (await sql`
      UPDATE app_users SET active = ${input.active}, updated_at = NOW()
      WHERE id = ${input.id} RETURNING id
    `) as { id: number }[];
    if (rows.length === 0) return { ok: false, error: "Ese usuario no existe." };
    revalidatePath("/grupo/configuracion");
    return { ok: true };
  } catch (err) {
    console.error("[setUserActive] failed:", err);
    return { ok: false, error: "No pude cambiar el estado." };
  }
}

export async function renameUser(input: {
  id: number;
  nombre: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return NO_ACCESS;
  const nombre = input.nombre.trim();
  if (!Number.isInteger(input.id) || input.id <= 0) return { ok: false, error: "Usuario inválido." };
  if (nombre.length < 2 || nombre.length > 60) return { ok: false, error: "Nombre inválido (2-60 letras)." };
  try {
    const rows = (await sql`
      UPDATE app_users SET nombre = ${nombre}, updated_at = NOW()
      WHERE id = ${input.id} RETURNING id
    `) as { id: number }[];
    if (rows.length === 0) return { ok: false, error: "Ese usuario no existe." };
    revalidatePath("/grupo/configuracion");
    return { ok: true };
  } catch (err) {
    console.error("[renameUser] failed:", err);
    return { ok: false, error: "No pude renombrar." };
  }
}
