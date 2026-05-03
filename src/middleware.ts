import { NextResponse, type NextRequest } from "next/server";

const VALID_SCOPES = ["atelier", "fonavi", "centro", "grupo"] as const;
const COOKIE_NAME = "yayis_business";
const HEADER_NAME = "x-active-business";

/**
 * Middleware multi-tenant.
 *
 * - Detecta el primer segmento de la URL.
 * - Si es uno de los 4 scopes (atelier, fonavi, centro, grupo):
 *   1. Setea header x-active-business en la request entrante para que
 *      las server actions y server components puedan leerlo en este
 *      mismo ciclo (no espera al próximo request).
 *   2. Setea cookie en el response para persistir entre sesiones.
 * - Si no es scope válido, no toca nada (la pantalla raíz / 404 / etc.).
 *
 * Esto reemplaza el setActiveBusinessCookie() que vivía en los layouts
 * (Next 16 prohíbe modificar cookies desde server components fuera de
 * server actions y route handlers).
 */
export function middleware(request: NextRequest) {
  const segment = request.nextUrl.pathname.split("/")[1];
  if (!VALID_SCOPES.includes(segment as typeof VALID_SCOPES[number])) {
    return NextResponse.next();
  }

  // Header inyectado en la request — disponible para esta request entera.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(HEADER_NAME, segment);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Cookie en response — persiste para futuras sesiones / refresh.
  response.cookies.set(COOKIE_NAME, segment, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return response;
}

export const config = {
  // Excluir assets estáticos y rutas internas de Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
