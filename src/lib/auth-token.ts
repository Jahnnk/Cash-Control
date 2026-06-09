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
