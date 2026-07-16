/**
 * Hash de contraseñas del personal (scrypt de node:crypto).
 *
 * Formato guardado: `s1.<salt hex>.<hash hex>` — la contraseña en claro
 * NUNCA se guarda ni se puede recuperar; solo reemplazar. Solo corre en
 * server actions (runtime Node); el middleware nunca hashea, solo
 * verifica firmas HMAC con el hash ya guardado.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const VERSION = "s1";
const KEYLEN = 32;
// Parámetros scrypt: N=16384 (2^14), r=8, p=1 — ~50ms por verificación.
// Suficiente contra fuerza bruta offline sin volver lento el login
// (que prueba contra cada usuario activo del equipo, ~5 personas).
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, SCRYPT_OPTS);
  return `${VERSION}.${salt.toString("hex")}.${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    if (salt.length !== 16 || expected.length !== KEYLEN) return false;
    const hash = scryptSync(password, salt, KEYLEN, SCRYPT_OPTS);
    return timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}
