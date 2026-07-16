"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { neon } from "@neondatabase/serverless";
import { createAuthToken, createScopedToken, createUserToken } from "@/lib/auth-token";
import { verifyPassword } from "@/lib/password-hash";

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
 * setea la cookie de sesión firmada (30 días) y redirige al selector
 * de rol. La cookie es httpOnly: el cliente nunca ve el token.
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

  // 1) Contraseña completa (Jahnn/Kelly): acceso total, flujo actual.
  if (passwordMatches(input, expected)) {
    const token = await createAuthToken(expected, exp);
    const c = await cookies();
    c.set(AUTH_COOKIE, token, cookieOpts);
    // Limpia el indicador de sesión con alcance de un login anterior
    // en este navegador — si queda, el menú se esconde para Jahnn/Kelly.
    c.delete(SCOPE_HINT_COOKIE);
    redirect("/");
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
      redirect(a.landing);
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
      if (verifyPassword(input, u.password_hash)) {
        const token = await createUserToken(u.password_hash, u.id, exp);
        const c = await cookies();
        c.set(AUTH_COOKIE, token, cookieOpts);
        c.set(SCOPE_HINT_COOKIE, u.scope, { ...cookieOpts, httpOnly: false });
        try {
          await sql`UPDATE app_users SET last_login = NOW() WHERE id = ${u.id}`;
        } catch { /* el login no depende de esta marca */ }
        const [kind, sede] = u.scope.split("-");
        redirect(`/${sede}/${kind === "admin" ? "panel" : "verificacion"}`);
      }
    }
  } catch (err) {
    // redirect() lanza NEXT_REDIRECT a propósito — debe propagarse.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("[loginWithPassword] app_users lookup failed:", err);
  }

  await failedLoginDelay();
  return { error: "Contraseña incorrecta. Intenta de nuevo." };
}
