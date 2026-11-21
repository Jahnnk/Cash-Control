/**
 * Pase de un clic (puerta única, Etapa 2, 21-nov-2026). Cash Control firma un pase corto que dice «esta persona (su
 * correo) entra a ESTA app»; la otra app (Envíos, Planilla o Producción) lo verifica con la misma clave compartida
 * (PASE_SECRET) y abre su propia sesión para la cuenta con ese correo. El mismo archivo vive en cada app.
 *
 * Formato: `p1.<datos>.<firma>` (base64url). Datos = { e: correo, a: app destino, x: vence (segundos) }.
 * Dura 60 segundos y solo sirve para la app que nombra. Usa Web Crypto: corre igual en Node y en el borde.
 */

export const DURACION_PASE_S = 60;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const desdeB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function firmar(secreto: string, datos: string): Promise<string> {
  const clave = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", clave, enc.encode(datos))));
}

/** Comparación que no delata la firma por el tiempo que tarda. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function crearPase(secreto: string, email: string, app: string, ahora = Math.floor(Date.now() / 1000)): Promise<string> {
  const datos = b64url(enc.encode(JSON.stringify({ e: email.trim().toLowerCase(), a: app, x: ahora + DURACION_PASE_S })));
  return `p1.${datos}.${await firmar(secreto, `p1.${datos}`)}`;
}

/** El correo del pase si es válido, para ESTA app y no venció. null en cualquier otro caso (fail-closed). */
export async function verificarPase(secreto: string | undefined, pase: string, app: string, ahora = Math.floor(Date.now() / 1000)): Promise<string | null> {
  if (!secreto || secreto.length < 16) return null;
  const partes = pase.trim().split(".");
  if (partes.length !== 3 || partes[0] !== "p1") return null;
  try {
    if (!iguales(partes[2], await firmar(secreto, `p1.${partes[1]}`))) return null;
    const d = JSON.parse(new TextDecoder().decode(desdeB64url(partes[1]))) as { e?: unknown; a?: unknown; x?: unknown };
    if (d.a !== app || typeof d.x !== "number" || d.x < ahora || d.x > ahora + DURACION_PASE_S + 5) return null;
    return typeof d.e === "string" && d.e.includes("@") ? d.e : null;
  } catch {
    return null;
  }
}
