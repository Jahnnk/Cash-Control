"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthToken, createScopedToken } from "@/lib/auth-token";

const AUTH_COOKIE = "yayis_auth";
const SESSION_DAYS = 30;

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
    redirect("/");
  }

  // 2) Contraseñas de ADMINISTRADOR DE SEDE: sesión con alcance que
  //    solo abre /[su-sede]/panel (el middleware bloquea el resto).
  const adminScopes: { scope: string; sede: string; secret: string | undefined }[] = [
    { scope: "admin-fonavi", sede: "fonavi", secret: process.env.ADMIN_PASSWORD_FONAVI },
    { scope: "admin-centro", sede: "centro", secret: process.env.ADMIN_PASSWORD_CENTRO },
  ];
  for (const a of adminScopes) {
    if (a.secret && passwordMatches(input, a.secret)) {
      const token = await createScopedToken(a.secret, a.scope, exp);
      const c = await cookies();
      c.set(AUTH_COOKIE, token, cookieOpts);
      redirect(`/${a.sede}/panel`);
    }
  }

  return { error: "Contraseña incorrecta. Intenta de nuevo." };
}
