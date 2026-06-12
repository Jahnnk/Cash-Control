import { put, del, get, issueSignedToken, presignUrl } from "@vercel/blob";

/**
 * Acceso al Blob Store PRIVADO de Vercel (yayis-adjuntos).
 *
 * Autenticación: OIDC de Vercel (VERCEL_OIDC_TOKEN + BLOB_STORE_ID, inyectadas
 * por la plataforma en los deployments) — NO usamos BLOB_READ_WRITE_TOKEN.
 * El SDK resuelve las credenciales solo; por eso estas funciones no reciben
 * token. En local sin `vercel env pull` la subida fallará: se prueba en
 * preview/producción.
 *
 * Como el store es privado, NO existen URLs públicas permanentes: la lectura
 * se hace con URLs firmadas temporales (getSignedReadUrl). En la BD se guarda
 * el PATHNAME del blob (no una URL).
 */

const SIGNED_URL_TTL_MS = 10 * 60 * 1000; // 10 minutos

export async function uploadPrivateBlob(
  pathname: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<{ pathname: string }> {
  const result = await put(pathname, body, {
    access: "private",
    contentType,
    addRandomSuffix: false, // el pathname ya incluye un uuid propio
  });
  return { pathname: result.pathname };
}

/** URL firmada de lectura, válida por 10 minutos, scoped al archivo exacto. */
export async function getSignedReadUrl(pathname: string): Promise<string> {
  const validUntil = Date.now() + SIGNED_URL_TTL_MS;
  const token = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    pathname,
    access: "private",
    validUntil,
  });
  return presignedUrl;
}

/** Borra el archivo. del() es idempotente: no falla si ya no existe. */
export async function deletePrivateBlob(pathname: string): Promise<void> {
  await del(pathname);
}

/**
 * Stream del archivo privado, leído server-side vía OIDC (sin CORS).
 * Lo usa el proxy /api/attachments/[id] para servir constancias al
 * navegador desde el MISMO origen — necesario para incrustarlas en PDFs
 * (fetch+canvas requiere CORS; el host del Blob no lo permite, aunque
 * <img> con URL firmada sí funcione para solo mostrarlas).
 */
export async function getPrivateBlobStream(
  pathname: string,
): Promise<ReadableStream | null> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return result.stream;
}
