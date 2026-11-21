"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { neon } from "@neondatabase/serverless";
import { createAuthToken, createScopedToken, createUserToken } from "@/lib/auth-token";
import { verifyPassword } from "@/lib/password-hash";
import { normalizarEmail, quienDireccion } from "@/lib/user-scopes";

const AUTH_COOKIE = "yayis_auth";
const SESSION_DAYS = 30;

/**
 * Pausa uniforme antes de responder a un intento fallido. Frena la
 * fuerza bruta (limita a ~2 intentos/seg por conexión) sin depender
 * de estado en memoria, que no sobrevive entre instancias serverless.
 * Uniforme además evita filtrar por tiempo de respuesta cuál de las
 * contraseñas (completa o con alcance) estuvo cerca de acertar.
 */
const FAILED_LOGIN_DELAY_MS = 500;

/** Cookie NO-httpOnly con el scope de la sesión (solo pista de UI). */
const SCOPE_HINT_COOKIE = "yayis_scope";

async function failedLoginDelay(): Promise<void> {
  await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
}

/** Comparación en tiempo constante de la contraseña ingresada. */
function passwordMatches(input: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(input);
  const b = enc.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Login con la contraseña compartida (APP_PASSWORD). Si es correcta,
 * setea la cookie de sesión firmada (30 días) y entra directo como Jahnn
 * al Dashboard de Grupo. La cookie es httpOnly: el cliente nunca ve el token.
 */
export async function loginWithPassword(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return {
      error:
        "Falta configurar la contraseña de la app (variable APP_PASSWORD). Avísale a Jahnn.",
    };
  }

  const input = String(formData.get("password") ?? "");
  const emailEscrito = String(formData.get("email") ?? "").trim();
  if (!input) {
    await failedLoginDelay();
    return { error: "Contraseña incorrecta. Intenta de nuevo." };
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const cookieOpts = {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };

  // 0) Puerta única (21-nov-2026): correo + contraseña de la cuenta personal. Solo se prueba ESA cuenta.
  //    Sin correo, todo sigue como antes (la contraseña sola).
  if (emailEscrito) {
    const email = normalizarEmail(emailEscrito);
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const rows = email
        ? ((await sql`SELECT id, scope, password_hash FROM app_users WHERE active = true AND lower(email) = ${email}`) as { id: number; scope: string; password_hash: string }[])
        : [];
      if (rows[0] && verifyPassword(input, rows[0].password_hash)) {
        await entrarComoUsuario(rows[0], exp, cookieOpts);
      }
    } catch (err) {
      if (err && typeof err === "object" && "digest" in err) throw err;
      console.error("[loginWithPassword] login por correo falló:", err);
    }
    await failedLoginDelay();
    return { error: "Correo o contraseña incorrectos. Intenta de nuevo." };
  }

  // 1) Contraseña completa (Jahnn/Kelly): acceso total, flujo actual.
  if (passwordMatches(input, expected)) {
    const token = await createAuthToken(expected, exp);
    const c = await cookies();
    c.set(AUTH_COOKIE, token, cookieOpts);
    // Limpia el indicador de sesión con alcance de un login anterior
    // en este navegador — si queda, el menú se esconde para Jahnn/Kelly.
    c.delete(SCOPE_HINT_COOKIE);
    // La llave maestra es la de Jahnn (Kelly tiene la suya): entra directo como Jahnn, sin el
    // selector «¿Quién está usando?» (decisión de Jahnn, 8-oct-2026). El selector sigue a un toque
    // con «Cambiar» en la barra lateral. Misma cookie y mismas opciones que selectRole.
    c.set("yayis_role", "admin", { path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60, sameSite: "lax" });
    // Puerta única (21-nov-2026): todos llegan primero a su inicio, con sus botones.
    redirect("/inicio");
  }

  // 1b) Contraseña PROPIA de Kelly (jul-2026: asume las finanzas de las
  //     3 sedes). Mismo poder de dirección, llave revocable por separado:
  //     cambiar APP_PASSWORD_KELLY solo invalida SUS sesiones. De paso
  //     aterriza directo en su rol (sin selector).
  const kellySecret = process.env.APP_PASSWORD_KELLY;
  if (kellySecret && passwordMatches(input, kellySecret)) {
    const token = await createAuthToken(kellySecret, exp);
    const c = await cookies();
    c.set(AUTH_COOKIE, token, cookieOpts);
    c.delete(SCOPE_HINT_COOKIE);
    c.set("yayis_role", "kelly", { ...cookieOpts, httpOnly: false });
    redirect("/inicio");
  }

  // 2) Contraseñas CON ALCANCE: administrador de sede (Panel de Sede) y
  //    verificador de mando medio (solo la pantalla de Verificación —
  //    la segunda firma del conteo diario). El middleware bloquea el resto.
  const scopedLogins: { scope: string; secret: string | undefined; landing: string }[] = [
    { scope: "admin-atelier", secret: process.env.ADMIN_PASSWORD_ATELIER, landing: "/atelier/panel" },
    { scope: "admin-fonavi", secret: process.env.ADMIN_PASSWORD_FONAVI, landing: "/fonavi/panel" },
    { scope: "admin-centro", secret: process.env.ADMIN_PASSWORD_CENTRO, landing: "/centro/panel" },
    { scope: "verif-fonavi", secret: process.env.VERIF_PASSWORD_FONAVI, landing: "/fonavi/verificacion" },
    { scope: "verif-centro", secret: process.env.VERIF_PASSWORD_CENTRO, landing: "/centro/verificacion" },
  ];
  for (const a of scopedLogins) {
    if (a.secret && passwordMatches(input, a.secret)) {
      const token = await createScopedToken(a.secret, a.scope, exp);
      const c = await cookies();
      c.set(AUTH_COOKIE, token, cookieOpts);
      // Indicador legible por el cliente para que el menú muestre solo
      // lo que esta sesión puede usar. NO es seguridad (eso vive en el
      // middleware y las actions): es UX. Por eso no es httpOnly.
      c.set(SCOPE_HINT_COOKIE, a.scope, { ...cookieOpts, httpOnly: false });
      // El verificador tiene una sola pantalla: va directo. El administrador, a su inicio.
      redirect(a.scope.startsWith("verif-") ? a.landing : "/inicio");
    }
  }

  // 3) Usuarios del PERSONAL (tabla app_users, gestionados por la
  //    dirección desde Grupo → Configuración). Cada persona tiene SU
  //    contraseña; la contraseña ES la identidad (no hay usuario).
  //    Se prueba contra cada usuario activo (~5 personas, scrypt ~50ms
  //    c/u). Fail-closed: tabla sin migrar o BD caída → login falla.
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const users = (await sql`
      SELECT id, scope, password_hash FROM app_users WHERE active = true
    `) as { id: number; scope: string; password_hash: string }[];
    for (const u of users) {
      if (verifyPassword(input, u.password_hash)) await entrarComoUsuario(u, exp, cookieOpts);
    }
  } catch (err) {
    // redirect() lanza NEXT_REDIRECT a propósito — debe propagarse.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("[loginWithPassword] app_users lookup failed:", err);
  }

  await failedLoginDelay();
  return { error: "Contraseña incorrecta. Intenta de nuevo." };
}

type CookieOpts = { path: string; httpOnly: boolean; secure: boolean; sameSite: "lax"; maxAge: number };

/** Abre la sesión de un usuario de app_users (token v3) y lo lleva a su pantalla. Siempre termina en redirect. */
async function entrarComoUsuario(u: { id: number; scope: string; password_hash: string }, exp: number, cookieOpts: CookieOpts): Promise<never> {
  const token = await createUserToken(u.password_hash, u.id, exp);
  const c = await cookies();
  c.set(AUTH_COOKIE, token, cookieOpts);
  try {
    await neon(process.env.DATABASE_URL!)`UPDATE app_users SET last_login = NOW() WHERE id = ${u.id}`;
  } catch { /* el login no depende de esta marca */ }
  // Cuenta personal de la dirección: igual que la llave maestra (sin pista de alcance, con su rol).
  const quien = quienDireccion(u.scope);
  if (quien) {
    c.delete(SCOPE_HINT_COOKIE);
    c.set("yayis_role", quien === "kelly" ? "kelly" : "admin", { path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60, sameSite: "lax" });
    redirect("/inicio");
  }
  c.set(SCOPE_HINT_COOKIE, u.scope, { ...cookieOpts, httpOnly: false });
  // Puerta única (21-nov-2026): todos a su inicio, salvo el verificador (una sola pantalla: va directo).
  if (u.scope.startsWith("verif-")) redirect(`/${u.scope.split("-")[1]}/verificacion`);
  redirect("/inicio");
}

/**
 * Cerrar sesión (pedido de Jahnn, 18-oct-2026): borra la sesión de ESTE dispositivo y vuelve a la pantalla de
 * contraseña. No cambia ninguna contraseña: las sesiones de otros celulares o computadoras siguen abiertas (para
 * cerrarlas todas se cambia la contraseña, ver AGENTS.md). Antes solo existía «Cambiar» (Jahnn ↔ Kelly), que no
 * sale de la app.
 */
export async function logout(): Promise<void> {
  const c = await cookies();
  c.delete(AUTH_COOKIE);
  c.delete(SCOPE_HINT_COOKIE);
  c.delete("yayis_role");
  redirect("/login");
}
