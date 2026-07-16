/**
 * Token de sesión firmado para la autenticación por contraseña compartida.
 *
 * Formato: `v1.<exp>.<firma>` donde:
 *   - exp    = epoch en segundos en que expira la sesión
 *   - firma  = HMAC-SHA256 hex de `v1.<exp>` usando APP_PASSWORD como clave
 *
 * Usa Web Crypto (crypto.subtle) para funcionar tanto en el middleware
 * (Edge runtime) como en server actions (Node). Firmar con la propia
 * contraseña tiene una propiedad útil: cambiar APP_PASSWORD invalida
 * todas las sesiones activas al instante.
 */

const VERSION = "v1";

async function hmacHex(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparación en tiempo constante (evita timing attacks sobre la firma). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createAuthToken(
  secret: string,
  expEpochSeconds: number,
): Promise<string> {
  const payload = `${VERSION}.${expEpochSeconds}`;
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyAuthToken(
  token: string | undefined | null,
  secret: string | undefined,
  nowEpochSeconds: number,
): Promise<boolean> {
  // Sin contraseña configurada → fail-closed (nadie entra sin APP_PASSWORD).
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= nowEpochSeconds) return false;
  const expected = await hmacHex(`${VERSION}.${parts[1]}`, secret);
  return timingSafeEqual(parts[2], expected);
}

// ─────────────────────────────────────────────────────────────────
// Tokens CON ALCANCE (v2) — sesiones de administrador de sede.
// Formato: `v2.<exp>.<scope>.<firma>`, firmado con la contraseña de
// ESE alcance (ej. ADMIN_PASSWORD_FONAVI). Cambiar la contraseña de un
// admin invalida solo sus sesiones. El scope viaja en el payload y la
// firma lo protege contra manipulación. Fail-closed: scope sin
// contraseña configurada nunca valida.
// ─────────────────────────────────────────────────────────────────

const V2 = "v2";

export async function createScopedToken(
  secret: string,
  scope: string,
  expEpochSeconds: number,
): Promise<string> {
  const payload = `${V2}.${expEpochSeconds}.${scope}`;
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * Verifica un token v2 y devuelve su scope, o null si no es válido.
 * `secretForScope` entrega la contraseña correspondiente al scope
 * declarado en el payload.
 */
export async function verifyScopedToken(
  token: string | undefined | null,
  secretForScope: (scope: string) => string | undefined,
  nowEpochSeconds: number,
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== V2) return null;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= nowEpochSeconds) return null;
  const scope = parts[2];
  const secret = secretForScope(scope);
  if (!secret) return null;
  const expected = await hmacHex(`${V2}.${parts[1]}.${scope}`, secret);
  return timingSafeEqual(parts[3], expected) ? scope : null;
}

// ─────────────────────────────────────────────────────────────────
// Tokens POR PERSONA (v3) — usuarios del personal gestionados en la
// tabla app_users (jul-2026). Formato: `v3.<exp>.<userId>.<firma>`,
// firmado con el password_hash GUARDADO de ese usuario. Propiedades:
//   - Cambiar la contraseña (nuevo hash) invalida sus sesiones al acto.
//   - Desactivar al usuario: el caller no encuentra fila activa → fuera.
// El flujo es en dos pasos porque verificar requiere buscar el hash en
// la BD: parseUserTokenId() da el id sin validar firma; el caller trae
// la fila (active, scope, password_hash) y llama verifyUserToken().
// ─────────────────────────────────────────────────────────────────

const V3 = "v3";

export async function createUserToken(
  passwordHash: string,
  userId: number,
  expEpochSeconds: number,
): Promise<string> {
  const payload = `${V3}.${expEpochSeconds}.${userId}`;
  const sig = await hmacHex(payload, passwordHash);
  return `${payload}.${sig}`;
}

/** Extrae el userId de un token v3 SIN verificar la firma (para poder
 * buscar el hash). Valida forma y expiración; null si no es v3. */
export function parseUserTokenId(
  token: string | undefined | null,
  nowEpochSeconds: number,
): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== V3) return null;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= nowEpochSeconds) return null;
  const id = Number(parts[2]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function verifyUserToken(
  token: string,
  passwordHash: string,
  nowEpochSeconds: number,
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== V3 || !passwordHash) return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= nowEpochSeconds) return false;
  const expected = await hmacHex(`${V3}.${parts[1]}.${parts[2]}`, passwordHash);
  return timingSafeEqual(parts[3], expected);
}
