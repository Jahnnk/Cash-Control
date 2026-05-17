import { NextResponse, type NextRequest } from "next/server";

const VALID_SCOPES = ["atelier", "fonavi", "centro", "grupo"] as const;
type Scope = typeof VALID_SCOPES[number];
type Role = "admin" | "kelly";

const BUSINESS_COOKIE = "yayis_business";
const BUSINESS_HEADER = "x-active-business";
const ROLE_COOKIE = "yayis_role";

/** Rutas públicas que NO requieren rol seleccionado. */
const PUBLIC_PATHS = ["/", "/select-business", "/acceso-denegado"];

/**
 * Endpoints API públicos que NO requieren cookie de rol. Su propia
 * autenticación va en cada route handler (ej. /api/keep-alive valida
 * KEEP_ALIVE_TOKEN). Sin esta excepción el middleware redirige a /
 * y los cron jobs externos no llegan al handler.
 */
const PUBLIC_API_PREFIXES = ["/api/keep-alive"];

/** Scopes permitidos por rol. */
function allowedScopesForRole(role: Role): Scope[] {
  if (role === "admin") return ["atelier", "fonavi", "centro", "grupo"];
  return ["fonavi", "centro", "grupo"];
}

/**
 * Middleware multi-tenant + protección por rol.
 *
 * Orden de checks:
 *   1. Si la ruta es pública (/ , /select-business, /acceso-denegado) → pasar.
 *   2. Si NO hay cookie de rol → redirect a /  (selector de rol).
 *   3. Si la URL es /[scope]/... y el rol NO permite ese scope →
 *      redirect a /acceso-denegado?scope=<scope>.
 *   4. En rutas de scope válido: inyectar header x-active-business
 *      (visible para server components/actions en esta misma request)
 *      + setear cookie business para persistencia.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Rutas públicas
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }
  // 1b. APIs públicas (autenticación propia en cada handler)
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const segment = pathname.split("/")[1];
  const isScopeRoute = VALID_SCOPES.includes(segment as Scope);

  // 2. Sin rol → al selector raíz
  const roleCookie = request.cookies.get(ROLE_COOKIE)?.value;
  const role: Role | null = roleCookie === "admin" || roleCookie === "kelly" ? roleCookie : null;
  if (!role) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 3. Rol no permite ese scope (Kelly intentando /atelier/...)
  if (isScopeRoute) {
    const allowed = allowedScopesForRole(role);
    if (!allowed.includes(segment as Scope)) {
      const url = new URL("/acceso-denegado", request.url);
      url.searchParams.set("scope", segment);
      return NextResponse.redirect(url);
    }
  }

  // 4. Inyectar header + cookie en rutas de scope
  if (isScopeRoute) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(BUSINESS_HEADER, segment);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set(BUSINESS_COOKIE, segment, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
