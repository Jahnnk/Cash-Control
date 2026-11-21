import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { parseUserTokenId } from "@/lib/auth-token";
import { crearPase } from "@/lib/pase";
import { URL_APPS, botonesPara, perfilDesdeScope, type ClaveApp } from "@/lib/puerta";

/**
 * GET /api/pase?app=envios · Puerta única (21-nov-2026). Desde /inicio, un clic lleva a la otra app ya con sesión:
 * firma un pase de 60 s con el correo de la cuenta y redirige a `<app>/entrar#<pase>` (lo que va tras «#» nunca
 * viaja a un servidor). Sin cuenta personal con correo (p. ej. la llave maestra), lleva al login de esa app: nunca
 * deja pasar a ciegas. Solo para las apps que la persona tiene en su inicio.
 */
const CON_PASE: ClaveApp[] = ["envios", "planilla", "produccion"];

export async function GET(request: Request) {
  const app = new URL(request.url).searchParams.get("app") as ClaveApp | null;
  if (!app || !CON_PASE.includes(app)) return NextResponse.redirect(new URL("/inicio", request.url));
  const destino = URL_APPS[app as Exclude<ClaveApp, "cash">];

  const role = await getSessionRole();
  if (!role) return NextResponse.redirect(new URL("/login", request.url));

  // ¿Quién es? Solo las cuentas personales (token v3) tienen correo.
  const token = (await cookies()).get("yayis_auth")?.value;
  const userId = parseUserTokenId(token, Math.floor(Date.now() / 1000));
  const secreto = process.env.PASE_SECRET;
  if (userId === null || !secreto) return NextResponse.redirect(destino);
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = (await sql`SELECT email, scope FROM app_users WHERE id = ${userId} AND active = true`) as { email: string | null; scope: string }[];
    const u = rows[0];
    const perfil = u ? perfilDesdeScope(u.scope) : null;
    // La app tiene que estar entre los botones de esa persona.
    if (!u?.email || !perfil || !botonesPara(perfil).some((b) => b.app === app)) return NextResponse.redirect(destino);
    const pase = await crearPase(secreto, u.email, app);
    return NextResponse.redirect(`${destino}/entrar#${pase}`);
  } catch (e) {
    console.error("[pase]", e);
    return NextResponse.redirect(destino);
  }
}
